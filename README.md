# StayHelp App
A simple, user-friendly hotel recommendation platform built with HTML, CSS, and JavaScript, powered by the Booking.COM API via RapidAPI. The app allows users to search for hotels by city, view live pricing and ratings, and sort/filter results—all wrapped in a clean and responsive UI.

## This project includes:
✔ Local development

✔ API integration

✔ Deployment on two web servers (Web01 & Web02)

✔ Load balancer configuration (Lb01)

✔ Secure handling of API keys

✔ Demo video + documentation


## 1. Overview of what a  user can do:

Search for hotels by city

View hotel names, images, prices, and ratings

Sort results (e.g., by price or rating)

Filter results (e.g., minimum rating)


## 2. Live Demo Links

Demo Video: [https://your-demo-link.com](https://youtu.be/BjE49iOLJAQ)

## ⚙️ 3. Features
🔍 Search

Enter a city name (e.g., Paris) and fetch live hotels from the API.

Sort hotels by: Lowest price - Highest price, Star rating



## 4. API Used — Booking.com API (RapidAPI)

This application uses the Booking.com API via RapidAPI to retrieve:

Hotel names

Images

Ratings

Prices

Locations


📚 API Documentation

Booking.com API (RapidAPI):
(https://rapidapi.com/DataCrawler/api/booking-com15)


## Installation
 Step 1 — Clone the repository
git clone https://github.com/BonaneNIYIGENA/stayRecommender.git
cd stayRecommender

 Step 2 — Add your API key

Create a file called config.js (DO NOT commit this file):

const API_KEY = "4a57cd4749msh70f75a4223e8d8cp17aa51jsn602291a4ffec";

config.js

 Step 3 — Run locally

If using the VSCode Live Server extension:

Right-click index.html → “Open with Live Server”


## 6. Deployment Instructions

Below are the exact steps taken.

Step 1 — Upload files to Web01 & Web02

On both servers:

Create a directory:

mkdir /var/www/hotel


Copy project files using SCP, Git, or SFTP:

scp -r * user@web01:/var/www/hotel
scp -r * user@web02:/var/www/hotel


Set correct permissions:

sudo chown -R www-data:www-data /var/www/hotel


Point Nginx to serve /var/www/hotel

Step 2 — Configure Load Balancer (Lb01)

Load balancer config (example using Nginx):

upstream hotel_app {
    server web01-ip;
    server web02-ip;
}

server {
    listen 80;
    server_name lb01;

    location / {
        proxy_pass http://hotel_app;
    }
}


Then restart:

sudo systemctl restart nginx

Step 3 — Testing the Load Balancer

Added a small indicator in the footer that shows:

Served by: Web-01

or

Served by: Web-02


Refresh multiple times at http://lb01 → you should see the server alternating.
This confirms load balancing is working.


## 👏 8. Credits

Booking.com API (via RapidAPI):
https://rapidapi.com/apidojo/api/booking
