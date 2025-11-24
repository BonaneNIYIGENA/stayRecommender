// Global variables to store the raw, unsorted, unfiltered data
let rawHotelData = [];
let currentDestinationData = null; // Stores destId, city_name, etc.
// Cache for hotel details to avoid repeated API requests (saves API quota)
let hotelDetailsCache = {};
// Cache for destination lookups to avoid repeated API calls for the same city
let destCache = {};

// Run search automatically when the page is loaded
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

    // Trigger search with default values
    initialSearch();
};

// --- Helper function to fetch and cache hotel photos ---
async function getHotelPhotos(hotelId) {
    if (window.hotelPhotosCache && window.hotelPhotosCache[hotelId]) {
        return window.hotelPhotosCache[hotelId];
    }
    const url = `https://booking-com15.p.rapidapi.com/api/v1/hotels/getHotelPhotos?hotel_id=${hotelId}`;
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
        window.hotelPhotosCache[hotelId] = photos;
        return photos;
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

    // Fetch photos (from details or API)
    let photos = [];
    if (data.photos && Array.isArray(data.photos) && data.photos.length > 0) {
        photos = data.photos.map(p => p.url_max750 || p.url_original || p.url_max300).filter(Boolean);
    } else {
        photos = await getHotelPhotos(hotelId);
        photos = photos.map(p => p.url_max750 || p.url_original || p.url_max300).filter(Boolean);
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
    const facilitiesList = facilities.map(f => `<li>${f}</li>`).join('');

    // Description (fallback to highlights/facilities)
    let descriptionText = 'No description available.';
    if (data.hotel_text && data.hotel_text.description) {
        descriptionText = data.hotel_text.description;
    } else if (facilities.length > 0) {
        descriptionText = 'Facilities: ' + facilities.join(', ');
    }

    // Price
    let price = 'Check Site';
    if (data.product_price_breakdown && data.product_price_breakdown.gross_amount_hotel_currency) {
        price = `${data.product_price_breakdown.gross_amount_hotel_currency.currency} ${data.product_price_breakdown.gross_amount_hotel_currency.value}`;
    }

    // Reviews
    const reviews = data.review_nr || 0;
    const reviewScore = data.breakfast_review_score ? data.breakfast_review_score.rating : '';

    // Render HTML
    let contentHTML = `
        <div class="detail-section">
            <div class="hotel-photo-gallery">
                ${(photos.length > 0) ? photos.map(url => `<img src='${url}' class='hotel-modal-img' alt='Hotel photo'>`).join('') : '<div>No images available.</div>'}
            </div>
            <h3>${data.hotel_name || 'Hotel Details'}</h3>
            <p><strong>Address:</strong> ${address}</p>
            <p><strong>Location:</strong> ${lat && lng ? `Lat: ${lat}, Lng: ${lng}` : 'N/A'}</p>
            <p><strong>Price:</strong> ${price}</p>
            <p><strong>Total Reviews:</strong> ${reviews}</p>
            <p><strong>Review Score:</strong> ${reviewScore}</p>
        </div>
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
    modalBody.innerHTML = contentHTML;
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
    // If destination lookups are currently blocked due to rate-limiting, short-circuit
    // Previously we used a short-circuit guard here to block requests after a 429.
    // That logic has been removed so the UI won't be blocked by an internal timer.

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
    // Removed UI-blocking cooldown that would have prevented retries after a 429.

    currentDestinationData = await getDestinationID(cityInput);

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
            if (response.status === 429) {
                console.warn('Hotel Details API returned 429 - rate limit.');
                return null;
            }
            console.error('Hotel Details API call failed with status', response.status);
            return null;
        }
        const result = await response.json();
        // Many providers (including the sample `details.json`) wrap the real payload
        // under a top-level `data` key. Ensure we return that inner object so
        // `renderHotelModal` receives the expected hotel details shape.
        if (result && typeof result === 'object' && result.data) {
            return result.data;
        }
        return result;
    } catch (error) {
        console.error('Error fetching hotel details:', error);
        return null;
    }
}