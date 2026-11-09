# syntax=docker/dockerfile:1

FROM node:22-alpine AS base
WORKDIR /app
ENV NODE_ENV=production

FROM base AS deps
COPY package.json package-lock.json ./
# Install production dependencies. Native legacy deps (if present) may require build tools;
# app runtime is MongoDB-only and does not load sqlite3/mysql2 modules.
RUN apk add --no-cache --virtual .build-deps python3 make g++ \
  && npm ci --omit=dev --no-audit --no-fund \
  && apk del .build-deps \
  && npm cache clean --force

FROM base AS runner
RUN addgroup -S app && adduser -S app -G app \
  && mkdir -p /app/data /app/public \
  && chown -R app:app /app

COPY --chown=app:app package.json package-lock.json ./
COPY --from=deps --chown=app:app /app/node_modules ./node_modules
COPY --chown=app:app server.js ./
COPY --chown=app:app public ./public

USER app
EXPOSE 8000
VOLUME ["/app/data"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:'+(process.env.PORT||8000)+'/api/health',r=>process.exit(r.statusCode<500?0:1)).on('error',()=>process.exit(1))"

CMD ["node", "server.js"]
