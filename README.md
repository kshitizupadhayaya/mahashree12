# Mahashree Namkeen (CDE)

Node.js/Express web app for a Mahashree Namkeen storefront and admin dashboard. Customers can browse products/categories, manage a cart, and place orders; admins can manage products/categories, places, and orders.

## Technology stack

- **Runtime:** Node.js
- **Backend:** Express 5
- **Sessions:** `express-session`
- **Config:** `dotenv`
- **Databases (selectable):** SQLite (default/local), MongoDB (`mongodb`), MySQL (`mysql2`)
- **Frontend:** Static HTML/CSS/vanilla JS served from `public/`
- **Deployment/config:** Docker/Docker Compose, `render.yaml`

## Project structure

```text
.
├── server.js                 # Express app, API routes, DB init/access, SPA/static serving
├── public/
│   ├── index.html            # Storefront SPA shell
│   ├── script.js             # Storefront logic (catalog/cart/categories/checkout/UI)
│   ├── styles.css            # Storefront and responsive styles
│   ├── admin.html            # Admin dashboard UI
│   ├── admin-login.html      # Admin login page
│   └── images/               # Static image assets (served at /images/*)
├── data/                     # Local SQLite DB directory (gitignored; created at runtime)
├── package.json
├── package-lock.json
├── .env.example              # Environment variable template (copy to .env)
├── Dockerfile
├── docker-compose.yml
└── render.yaml
```

## Installation

```bash
npm install
cp .env.example .env
```

Edit `.env` with local values. **Do not commit `.env` or real credentials.**

## Environment configuration

See `.env.example`. Key variables:

| Variable | Purpose |
|---|---|
| `PORT` | HTTP port (default `8000`) |
| `ADMIN_PASSWORD` | Admin login password (set a strong value; do not use defaults in shared/prod environments) |
| `SESSION_SECRET` | Express session secret (set a long random value) |
| `MONGODB_URI` / `MONGODB_DB` | Optional MongoDB connection; when set, app uses MongoDB |
| `MYSQL_HOST` / `MYSQL_PORT` / `MYSQL_USER` / `MYSQL_PASSWORD` / `MYSQL_DATABASE` | Optional MySQL connection; used when MongoDB is not configured and MySQL settings are provided |

**Database selection:** MongoDB if `MONGODB_URI` is set; otherwise MySQL if host/user/database are set; otherwise local SQLite at `data/orders.db` (created automatically). Fallback to SQLite occurs if configured MongoDB/MySQL is unavailable at startup.

## Development / run commands

```bash
npm start          # node server.js
npm run dev        # node --watch server.js
npm test           # placeholder (no automated tests configured)
```

Open: `http://localhost:8000/` (storefront), `http://localhost:8000/admin` (admin; use `ADMIN_PASSWORD`).

## Production build

No frontend build step. For production, run with a process manager/container and set strong `ADMIN_PASSWORD`/`SESSION_SECRET` plus the intended database environment variables.

### Docker

```bash
docker compose up --build
```

`docker-compose.yml` includes app + optional MongoDB/MySQL services and bind-mounts `./data` for SQLite persistence. Override defaults via environment variables; do not rely on compose fallback passwords in real deployments.

## Important configuration details

- **Security:** `.env` is gitignored. `server.js` currently has development fallback values for `ADMIN_PASSWORD`/`SESSION_SECRET` (pre-existing; flagged in cleanup report) — always set real env vars outside local development. `render.yaml` generates secrets for Render deploys.
- **Data:** `data/*.db` and local DB files are gitignored. Do not commit runtime databases.
- **Caching:** Static `.html/.js/.css` responses are served with no-store headers (hard refresh may be needed after deploy).
- **Git:** `.kilo/` local tooling state is ignored for GitHub pushes.

## License

ISC (see `package.json`). Product branding/assets belong to their respective owners.

## Docker (containerized)

### Prerequisites
- Docker Engine/Desktop with `docker compose` (Compose v2).

### Environment
```bash
cp .env.example .env
```
Set strong values for `ADMIN_PASSWORD` and `SESSION_SECRET` before any shared/production use. Leave `MONGODB_URI`/MySQL blank for default **SQLite** (persisted in the `app_data` Docker volume). For **MongoDB Atlas**, set `MONGODB_URI` (and `MONGODB_DB`) to your Atlas URI — no local MongoDB container is required.

### Run (single command, SQLite default)
```bash
docker compose up --build -d
```

### Optional local DB services
```bash
docker compose --profile local-db up --build -d
```
Then configure `.env` for the service you want:
- Local MongoDB: `MONGODB_URI=mongodb://mongo:27017/mahashree_namkeen`
- Local MySQL: `MYSQL_HOST=mysql`, `MYSQL_PORT=3306`, `MYSQL_USER`, `MYSQL_PASSWORD`, `MYSQL_DATABASE`, and `MYSQL_ROOT_PASSWORD` for the MySQL container.

### Service ports
| Service | Host port | Notes |
|---|---:|---|
| `app` | `${PORT:-8000}` → `8000` | Storefront `/`, admin `/admin`, APIs `/api/*` |
| `mongo` (profile `local-db`) | internal only by default | Use Docker service name `mongo` from app |
| `mysql` (profile `local-db`) | internal only by default | Use Docker service name `mysql` from app |

### Docker networking and persistence
- Network: `cde-network` (bridge). Containers use service names (`mongo`, `mysql`), not `localhost`, for inter-container DB access.
- Volumes: `app_data` (`/app/data`, SQLite), `mongo_data`, `mysql_data` (created only when local-db profile/services are used).

### Commands
```bash
docker compose config                  # validate compose
docker compose up --build -d           # build and start
docker compose ps                      # container status
docker compose logs -f                 # logs
docker compose logs -f app             # app logs
docker compose down                    # stop/remove containers+network (keeps named volumes/data)
docker compose --profile local-db down # stop including local-db services
```
**Do not run `docker compose down -v`** unless you intentionally want to delete database volumes/data.

### Troubleshooting
- **Docker unavailable/daemon not running:** install/start Docker, then rerun commands.
- **`sqlite3`/native module build issues:** Dockerfile uses `node:20-alpine` with build deps in the deps stage; rebuild with `docker compose build --no-cache app`.
- **Admin login fails:** ensure `ADMIN_PASSWORD`/`SESSION_SECRET` are set in `.env` and container restarted.
- **DB connection:** check `docker compose logs app`. Atlas requires a valid `MONGODB_URI` and network egress. Local DB services require `--profile local-db` and correct service-name hosts (`mongo`/`mysql`).
- **Port conflict:** change `PORT` in `.env`.
