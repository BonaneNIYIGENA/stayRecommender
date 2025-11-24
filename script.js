// ============================================================================
// GLOBAL STATE
// ============================================================================
let rawHotelData = [];
let currentDestinationData = null;
let hotelDetailsCache = {};
let destCache = {};

// ============================================================================
// CACHE UTILITIES
// ============================================================================
const CACHE_TTL_MS = 1000 * 60 * 60; // 1 hour
const CACHE_KEYS = {
    lastSearch: 'sr_lastSearch',
    hotelPrefix: 'sr_hotel_'
};

function saveToLocalCache(key, value) {
    try {
        const wrapped = { __cachedAt: Date.now(), value };
        localStorage.setItem(key, JSON.stringify(wrapped));
    } catch (e) {
        console.warn('Could not save to local cache', e);
    }
}

function loadFromLocalCache(key, maxAge = CACHE_TTL_MS) {
    try {
        const raw = localStorage.getItem(key);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed || !parsed.__cachedAt) return null;
        if (Date.now() - parsed.__cachedAt > maxAge) {
            localStorage.removeItem(key);
            return null;
        }
        return parsed.value;
    } catch (e) {
        console.warn('Could not read from local cache', e);
        return null;
    }
}

// ============================================================================
// UI HELPER FUNCTIONS
// ============================================================================
function clearErrors() {
    document.querySelectorAll('.error-message').forEach(el => {
        el.classList.add('hidden');
    });
    document.querySelectorAll('input, select').forEach(el => {
        el.classList.remove('error-border');
    });
}

function showInlineError(fieldId, message) {
    const errorEl = document.getElementById(`${fieldId}-error`);
    const inputEl = document.getElementById(fieldId);

    if (errorEl) {
        errorEl.innerText = message;
        errorEl.classList.remove('hidden');
    }
    if (inputEl) {
        inputEl.classList.add('error-border');
    }
}

function closeModal() {
    document.getElementById('hotel-details-modal').classList.add('hidden');
}

function getFacilityIcon(name) {
    if (!name) return '';
    const n = name.toLowerCase();
    if (n.includes('parking')) return '🅿️';
    if (n.includes('pool')) return '🏊';
    if (n.includes('wifi') || n.includes('wi-fi')) return '📶';
    if (n.includes('restaurant') || n.includes('food')) return '🍽️';
    if (n.includes('fitness') || n.includes('gym')) return '💪';
    if (n.includes('spa') || n.includes('sauna')) return '🧖';
    if (n.includes('air condition')) return '❄️';
    if (n.includes('breakfast')) return '🍳';
    return '✓';
}

// ============================================================================
// DATE UTILITIES
// ============================================================================
function toApiDate(dateStr) {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return null;
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

// ============================================================================
// API FUNCTIONS
// ============================================================================

// Get Destination ID
async function getDestinationID(city) {
    const key = city.trim().toLowerCase();
    if (destCache[key]) return destCache[key];

    const url = `https://${API_HOST}/api/v1/hotels/searchDestination?query=${encodeURIComponent(city)}`;
    const options = {
        method: 'GET',
        headers: {
            'X-RapidAPI-Key': API_KEY,
            'X-RapidAPI-Host': API_HOST
        }
    };

    try {
        const response = await fetch(url, options);
        if (!response.ok) {
            if (response.status === 429) {
                console.warn('Destination API rate limited (429)');
            }
            return null;
        }

        const result = await response.json();
        if (result && result.data && result.data.length > 0) {
            destCache[key] = result.data[0];
            return result.data[0];
        }
        return null;
    } catch (error) {
        console.error('Error fetching destination:', error);
        return null;
    }
}

// Search Hotels
async function searchHotels(destId, searchType, checkin, checkout) {
    const url = `https://${API_HOST}/api/v1/hotels/searchHotels?dest_id=${destId}&search_type=${searchType}&arrival_date=${checkin}&departure_date=${checkout}&adults=1&room_qty=1&page_number=1&units=metric&temperature_unit=c&languagecode=en-us&currency_code=USD`;

    try {
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'X-RapidAPI-Key': API_KEY,
                'X-RapidAPI-Host': API_HOST
            }
        });

        if (!response.ok) {
            console.error('Search Hotels API failed:', response.status);
            return null;
        }

        const result = await response.json();
        return result.data && result.data.hotels ? result.data.hotels : [];
    } catch (error) {
        console.error('Error searching hotels:', error);
        return null;
    }
}

