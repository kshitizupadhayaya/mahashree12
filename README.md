# CDE - Mahashree Namkeen

A Node.js Express storefront and admin dashboard for a namkeen shop. The project includes product listing, cart flow, checkout form, and an admin panel for viewing placed orders.

## Features

- Customer-facing storefront
- Product catalog with pricing and descriptions
- Shopping cart and checkout form
- Admin login page
- Admin dashboard for managing and viewing orders
- Database support for SQLite, MySQL, or MongoDB
- Docker support for quick local setup

## Tech Stack

- Node.js
- Express
- SQLite (default)
- MySQL (optional)
- MongoDB Atlas / local MongoDB (optional)
- Docker / Docker Compose

## Project Structure

- [server.js](server.js) - main app and database logic
- [public/index.html](public/index.html) - storefront page
- [public/admin.html](public/admin.html) - admin dashboard
- [public/admin-login.html](public/admin-login.html) - admin login page
- [public/script.js](public/script.js) - frontend logic
- [public/styles.css](public/styles.css) - styling
- [Dockerfile](Dockerfile) - Docker image setup
- [docker-compose.yml](docker-compose.yml) - multi-service app setup
- [.env.example](.env.example) - environment variable template

## Requirements

- Node.js 18+
- npm
- Optional: Docker and Docker Compose

## Installation

1. Clone the repository
2. Install dependencies:

```bash
npm install
```

3. Create your environment file from the example:

```bash
cp .env.example .env
```

4. Update the values in [.env](.env) if needed.

## Run Locally

### Using Node

```bash
npm start
```

Then open:

```text
http://localhost:8000
```

### Using Docker Compose

```bash
docker compose up --build
```

Then open:

```text
http://localhost:8000
```

## Environment Variables

The app uses variables such as:

```env
PORT=8000
ADMIN_PASSWORD=your_admin_password
SESSION_SECRET=your_session_secret

MONGODB_URI=mongodb://mongo:27017/mahashree_namkeen
MONGODB_DB=mahashree_namkeen

MYSQL_HOST=mysql
MYSQL_PORT=3306
MYSQL_USER=root
MYSQL_PASSWORD=your_mysql_password
MYSQL_DATABASE=mahashree_namkeen
```

> Do not commit your real secrets to GitHub. Keep your local environment file private.

## Database Modes

The app supports:

- SQLite by default
- MySQL when configured
- MongoDB when configured

## GitHub Publish

To push this project to GitHub:

```bash
git add .
git commit -m "Initial project upload"
git branch -M main
git remote set-url origin https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git
git push -u origin main
```

## License

This project is for educational and demo use.

## Contact

Mahashree Namkeen Store
