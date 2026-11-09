# Changelog

## 2026-11-09 (working tree, not yet committed/pushed)

### Performance and admin/API behavior
- Optimized product and category loading to avoid large base64 image payloads in list responses (image refs + `/api/products/:id/image`).
- Added server-side pagination/filter support for admin orders (`GET /api/orders`) and dashboard recent order history (`GET /api/admin/dashboard` `orderPage/orderPageSize`).
- Improved admin UI to use paginated orders/products/dashboard history and disabled aggressive 3s dashboard polling.
- Stripped large base64 `data:image` item snapshots from default order API payloads for performance (stored DB records unchanged).

### Security hardening
- Added basic in-memory admin login rate limiting.
- Added timing-safe admin password comparison and session regeneration on successful login.
- Added optional secure session cookie behavior (`COOKIE_SECURE=true` behind HTTPS).
- Updated `.env.example` to placeholders only and aligned it with MongoDB-only runtime configuration.
- Created `SECURITY.md` documenting implemented controls and residual risks.

### Docker and documentation
- Updated `Dockerfile` (Node 22 Alpine, non-root user, minimal runtime copy, healthcheck).
- Updated `docker-compose.yml` for MongoDB Atlas env-based runtime (no exposed local DB services by default).
- Updated `.dockerignore` to exclude secrets, git metadata, local DB files/backups, logs, and non-runtime artifacts.
- Created `CHANGELOG.md`.

### Migration/legacy notes
- Runtime application startup/data path is MongoDB-only and fail-fast.
- `server.js` still contains legacy SQLite/MySQL compatibility code paths and top-level module stubs; full source removal requires careful incremental refactoring and regression testing.
- `scripts/migrate-sqlite-to-mongodb.js` and `scripts/backfill-order-prices.js` are retained; they may depend on `sqlite3` and local `data/orders.db` backup files.
- `mysql2`/`sqlite3` remain in `package.json` for legacy scripts/compatibility; production runtime does not require loading MySQL/SQLite modules.

### Verification notes
- `node --check server.js` and migration script syntax checks passed.
- API smoke checks on a temporary local instance passed for health/products/categories/admin login/session/dashboard/orders (MongoDB Atlas).
- `npm audit --omit=dev` reported 2 moderate vulnerabilities in the `exceljs -> uuid` chain; no breaking dependency upgrade was applied automatically.
- Docker CLI was not available in this environment, so image build/container startup could not be executed here.