// Get Hotel Details
async function fetchHotelDetails(hotelId, arrivalDate, departureDate) {
    const url = `https://${API_HOST}/api/v1/hotels/getHotelDetails?hotel_id=${hotelId}&arrival_date=${arrivalDate}&departure_date=${departureDate}&adults=1&room_qty=1&units=metric&languagecode=en-us&currency_code=USD`;

    try {
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'X-RapidAPI-Key': API_KEY,
                'X-RapidAPI-Host': API_HOST
            }
        });

        if (!response.ok) {
            if (response.status === 429) {
                console.warn('Hotel Details API rate limited (429)');
                const cached = loadFromLocalCache(CACHE_KEYS.hotelPrefix + hotelId);
                if (cached) return cached;
            }
            return null;
        }

        const result = await response.json();
        const payload = (result && result.data) ? result.data : result;
        
        if (payload) {
            saveToLocalCache(CACHE_KEYS.hotelPrefix + hotelId, payload);
        }
        
        return payload;
    } catch (error) {
        console.error('Error fetching hotel details:', error);
        return null;
    }
}

// Get Hotel Photos
async function getHotelPhotos(hotelId) {
    if (window.hotelPhotosCache && window.hotelPhotosCache[hotelId]) {
        return window.hotelPhotosCache[hotelId];
    }

    try {
        const cached = loadFromLocalCache(CACHE_KEYS.hotelPrefix + 'photos_' + hotelId);
        if (cached && Array.isArray(cached) && cached.length > 0) {
            if (!window.hotelPhotosCache) window.hotelPhotosCache = {};
            window.hotelPhotosCache[hotelId] = cached;
            return cached;
        }
    } catch (e) {
        console.warn('Error reading cached photos', e);
    }

    const url = `https://${API_HOST}/api/v1/hotels/getHotelPhotos?hotel_id=${hotelId}`;
    
    try {
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'X-RapidAPI-Key': API_KEY,
                'X-RapidAPI-Host': API_HOST
            }
        });

        if (!response.ok) return [];

        const result = await response.json();
        const photos = result.data && Array.isArray(result.data) ? result.data : [];
        const normalized = photos.map(p => 
            p.url_max750 || p.url_original || p.url_max300 || p.url_max1280
        ).filter(Boolean);

        if (!window.hotelPhotosCache) window.hotelPhotosCache = {};
        window.hotelPhotosCache[hotelId] = normalized;
        saveToLocalCache(CACHE_KEYS.hotelPrefix + 'photos_' + hotelId, normalized);
        
        return normalized;
    } catch (error) {
        console.error('Error fetching hotel photos:', error);
        return [];
    }
}

// Extract photos from hotel details payload
function extractPhotosFromDetails(data) {
    if (!data) return [];
    const urls = [];

    // Top-level photos array
    if (Array.isArray(data.photos) && data.photos.length > 0) {
        data.photos.forEach(p => {
            if (!p) return;
            if (typeof p === 'string') {
                urls.push(p);
            } else {
                urls.push(p.url_max750 || p.url_original || p.url_max300 || p.url_max1280);
            }
        });
    }

    // rawData.photoUrls
    if (data.rawData && Array.isArray(data.rawData.photoUrls)) {
        data.rawData.photoUrls.forEach(u => { if (u) urls.push(u); });
    }

    // Room photos
    if (data.rooms && typeof data.rooms === 'object') {
        Object.values(data.rooms).forEach(room => {
            if (room && Array.isArray(room.photos)) {
                room.photos.forEach(p => {
                    if (!p) return;
                    if (typeof p === 'string') {
                        urls.push(p);
                    } else {
                        urls.push(p.url_max750 || p.url_original || p.url_max300 || p.url_max1280);
                    }
                });
            }
        });
    }

    // Deduplicate
    const seen = new Set();
    const out = [];
    urls.forEach(u => { 
        if (u && !seen.has(u)) { 
            seen.add(u); 
            out.push(u); 
        } 
    });
    
    return out;
}

