# StayHelp App

A modern, responsive hotel search application that helps users who are tourists or anyone who wants to find and compare accommodations(hotels) worldwide.

## Features

- **Smart Hotel Search**: Find hotels by destination with real-time price comparison.
- **Advanced Filtering**: Sort results by popularity, price, or star rating.
- **Detailed Hotel Information**: Comprehensive details including photos, amenities, and reviews.
- **Intuitive UI**: Clean, modern interface with smooth animations.
- **Responsive Design**: Works seamlessly across desktop, tablet, and mobile devices.
- **Smart Caching**: Optimized performance with local storage caching.

## Installation

1. Clone or download the project files:

    ```bash
    git clone https://github.com/BonaneNIYIGENA/stayhelp-app.git
    ```

2. Project Structure:

    ```
    project-folder/
    ├── index.html  # Main application structure
    ├── style.css   # All styling and responsive design
    ├── script.js   # Application logic and API integration
    └── config.js   # API Key and host configuration
    ```

3. **Configure API Credentials**:
    - Open `config.js`.
    - Replace the placeholder API credentials with '9df78634d5msh88c921f64d14fa3p10d26ajsn812562eecec1'.

    ```javascript
    const API_KEY = 'your-rapidapi-key-here';
    const API_HOST = 'booking-com15.p.rapidapi.com';
    ```

4. **Run the Application Locally/Online**:
    - Open `index.html` in a web browser.
    - No server setup required — runs entirely client-side.
    - **Live Session**
          - Can be accessed through http://bonaneniyigena.tech/

## 🛠️ Technical Stack

- **Frontend**: HTML, CSS and JavaScript
- **API**: Booking COM API via RapidAPI (https://rapidapi.com/DataCrawler/api/booking-com15)
- **Caching**: LocalStorage

## 🔧 Core Functions

### **Search & Display**

- `initialSearch()` – Main search function with validation.
- `reRenderHotels()` – Dynamic hotel card rendering with sorting.
- `viewHotelDetails()` – Modal display for detailed hotel information.

### **API Integration**

- `getDestinationID()` – Location lookup and validation.
- `searchHotels()` – Fetch hotel listings.
- `fetchHotelDetails()` – Get comprehensive hotel data.
- `getHotelPhotos()` – Retrieve hotel image galleries.

### **Utilities**

- Smart caching system.
- Error handling and user feedback.
- Date formatting and validation.
- Responsive image gallery.

##  UI Components

### **Video Demonstration**
- Link to the video: 

### **Search Panel**

- Destination input with autocomplete.
- Date pickers for check-in/check-out.
- Real-time validation with error messages.

### **Hotel Cards**

- High-quality property images.
- Price display and rating badges.
- Star ratings and review scores.
- Hover animations and smooth transitions.

### **Detail Modal**

- Interactive image gallery.
- Comprehensive amenity listings.
- Direct booking links.
- Responsive grid layout.

## ⚙️ Configuration

### **API Settings🎯Usage Guide**

Enter Destination: Type a city name (e.g., "Kigali", "Paris").

Select Dates: Choose check-in and check-out dates.

Search: Click "Search Hotels" to find accommodations.

Filter Results: Use sort options to organize by price, rating, or popularity.

View Details: Click "View Details" for comprehensive hotel information.

Book: Use the direct booking link to reserve your stay.

### 🔒 Error Handling
Invalid Input: Real-time validation with helpful error messages.

API Limits: Graceful fallback to cached data when rate-limited.

Network Issues: Retry mechanisms and user-friendly error states.

Missing Data: Smart defaults and placeholder content.


### 🔄 Performance Features
Lazy Loading: Images load as needed.

Efficient Caching: Reduces API calls and improves speed.

Optimized Rendering: Smooth animations with CSS transforms.

Bundle-Free: No external dependencies beyond API calls.


## 🤝 Credits
- RapidAPI : FOr providing APIs I used in this project

## Contact me
Bonane NIYIGENA, J2025

b.niyigena@alustudent.com

ALU Year-1 Student
