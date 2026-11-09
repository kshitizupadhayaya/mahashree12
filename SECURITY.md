# Security Policy

## Supported project
This repository contains the Mahashree Namkeen CDE web application (Node.js/Express + static frontend + MongoDB Atlas runtime).

## Reporting a vulnerability
Do **not** open a public issue for suspected security vulnerabilities. Report privately to the repository owner/maintainers with:
- affected file/endpoint and reproduction steps
- impact assessment
- any suggested mitigation

If you do not have a private contact channel, open a minimal issue asking for a private security contact without disclosing exploit details.

## Security practices in this codebase (as implemented)

### Secrets and configuration
- Runtime secrets/config are environment-based (`.env`, deployment env vars). `.env` is gitignored; `.env.example` contains placeholders only.
- Required runtime values for real/shared deployments: strong `ADMIN_PASSWORD`, long random `SESSION_SECRET`, valid `MONGODB_URI`/`MONGODB_DB`.
- MongoDB Atlas is the required runtime data store; the app fails fast when MongoDB is unavailable/misconfigured.

### Authentication and authorization
- Admin login uses password verification with timing-safe comparison and session regeneration on successful login.
- Admin API routes are protected by `requireAdmin` session checks.
- Basic in-memory admin login rate limiting is applied (best-effort; use a shared store/reverse-proxy rate limiting for multi-instance production).
- Session cookies are `httpOnly`, `sameSite=lax`; set `COOKIE_SECURE=true` only behind HTTPS.

### Input and API safety
- JSON/urlencoded body limits are configured.
- Server-side pricing/totals for new orders are computed from trusted product data; client delivery/discount/pricing values are not trusted for order totals.
- Admin exports and list endpoints require admin auth.
- Large image/base64 payloads are avoided in key list API responses (image refs/stripping) to reduce accidental data exposure and improve performance.

### Database
- MongoDB credentials are provided via env vars.
- App uses MongoDB driver queries/indexes; avoid exposing raw DB errors to clients where practical.
- SQLite files (`data/orders.db*`) are local backup/migration sources and are gitignored; they are not runtime app data.

### Dependencies and supply chain
- Run `npm audit --omit=dev` and review dependency changes carefully. Do not blindly apply breaking upgrades in production.
- Keep `package-lock.json` committed for reproducible installs.

## Known limitations / residual risks
- No automated test suite is configured (`npm test` is a placeholder).
- `server.js` still contains legacy SQLite/MySQL compatibility code paths; runtime startup is MongoDB-only, but full source removal should be done incrementally with regression tests.
- In-memory login rate limiting is per-process and resets on restart.
- The app does not include a full CSRF framework, WAF, or distributed session store by default; deploy behind HTTPS and add platform controls (rate limiting, WAF, managed sessions) for production.
- Existing historical order item snapshots may contain embedded image data in MongoDB; API responses strip large item images by default, but stored data migration to external storage requires a careful plan.

## Deployment checklist
- Set strong `ADMIN_PASSWORD` and `SESSION_SECRET`.
- Use HTTPS and `COOKIE_SECURE=true`.
- Restrict MongoDB Atlas network access and use least-privilege DB credentials.
- Do not expose admin interfaces without proper access controls.
- Monitor logs and dependency advisories.
