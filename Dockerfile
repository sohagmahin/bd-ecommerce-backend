# ─── Stage 1: deps ────────────────────────────────────────────────────────────
FROM node:20-alpine AS deps

WORKDIR /app

# Install OS libs needed by Prisma query engine
RUN apk add --no-cache openssl

COPY package*.json ./
RUN npm ci --omit=dev

# ─── Stage 2: builder ─────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

RUN apk add --no-cache openssl

COPY package*.json ./
RUN npm ci

COPY prisma ./prisma
RUN npx prisma generate

# ─── Stage 3: production image ────────────────────────────────────────────────
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

RUN apk add --no-cache openssl && \
    # Create non-root user
    addgroup -S appgroup && \
    adduser  -S appuser -G appgroup

# Copy production node_modules from deps stage
COPY --from=deps    /app/node_modules ./node_modules

# Copy generated Prisma client from builder stage
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma

# Copy application source
COPY prisma   ./prisma
COPY src      ./src
COPY server.js .

# Create logs directory and fix ownership
RUN mkdir -p logs && chown -R appuser:appgroup /app

USER appuser

EXPOSE 5000

# Healthcheck — Docker will mark the container unhealthy if this fails
HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
  CMD wget -qO- http://localhost:5000/health || exit 1

CMD ["node", "server.js"]