// ============================================================================
// MAIN SEARCH FUNCTION
// ============================================================================
async function initialSearch() {
    const cityInput = document.getElementById('cityInput').value.trim();
    const checkin = document.getElementById('checkinDate').value;
    const checkout = document.getElementById('checkoutDate').value;

    const container = document.getElementById('hotel-container');
    const loading = document.getElementById('loading');
    
    // Validation
    clearErrors();
    let isValid = true;
    
    if (!cityInput) { 
        showInlineError('cityInput', "⚠️ Destination is required."); 
        isValid = false; 
    }
    if (!checkin) { 
        showInlineError('checkinDate', "⚠️ Check-in date is required."); 
        isValid = false; 
    }
    if (!checkout) { 
        showInlineError('checkoutDate', "⚠️ Check-out date is required."); 
        isValid = false; 
    }
    
    const date1 = new Date(checkin);
    const date2 = new Date(checkout);
    if (checkin && checkout && date1 >= date2) {
        showInlineError('checkoutDate', "⚠️ Must be after check-in date.");
        isValid = false;
    }
    
    if (!isValid) { 
        document.getElementById('results-controls').classList.add('hidden');
        return; 
    }

    // Show loading
    container.innerHTML = '';
    loading.classList.remove('hidden');
    document.getElementById('results-controls').classList.add('hidden');

    // Get destination
    const destination = await getDestinationID(cityInput);
    
    if (!destination) {
        loading.classList.add('hidden');
        showInlineError('cityInput', `Could not find "${cityInput}". Try a different name.`);
        return;
    }

    currentDestinationData = destination;

    // Search hotels
    const hotels = await searchHotels(
        destination.dest_id,
        destination.search_type,
        checkin,
        checkout
    );

    loading.classList.add('hidden');

    if (!hotels) {
        showInlineError('cityInput', "🛑 Failed to fetch hotel data. Check your API configuration.");
        return;
    }

    rawHotelData = hotels;
    document.getElementById('results-controls').classList.remove('hidden');
    reRenderHotels();

    // Cache the search
    saveToLocalCache(CACHE_KEYS.lastSearch, { 
        rawHotelData, 
        currentDestinationData 
    });
}

