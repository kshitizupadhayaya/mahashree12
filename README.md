# Mahashree Namkeen (CDE)

Node.js/Express web application for the Mahashree Namkeen storefront and admin dashboard.

## Features (implemented)
- Storefront SPA (`public/index.html`, `public/script.js`) for browsing products/categories, cart, and order placement.
- Admin login/session and dashboard (`/admin`, `public/admin.html`, `public/admin-login.html`).
- Product and category management APIs/UI.
- Order workflow (pending/accept/reject/trash-related handling) and admin order export endpoint.
- Persistent dashboard statistics behavior as implemented in `server.js` (including manual clear-stats endpoint).
- Performance-focused list APIs: paginated orders/products endpoints, lightweight projections, image refs (`/api/products/:id/image`), and reduced payload sizes.

## Technology stack
- **Runtime:** Node.js (tested locally with Node 22.x in this workspace)
- **Backend:** Express 5, `express-session`, `dotenv`
- **Database (runtime):** **MongoDB Atlas required** (`mongodb` driver). App startup fails fast if `MONGODB_URI` is missing/connection fails.
- **Exports:** `exceljs`, `pdfkit` (dependencies present; behavior depends on endpoint usage/data)
- **Frontend:** Static HTML/CSS/vanilla JS served from `public/`
- **Containerization:** Dockerfile + docker-compose.yml

## Project structure
```text
.
├── server.js                     # Express app, MongoDB init, APIs, auth/session, static/SPA serving
├── public/                       # Storefront/admin static assets
├── scripts/
│   ├── migrate-sqlite-to-mongodb.js   # Legacy SQLite->MongoDB migration utility (kept)
│   └── backfill-order-prices.js       # Legacy SQLite utility (kept)
├── data/                         # Local SQLite backup files (gitignored)
├── Dockerfile
├── docker-compose.yml
├── .dockerignore
├── .env.example                  # Placeholder config only
├── SECURITY.md
├── CHANGELOG.md
└── package.json
```

## Prerequisites
- Node.js 20+ recommended (Node 22 used in workspace validation)
- npm
- MongoDB Atlas connection string with access from your runtime environment
- Docker + Docker Compose (optional; Docker CLI not available in this workspace)

## Environment configuration
```bash
cp .env.example .env
```
Set real values in `.env` (never commit it):
- `PORT` (default `8000`)
- `NODE_ENV`
- `COOKIE_SECURE=true` only behind HTTPS
- `ADMIN_PASSWORD` (strong, unique)
- `SESSION_SECRET` (long random)
- `MONGODB_URI` (MongoDB Atlas URI)
- `MONGODB_DB` (default `mahashree_namkeen`)

## Local development
```bash
npm ci
npm start
# or
npm run dev
```
Open `http://localhost:8000/` and `http://localhost:8000/admin`.

## Database
- **Active runtime database:** MongoDB Atlas only.
- **Legacy/local SQLite:** `data/orders.db` may exist as backup/migration source; it is gitignored and not used by runtime app data.
- **Migration script:** `scripts/migrate-sqlite-to-mongodb.js` is retained for legacy recovery/migration use. Do not rerun migrations unnecessarily; preserve existing production data.

## Docker (MongoDB Atlas runtime)
> Docker build/run was **not executed in this workspace** because Docker CLI is unavailable here. Files are prepared and `docker compose config` could not be validated here.

```bash
cp .env.example .env
# set ADMIN_PASSWORD, SESSION_SECRET, MONGODB_URI, MONGODB_DB
docker compose up --build -d
docker compose ps
docker compose logs -f app
```
- App listens on `${PORT:-8000}`.
- Compose uses `.env` via `env_file`; do not commit `.env`.
- `app_data` volume mounts `/app/data` (local container data path); runtime app data is in MongoDB Atlas.
- No local MongoDB/MySQL containers are exposed by default.

## Important API endpoints (high level)
- Public: `GET /api/health`, `GET /api/products`, `GET /api/products/:id/image`, `GET /api/categories`, order placement/status endpoints as implemented.
- Admin (session-protected): login/logout/session, dashboard, product CRUD, order listing/actions/export, dashboard stats clear/reset endpoints as implemented.
- Refer to `server.js` for the authoritative route list and behavior.

## Security
See [`SECURITY.md`](./SECURITY.md). Implemented controls include env-based config, admin session protection, basic login rate limiting, timing-safe password comparison, session regeneration, and reduced sensitive/heavy payloads in key list responses. Production deployments should add HTTPS, `COOKIE_SECURE=true`, platform rate limiting/WAF, restricted Atlas network access, and least-privilege DB credentials.

## Testing and validation
- `npm test` is currently a placeholder: `node -e "console.log('No automated tests yet.');"`
- Syntax checks used in workspace: `node --check server.js`, script checks.
- API smoke checks were run against a temporary local instance (health/products/categories/admin auth/dashboard/orders).
- `npm audit --omit=dev` reported 2 moderate vulnerabilities in `exceljs -> uuid`; no breaking dependency upgrade was applied automatically.
- Full browser/mobile regression, Docker build/run, and CI validation should be executed in an environment with Docker/browser test tooling.

## Troubleshooting
- **MongoDB connection fails:** verify `MONGODB_URI`, Atlas IP/network access, DB user permissions, and DNS/egress.
- **Admin login fails:** verify `ADMIN_PASSWORD` in env and session/cookie behavior (`COOKIE_SECURE` only with HTTPS).
- **Slow admin pages:** use pagination/filter endpoints; avoid loading large base64 image payloads in list views.
- **Docker unavailable:** install/start Docker; then run compose commands above.

## Maintenance
- Keep secrets out of Git.
- Review dependency audits before upgrades; avoid blind major upgrades.
- Preserve SQLite backups and migration scripts unless a deliberate, tested cleanup is planned.
- Before removing legacy SQLite/MySQL code from `server.js`, add regression tests for all admin/customer flows.
