// Global variables to store the raw, unsorted, unfiltered data
let rawHotelData = [];
let currentDestinationData = null; // Stores destId, city_name, etc.
// Cache for hotel details to avoid repeated API requests (saves API quota)
let hotelDetailsCache = {};
// Cache for destination lookups to avoid repeated API calls for the same city
let destCache = {};

// --- Simple persistent cache (localStorage) ---------------------------------
const CACHE_TTL_MS = 1000 * 60 * 60; // 1 hour
const CACHE_KEYS = {
    lastSearch: 'sr_lastSearch',
    hotelPrefix: 'sr_hotel_' // append hotelId
};

function saveToLocalCache(key, value) {
    try {
        const wrapped = { __cachedAt: Date.now(), value };
        localStorage.setItem(key, JSON.stringify(wrapped));
    } catch (e) {
        // localStorage may be full or unavailable in some contexts
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

// Small helper to return an inline SVG for common facility keywords
function getFacilityIcon(name) {
    if (!name) return '';
    const n = name.toLowerCase();
    if (n.includes('parking')) return '<svg class="fac-svg" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="2" y="4" width="20" height="16" rx="2" stroke="#374151" stroke-width="1.2" fill="#f3f4f6"/><text x="12" y="16" text-anchor="middle" font-size="12" fill="#111">P</text></svg>';
    if (n.includes('pool')) return '<svg class="fac-svg" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M2 12c3 0 3-4 6-4s3 4 6 4 3-4 6-4v8H2v-4z" fill="#60a5fa"/></svg>';
    if (n.includes('wifi') || n.includes('wi-fi')) return '<svg class="fac-svg" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M2 8c4-4 10-4 14 0" stroke="#111" stroke-width="1.2" fill="none" stroke-linecap="round"/><path d="M5 11c2.5-2.5 6.5-2.5 9 0" stroke="#111" stroke-width="1.2" fill="none" stroke-linecap="round"/><circle cx="12" cy="17" r="1.5" fill="#111"/></svg>';
    if (n.includes('restaurant') || n.includes('food')) return '<svg class="fac-svg" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M8 3v8a2 2 0 0 0 4 0V3" stroke="#111" stroke-width="1.2" fill="none"/><path d="M5 21v-4a2 2 0 0 1 2-2h1v6" stroke="#111" stroke-width="1.2" fill="none"/><path d="M16 21v-8" stroke="#111" stroke-width="1.2"/></svg>';
    if (n.includes('fitness') || n.includes('gym')) return '<svg class="fac-svg" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><rect x="3" y="10" width="18" height="4" rx="1" fill="#e879f9"/></svg>';
    if (n.includes('spa') || n.includes('sauna')) return '<svg class="fac-svg" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M6 19c0-4 4-6 6-6s6 2 6 6" stroke="#111" stroke-width="1.2" fill="none"/></svg>';
    if (n.includes('bed') || n.includes('rooms') || n.includes('bedroom')) return '<svg class="fac-svg" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><rect x="3" y="8" width="18" height="8" rx="1" stroke="#111" stroke-width="1.2" fill="#fff"/><path d="M3 14h18" stroke="#111" stroke-width="1.2"/></svg>';
    // fallback small dot icon
    return '<svg class="fac-svg" viewBox="0 0 8 8" xmlns="http://www.w3.org/2000/svg"><circle cx="4" cy="4" r="3" fill="#94a3b8"/></svg>';
}

// Try to extract photo URLs from the detailed hotel payload (several possible shapes)
function extractPhotosFromDetails(data) {
    if (!data) return [];
    const urls = [];

    // Top-level photos array (objects or strings)
    if (Array.isArray(data.photos) && data.photos.length > 0) {
        data.photos.forEach(p => {
            if (!p) return;
            if (typeof p === 'string') urls.push(p);
            else urls.push(p.url_max750 || p.url_original || p.url_max300 || p.url_max1280 || p.url_max1280);
        });
    }

    // rawData.photoUrls (string array)
    if (data.rawData && Array.isArray(data.rawData.photoUrls)) {
        data.rawData.photoUrls.forEach(u => { if (u) urls.push(u); });
    }

    // Rooms may contain photos under each room key
    if (data.rooms && typeof data.rooms === 'object') {
        Object.values(data.rooms).forEach(room => {
            if (room && Array.isArray(room.photos)) {
                room.photos.forEach(p => {
                    if (!p) return;
                    if (typeof p === 'string') urls.push(p);
                    else urls.push(p.url_max750 || p.url_original || p.url_max300 || p.url_max1280);
                });
            }
        });
    }

    // Deduplicate while preserving order
    const seen = new Set();
    const out = [];
    urls.forEach(u => { if (u && !seen.has(u)) { seen.add(u); out.push(u); } });
    return out;
}

// Run search automatically when the page is loaded (render cached data first if present)
window.onload = () => {
    // Pre-set destination and dates
    const defaultCity = "Rwanda";
    const defaultCheckinDate = new Date().toISOString().split('T')[0]; 
    const defaultCheckoutDate = new Date();
    defaultCheckoutDate.setDate(defaultCheckoutDate.getDate() + 7); 
    const defaultCheckout = defaultCheckoutDate.toISOString().split('T')[0];

    // Set the inputs to default values
    document.getElementById('cityInput').value = defaultCity;
    document.getElementById('checkinDate').value = defaultCheckinDate;
    document.getElementById('checkoutDate').value = defaultCheckout;

    // If we have a recent cached search, render it immediately so the user
    try {
        const cached = loadFromLocalCache(CACHE_KEYS.lastSearch);
        const sessionShown = sessionStorage.getItem('sr_cache_auto_shown');
        // Only auto-render cached results silently on the first page load for this session
        if (!sessionShown && cached && cached.rawHotelData && cached.currentDestinationData) {
            sessionStorage.setItem('sr_cache_auto_shown', '1');
            rawHotelData = cached.rawHotelData;
            currentDestinationData = cached.currentDestinationData;
            reRenderHotels();
            // Attempt a silent background refresh to update results (no UI banner)
            initialSearch();
        } else {
            // Either we've already shown cache this session, or no cache exists — do normal search
            initialSearch();
        }
    } catch (e) {
        console.warn('Error while loading cache on startup', e);
        initialSearch();
    }
};

// --- Helper function to fetch and cache hotel photos ---
async function getHotelPhotos(hotelId) {
    // Try in-memory cache first
    if (window.hotelPhotosCache && window.hotelPhotosCache[hotelId]) {
        return window.hotelPhotosCache[hotelId];
    }
    // Try persistent cache (so we don't exhaust photo API requests)
    try {
        const cached = loadFromLocalCache(CACHE_KEYS.hotelPrefix + 'photos_' + hotelId);
        if (cached && Array.isArray(cached) && cached.length > 0) {
            // seed in-memory cache and return
            if (!window.hotelPhotosCache) window.hotelPhotosCache = {};
            window.hotelPhotosCache[hotelId] = cached;
            return cached;
        }
    } catch (e) {
        console.warn('Error reading cached hotel photos', e);
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
        const result = await response.json();
        const photos = result.data && Array.isArray(result.data) ? result.data : [];
        // extract usable urls (normalize)
        const normalized = photos.map(p => p.url_max750 || p.url_original || p.url_max300 || p.url_max1280 || p.url_original).filter(Boolean);
        // store as array of strings in both caches
        if (!window.hotelPhotosCache) window.hotelPhotosCache = {};
        window.hotelPhotosCache[hotelId] = normalized;
        try { saveToLocalCache(CACHE_KEYS.hotelPrefix + 'photos_' + hotelId, normalized); } catch (e) { /* ignore */ }
        return normalized;
    } catch (error) {
        console.error('Error fetching hotel photos:', error);
        return [];
    }
}

// --- Modal rendering function ---
async function renderHotelModal(data, hotelId) {
    const modalName = document.getElementById('modal-hotel-name');
    const modalBody = document.getElementById('modal-details-body');
    // Defensive: if API returned no data, show friendly message
    if (!data) {
        modalName.innerText = 'Details Unavailable';
        modalBody.innerHTML = `<p style="color:var(--error-text);">Hotel details could not be loaded. The provider may be rate-limiting or returned no data. Try again in a moment.</p>`;
        document.getElementById('modal-booking-link').href = '#';
        return;
    }

    modalName.innerText = data.hotel_name || 'Hotel Details';
    document.getElementById('modal-booking-link').href = data.url || '#';

    // Fetch photos (from details or API). Support multiple sources and shapes.
    let photos = [];
    // First try to extract from the details payload (rooms, rawData, top-level)
    const extracted = extractPhotosFromDetails(data);
    if (extracted && extracted.length > 0) {
        photos = extracted;
        // persist photos for future offline use
        try { saveToLocalCache(CACHE_KEYS.hotelPrefix + 'photos_' + hotelId, photos); } catch (e) { /* ignore */ }
    } else {
        // Fall back to the photo endpoint / persistent photo cache
        const fetched = await getHotelPhotos(hotelId);
        if (Array.isArray(fetched) && fetched.length > 0) {
            // fetched is already normalized to strings by getHotelPhotos
            photos = fetched;
        } else {
            photos = [];
        }
    }

    // Address/location
    const address = `${data.address || 'N/A'}, ${data.city_name_en || ''}, ${data.country_trans || ''}`;
    const lat = data.latitude;
    const lng = data.longitude;

    // Facilities
    let facilities = [];
    if (data.facilities_block && data.facilities_block.facilities) {
        facilities = data.facilities_block.facilities.map(f => f.name);
    } else if (data.property_highlight_strip) {
        facilities = data.property_highlight_strip.map(f => f.name);
    }
    const facilitiesList = facilities.map(f => `<li class="facility-item"><span class="fac-icon">${getFacilityIcon(f)}</span><span class="fac-text">${f}</span></li>`).join('');

    // Description (include hotel_text if present; fall back to first room description; always include facilities summary)
    let descriptionText = '';
    if (data.hotel_text && (data.hotel_text.description || data.hotel_text.short_description)) {
        descriptionText = data.hotel_text.description || data.hotel_text.short_description || '';
    }
    // fallback: try first room description
    if (!descriptionText && data.rooms && typeof data.rooms === 'object') {
        const firstRoom = Object.values(data.rooms)[0];
        if (firstRoom && (firstRoom.description || firstRoom.rooms_description || firstRoom.short_description)) {
            descriptionText = firstRoom.description || firstRoom.rooms_description || firstRoom.short_description || '';
        }
    }
    // Ensure facilities appear inside the description if not already present
    const facSummary = facilities.length > 0 ? `Facilities: ${facilities.join(', ')}` : '';
    if (!descriptionText && facSummary) descriptionText = facSummary;
    else if (facSummary && !descriptionText.includes('Facilities:')) descriptionText = descriptionText + `<br/><strong>Key facilities:</strong> ${facilities.join(', ')}`;
    if (!descriptionText) descriptionText = 'No description available.';

    // Price
    let price = 'Check Site';
    if (data.product_price_breakdown && data.product_price_breakdown.gross_amount_hotel_currency) {
        price = `${data.product_price_breakdown.gross_amount_hotel_currency.currency} ${data.product_price_breakdown.gross_amount_hotel_currency.value}`;
    }

    // Reviews
    const reviews = data.review_nr || 0;
    const reviewScore = data.breakfast_review_score ? data.breakfast_review_score.rating : '';

    // Render a nicer modal layout: gallery (left) + info card (right)
    const mainImage = photos.length > 0 ? photos[0] : null;

    const galleryHTML = photos.length > 0 ? `
        <div class="gallery">
            <div class="gallery-main"><img id="modal-main-img" src="${mainImage}" alt="Main photo"></div>
            <div class="gallery-thumbs">${photos.map((p, i) => `<div class="thumb" data-src="${p}"><img src="${p}" alt="thumb-${i}"></div>`).join('')}</div>
        </div>
    ` : `<div class="gallery-empty">No images available.</div>`;

    const infoHTML = `
        <div class="info-card">
            <h2 class="modal-title">${data.hotel_name || 'Hotel Details'}</h2>
            <div class="info-row"><span class="icon">📍</span><div><strong>Address</strong><div class="muted">${address}</div></div></div>
            <div class="info-row"><span class="icon">📌</span><div><strong>Location</strong><div class="muted">${lat && lng ? `Lat: ${lat}, Lng: ${lng}` : 'N/A'}</div></div></div>
            <div class="info-row"><span class="icon">💲</span><div><strong>Price</strong><div class="muted">${price}</div></div></div>
            <div class="info-row"><span class="icon">⭐</span><div><strong>Reviews</strong><div class="muted">${reviews} • Score: ${reviewScore}</div></div></div>
            <!-- booking link lives outside modal body in index.html -->
        </div>
    `;

    const descHTML = `
        <div class="detail-section">
            <h3>Hotel Description</h3>
            <p>${descriptionText}</p>
        </div>
        <div class="detail-section">
            <h3>Key Facilities</h3>
            <ul class="facility-list">
                ${facilitiesList || '<li>No facility list available.</li>'}
            </ul>
        </div>
    `;

    modalBody.innerHTML = `<div class="modal-grid">${galleryHTML}<div class="modal-info">${infoHTML}${descHTML}</div></div>`;

    // Wire up thumbnail clicks to update main image
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

// --- UI HELPER FUNCTIONS ---
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

// --- API FUNCTIONS (getDestinationID and initialSearch remain the same) ---

async function getDestinationID(city) {

    // Return cached dest if we have it
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
            // Handle rate-limit by logging but do not set an internal cooldown that blocks the UI.
            if (response.status === 429) {
                console.warn('Destination API returned 429 - rate limit. Continuing without internal block.');
                // return null so caller can handle empty result; do NOT set a cooldown timer
                return null;
            }
            console.error('Destination API call failed with status', response.status);
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
        // On network or parsing errors, treat as not found (UI will show friendly message)
        return null;
    }
}

async function initialSearch() {
    // 1. Get User Inputs
    const cityInput = document.getElementById('cityInput').value.trim();
    const checkin = document.getElementById('checkinDate').value;
    const checkout = document.getElementById('checkoutDate').value;

    const container = document.getElementById('hotel-container');
    const loading = document.getElementById('loading');
    
    // 2. Validation
    clearErrors();
    let isValid = true;
    if (!cityInput) { showInlineError('cityInput', "⚠️ Destination is required."); isValid = false; }
    if (!checkin) { showInlineError('checkinDate', "⚠️ Check-in date is required."); isValid = false; }
    if (!checkout) { showInlineError('checkoutDate', "⚠️ Check-out date is required."); isValid = false; }
    
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

    // 3. EXECUTE API SEARCH
    container.innerHTML = '';
    loading.classList.remove('hidden');
    document.getElementById('results-controls').classList.add('hidden');

    // Disable search button while request is in-flight to avoid rapid repeats
    const searchBtn = document.getElementById('searchBtn');
    if (searchBtn) searchBtn.disabled = true;

    // Step A: Get Destination ID
    // If we already have a valid `currentDestinationData` (for example it was
    // loaded from the persisted last-search cache on startup), avoid overwriting
    // it immediately — especially during the silent background refresh — because
    // providers may return a transient 429 and we want to keep the cached value.
    // Only call the destination API when we don't already have a matching entry.
    const normalizedCity = cityInput.trim().toLowerCase();
    const haveCachedDest = currentDestinationData && (
        (currentDestinationData.city_name && currentDestinationData.city_name.toLowerCase() === normalizedCity) ||
        (currentDestinationData.query && currentDestinationData.query.toLowerCase() === normalizedCity)
    );

    if (!haveCachedDest) {
        // Removed UI-blocking cooldown that would have prevented retries after a 429.
        currentDestinationData = await getDestinationID(cityInput);
    }

    if (!currentDestinationData) {
        loading.classList.add('hidden');
        if (searchBtn) searchBtn.disabled = false;
        return showInlineError('cityInput', `Could not find "${cityInput}". Try a different name.`);
    }

    // Step B: Get Hotels
    const sortOrder = 'popularity';
    const hotelUrl = `https://${API_HOST}/api/v1/hotels/searchHotels?dest_id=${currentDestinationData.dest_id}&search_type=${currentDestinationData.search_type}&arrival_date=${checkin}&departure_date=${checkout}&adults=1&room_qty=1&page_number=1&units=metric&temperature_unit=c&languagecode=en-us&currency_code=USD&sort_order=${sortOrder}`;

    try {
        const response = await fetch(hotelUrl, {
            method: 'GET',
            headers: {
                'X-RapidAPI-Key': API_KEY,
                'X-RapidAPI-Host': API_HOST
            }
        });
        const result = await response.json();
        loading.classList.add('hidden');

        rawHotelData = result.data ? result.data.hotels : [];
        
        document.getElementById('results-controls').classList.remove('hidden');
        reRenderHotels();
        // Persist the successful search results so we can show cached data on next load
        try {
            saveToLocalCache(CACHE_KEYS.lastSearch, { rawHotelData, currentDestinationData });
        } catch (e) {
            console.warn('Failed to save search results to cache', e);
        }

    } catch (error) {
        console.error('Search Error:', error);
        loading.classList.add('hidden');
        if (searchBtn) searchBtn.disabled = false;
        showInlineError('cityInput', "🛑 System Error: Failed to fetch hotel data. Check API key or network.");
    }
}

// --- RERENDER HOTELS FUNCTION (Fixed for Name Sanitization) ---
function reRenderHotels() {
    const container = document.getElementById('hotel-container');
    // Only enable sorting/filtering if results are present
    const sortOrderEl = document.getElementById('sortOrder');
    const starFilterEl = document.getElementById('starFilter');
    const sortOrder = sortOrderEl ? sortOrderEl.value : 'popularity';
    const minStars = starFilterEl ? parseInt(starFilterEl.value) : 0;

    // 1. Start with the raw data
    let hotels = [...rawHotelData];

    // Only allow sorting/filtering if hotels are present
    if (hotels.length > 0) {
        // 2. Apply Filtering (Min Stars)
        if (minStars > 0) {
            hotels = hotels.filter(hotel => hotel.property.propertyClass >= minStars);
        }

        // 3. Apply Sorting
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
            } else { // 'popularity' or fallback
                const scoreA = propA.reviewScore || 0;
                const scoreB = propB.reviewScore || 0;
                return scoreB - scoreA;
            }
        });
    }

    // 4. Render UI
    container.innerHTML = '';

    if (hotels.length === 0) {
        container.innerHTML = `<div style="grid-column: 1/-1; text-align: center;"><h3>No hotels found matching your current filters.</h3></div>`;
        return;
    }

    hotels.forEach((hotel, index) => {
        const name = (hotel.property.name || 'Unknown Hotel').toString();
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
                <div class="price-tag">
                    ${priceDisplay}
                </div>
                <button class="search-btn" style="margin-top:15px; font-size:14px; padding:8px 15px;" onclick="viewHotelDetails(${hotelId}, '${safeName}')">View Details</button>
            </div>
        `;
        container.appendChild(card);
    });
}

// --- HOTEL DETAILS MODAL ---

async function viewHotelDetails(hotelId, hotelName) {
    const modalName = document.getElementById('modal-hotel-name');
    const modalBody = document.getElementById('modal-details-body');
    const modal = document.getElementById('hotel-details-modal');

    modalName.innerText = `Loading ${hotelName}...`;
    modalBody.innerHTML = '<div class="spinner" style="margin: 20px auto;"></div>';
    modal.classList.remove('hidden');

    const checkinInput = document.getElementById('checkinDate');
    const checkoutInput = document.getElementById('checkoutDate');
    const checkin = checkinInput ? checkinInput.value : '';
    const checkout = checkoutInput ? checkoutInput.value : '';

    if (!checkin || !checkout) {
        modalName.innerText = `Error loading details for ${hotelName}`;
        modalBody.innerHTML = `<p style='color:var(--error-text);'>Please select both check-in and check-out dates above before viewing hotel details.</p>`;
        if (checkinInput) checkinInput.focus();
        return;
    }

    const date1 = new Date(checkin);
    const date2 = new Date(checkout);
    if (date1 >= date2) {
        modalName.innerText = `Error loading details for ${hotelName}`;
        modalBody.innerHTML = `<p style='color:var(--error-text);'>Check-out date must be after check-in date.</p>`;
        if (checkoutInput) checkoutInput.focus();
        return;
    }

    // Removed hotel-details rate-limit guard to avoid a missing-variable ReferenceError
    // and to allow retries even after transient provider 429s. We still log 429s in the
    // fetch call below but we won't block UI by setting internal timers.

    if (!window.hotelPhotosCache) window.hotelPhotosCache = {};

    const arrival = toApiDate(checkin);
    const departure = toApiDate(checkout);

    if (!arrival || !departure) {
        modalName.innerText = `Error loading details for ${hotelName}`;
        modalBody.innerHTML = `<p style="color:var(--error-text);">Dates are invalid!</p>`;
        return;
    }

    // Pull hotel data from API (if we don't already have it in cache)
        // First try a persistent local cache so details appear instantly when available
        try {
            const cachedHotel = loadFromLocalCache(CACHE_KEYS.hotelPrefix + hotelId);
            if (cachedHotel) {
                hotelDetailsCache[hotelId] = cachedHotel;
                // Render cached details immediately (silent), then refresh in background
                renderHotelModal(cachedHotel, hotelId);
                (async () => {
                    const fresh = await fetchHotelDetails(hotelId, arrival, departure);
                    if (fresh) {
                        hotelDetailsCache[hotelId] = fresh;
                        renderHotelModal(fresh, hotelId);
                    }
                })();
                return;
            }
        } catch (e) {
            console.warn('Error while reading cached hotel details', e);
        }
    if (!hotelDetailsCache[hotelId]) {
        // Do NOT set an internal rate-limit timer; just fetch details and cache result.
        hotelDetailsCache[hotelId] = await fetchHotelDetails(hotelId, arrival, departure);
    }

    const hotelData = hotelDetailsCache[hotelId];

    // If we failed to fetch details (null/undefined), show a friendly error and a retry button
    if (!hotelData) {
        modalName.innerText = `Unable to load ${hotelName}`;
        modalBody.innerHTML = `
            <p style="color:var(--error-text);">Details for this hotel couldn't be retrieved. This can happen when the API returns no data or is temporarily rate-limited.</p>
            <p style="text-align:center;"><button id="retry-details" class="search-btn" style="padding:8px 16px;">Retry</button></p>
            <p style="font-size:0.85rem; color:#666; text-align:center;">If this persists, verify your API key in <code>config.js</code> or try again later.</p>
        `;

        const retryBtn = document.getElementById('retry-details');
        if (retryBtn) {
            retryBtn.addEventListener('click', async () => {
                modalName.innerText = `Loading ${hotelName}...`;
                modalBody.innerHTML = '<div class="spinner" style="margin: 20px auto;"></div>';
                const data = await fetchHotelDetails(hotelId, arrival, departure);
                hotelDetailsCache[hotelId] = data;
                if (data) {
                    renderHotelModal(data, hotelId);
                } else {
                    modalName.innerText = `Unable to load ${hotelName}`;
                    modalBody.innerHTML = `<p style=\"color:var(--error-text);\">Still no data. Try again later or check your API configuration.</p>`;
                }
            });
        }

        return;
    }

    renderHotelModal(hotelData, hotelId);
}
function toApiDate(dateStr) {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return null;
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

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
            // If provider rate-limited, try returning a cached copy if available.
            if (response.status === 429) {
                console.warn('Hotel Details API returned 429 - rate limit. Trying cached data if available.');
                const cached = loadFromLocalCache(CACHE_KEYS.hotelPrefix + hotelId);
                if (cached) return cached;
                return null;
            }
            console.error('Hotel Details API call failed with status', response.status);
            const cached = loadFromLocalCache(CACHE_KEYS.hotelPrefix + hotelId);
            if (cached) return cached;
            return null;
        }
        const result = await response.json();
        // Many providers (including the sample `details.json`) wrap the real payload
        // under a top-level `data` key. Ensure we return that inner object so
        // `renderHotelModal` receives the expected hotel details shape.
        const payload = (result && typeof result === 'object' && result.data) ? result.data : result;
        if (payload) {
            // persist hotel details for offline / fallback use
            try { saveToLocalCache(CACHE_KEYS.hotelPrefix + hotelId, payload); } catch (e) { /* ignore */ }
        }
        return payload;
    } catch (error) {
        console.error('Error fetching hotel details:', error);
        return null;
    }
}