// ============================================================================
// RENDER HOTELS
// ============================================================================
function reRenderHotels() {
    const container = document.getElementById('hotel-container');
    const sortOrder = document.getElementById('sortOrder').value;

    let hotels = [...rawHotelData];

    // Sort
    hotels.sort((a, b) => {
        const propA = a.property;
        const propB = b.property;

        if (sortOrder === 'price') {
            const priceA = propA.priceBreakdown?.grossPrice?.value || Infinity;
            const priceB = propB.priceBreakdown?.grossPrice?.value || Infinity;
            return priceA - priceB;
        } else if (sortOrder === 'class_descending') {
            const classA = propA.propertyClass || 0;
            const classB = propB.propertyClass || 0;
            return classB - classA;
        } else {
            const scoreA = propA.reviewScore || 0;
            const scoreB = propB.reviewScore || 0;
            return scoreB - scoreA;
        }
    });

    // Render
    container.innerHTML = '';

    if (hotels.length === 0) {
        container.innerHTML = `<div style="grid-column: 1/-1; text-align: center;"><h3>No hotels found.</h3></div>`;
        return;
    }

    hotels.forEach((hotel, index) => {
        const name = hotel.property.name || 'Unknown Hotel';
        const hotelId = hotel.property.id;
        const image = hotel.property.photoUrls?.[0] || 'https://via.placeholder.com/400x300?text=No+Image';

        const priceBreakdown = hotel.property.priceBreakdown;
        const priceVal = priceBreakdown?.grossPrice?.value || null;
        const currency = priceBreakdown?.grossPrice?.currency || '';
        const priceDisplay = priceVal !== null ? `${currency} ${priceVal.toFixed(2)}` : 'Check Site';

        const rating = hotel.property.reviewScore || 'New';
        const stars = hotel.property.propertyClass || 0;

        const safeName = name.replace(/'/g, "\\'");

        const card = document.createElement('div');
        card.className = 'hotel-card';
        card.style.animationDelay = `${index * 0.05}s`;
        card.innerHTML = `
            <img src="${image}" alt="${name}" class="hotel-img">
            <div class="hotel-info">
                <div class="location">📍 ${currentDestinationData.city_name}</div>
                <div class="hotel-name">${name}</div>
                <div>
                    <span class="rating-badge">Score: ${rating}</span>
                    <span style="font-size:0.9rem; color:#666;">| ${'⭐'.repeat(stars) || 'Unrated'}</span>
                </div>
                <div class="price-tag">${priceDisplay}</div>
                <button class="search-btn" style="margin-top:15px; font-size:14px; padding:8px 15px;" onclick="viewHotelDetails(${hotelId}, '${safeName}')">View Details</button>
            </div>
        `;
        container.appendChild(card);
    });
}

// ============================================================================
// HOTEL DETAILS MODAL
// ============================================================================
async function viewHotelDetails(hotelId, hotelName) {
    const modal = document.getElementById('hotel-details-modal');
    const modalName = document.getElementById('modal-hotel-name');
    const modalBody = document.getElementById('modal-details-body');

    modalName.innerText = `Loading ${hotelName}...`;
    modalBody.innerHTML = '<div class="spinner" style="margin: 20px auto;"></div>';
    modal.classList.remove('hidden');

    const checkin = document.getElementById('checkinDate').value;
    const checkout = document.getElementById('checkoutDate').value;

    if (!checkin || !checkout) {
        modalName.innerText = `Error`;
        modalBody.innerHTML = `<p style='color:var(--error-text);'>Please select check-in and check-out dates.</p>`;
        return;
    }

    const arrival = toApiDate(checkin);
    const departure = toApiDate(checkout);

    if (!arrival || !departure) {
        modalName.innerText = `Error`;
        modalBody.innerHTML = `<p style="color:var(--error-text);">Invalid dates.</p>`;
        return;
    }

    // Try cache first
    try {
        const cachedHotel = loadFromLocalCache(CACHE_KEYS.hotelPrefix + hotelId);
        if (cachedHotel) {
            renderHotelModal(cachedHotel, hotelId);
            // Refresh in background
            fetchHotelDetails(hotelId, arrival, departure).then(fresh => {
                if (fresh) {
                    renderHotelModal(fresh, hotelId);
                }
            });
            return;
        }
    } catch (e) {
        console.warn('Error reading cached details', e);
    }

    // Fetch fresh data
    const hotelData = await fetchHotelDetails(hotelId, arrival, departure);

    if (!hotelData) {
        modalName.innerText = `Unable to load ${hotelName}`;
        modalBody.innerHTML = `
            <p style="color:var(--error-text);">Details couldn't be retrieved. The API may be rate-limited.</p>
            <p style="text-align:center;"><button id="retry-details" class="search-btn" style="padding:8px 16px;">Retry</button></p>
        `;

        document.getElementById('retry-details')?.addEventListener('click', async () => {
            modalName.innerText = `Loading ${hotelName}...`;
            modalBody.innerHTML = '<div class="spinner" style="margin: 20px auto;"></div>';
            const data = await fetchHotelDetails(hotelId, arrival, departure);
            if (data) {
                renderHotelModal(data, hotelId);
            } else {
                modalBody.innerHTML = `<p style="color:var(--error-text);">Still no data. Try again later.</p>`;
            }
        });
        return;
    }

    renderHotelModal(hotelData, hotelId);
}

// Render Modal Content
async function renderHotelModal(data, hotelId) {
    const modalName = document.getElementById('modal-hotel-name');
    const modalBody = document.getElementById('modal-details-body');

    if (!data) {
        modalName.innerText = 'Details Unavailable';
        modalBody.innerHTML = `<p style="color:var(--error-text);">Hotel details could not be loaded.</p>`;
        document.getElementById('modal-booking-link').href = '#';
        return;
    }

    modalName.innerText = data.hotel_name || 'Hotel Details';
    document.getElementById('modal-booking-link').href = data.url || '#';

    // Get photos
    let photos = extractPhotosFromDetails(data);
    if (!photos.length) {
        photos = await getHotelPhotos(hotelId);
    }

    // Build gallery
    const galleryHTML = photos.length > 0 ? `
        <div class="gallery">
            <div class="gallery-main">
                <img id="modal-main-img" src="${photos[0]}" alt="Hotel photo">
            </div>
            <div class="gallery-thumbs">
                ${photos.map((p, i) => `
                    <div class="thumb" data-src="${p}">
                        <img src="${p}" alt="thumb-${i}">
                    </div>
                `).join('')}
            </div>
        </div>
    ` : `
        <div class="gallery">
            <div class="gallery-main gallery-placeholder">
                <div class="placeholder-content">
                    <svg width="80" height="80" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <rect x="3" y="3" width="18" height="18" rx="2" stroke="#ccc" stroke-width="1.5"/>
                        <circle cx="8.5" cy="8.5" r="1.5" fill="#ccc"/>
                        <path d="M3 15l4-4 4 4 6-6 4 4v5H3v-3z" fill="#e0e0e0"/>
                    </svg>
                    <p>No Images Available</p>
                </div>
            </div>
        </div>
    `;

    // Get facilities
    let facilities = [];
    if (data.facilities_block?.facilities) {
        facilities = data.facilities_block.facilities.map(f => f.name);
    } else if (data.property_highlight_strip) {
        facilities = data.property_highlight_strip.map(f => f.name);
    }

    // Build info card
    const address = `${data.address || 'N/A'}, ${data.city_name_en || ''}, ${data.country_trans || ''}`;
    const price = data.product_price_breakdown?.gross_amount_hotel_currency 
        ? `${data.product_price_breakdown.gross_amount_hotel_currency.currency} ${data.product_price_breakdown.gross_amount_hotel_currency.value}`
        : 'Check Site';
    const reviews = data.review_nr || 0;
    const reviewScore = data.review_score || 'N/A';

    const infoHTML = `
        <div class="info-card">
            <div class="info-row">
                <span class="icon">📍</span>
                <div>
                    <strong>Address</strong>
                    <div class="muted">${address}</div>
                </div>
            </div>
            <div class="info-row">
                <span class="icon">💲</span>
                <div>
                    <strong>Price</strong>
                    <div class="muted">${price}</div>
                </div>
            </div>
            <div class="info-row">
                <span class="icon">⭐</span>
                <div>
                    <strong>Reviews</strong>
                    <div class="muted">${reviews} reviews • Score: ${reviewScore}</div>
                </div>
            </div>
        </div>
    `;

    // Description
    let description = data.hotel_description || 
                     data.description || 
                     (facilities.length ? `Key facilities: ${facilities.slice(0, 5).join(', ')}` : 'No description available.');

    const descHTML = `
        <div class="detail-section">
            <h3>About This Hotel</h3>
            <p>${description}</p>
        </div>
    `;

    // Facilities
    const facilitiesHTML = facilities.length ? `
        <div class="detail-section">
            <h3>Key Facilities</h3>
            <ul class="facility-list">
                ${facilities.map(f => `
                    <li class="facility-item">
                        <span class="fac-icon">${getFacilityIcon(f)}</span>
                        <span class="fac-text">${f}</span>
                    </li>
                `).join('')}
            </ul>
        </div>
    ` : '';

    modalBody.innerHTML = `
        <div class="modal-grid">
            ${galleryHTML}
            <div class="modal-info">
                ${infoHTML}
                ${descHTML}
                ${facilitiesHTML}
            </div>
        </div>
    `;

    // Wire thumbnail clicks
    if (photos.length > 0) {
        const mainImg = document.getElementById('modal-main-img');
        document.querySelectorAll('.gallery-thumbs .thumb').forEach(t => {
            t.addEventListener('click', () => {
                const src = t.getAttribute('data-src');
                if (src && mainImg) mainImg.src = src;
            });
        });
    }
}

// ============================================================================
// PAGE INITIALIZATION
// ============================================================================
window.onload = () => {
    // Set default values
    const defaultCity = "Rwanda";
    const today = new Date();
    const defaultCheckin = today.toISOString().split('T')[0];
    const nextWeek = new Date(today);
    nextWeek.setDate(nextWeek.getDate() + 7);
    const defaultCheckout = nextWeek.toISOString().split('T')[0];

    document.getElementById('cityInput').value = defaultCity;
    document.getElementById('checkinDate').value = defaultCheckin;
    document.getElementById('checkoutDate').value = defaultCheckout;

    // Try to load cached results
    try {
        const cached = loadFromLocalCache(CACHE_KEYS.lastSearch);
        const sessionShown = sessionStorage.getItem('sr_cache_shown');
        
        if (!sessionShown && cached?.rawHotelData && cached?.currentDestinationData) {
            sessionStorage.setItem('sr_cache_shown', '1');
            rawHotelData = cached.rawHotelData;
            currentDestinationData = cached.currentDestinationData;
            reRenderHotels();
            document.getElementById('results-controls').classList.remove('hidden');
        }
    } catch (e) {
        console.warn('Error loading cache', e);
    }

    // Run initial search
    initialSearch();
};