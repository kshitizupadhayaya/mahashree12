# syntax=docker/dockerfile:1

FROM node:20-alpine AS base
WORKDIR /app
ENV NODE_ENV=production

# Build/runtime deps for native modules (sqlite3)
RUN apk add --no-cache python3 make g++ sqlite-libs

FROM base AS deps
RUN apk add --no-cache sqlite-dev
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force

FROM base AS runner
# Run as non-root; /app/data is mounted for SQLite persistence
RUN addgroup -S app && adduser -S app -G app \
    && mkdir -p /app/data \
    && chown -R app:app /app /app/data

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
