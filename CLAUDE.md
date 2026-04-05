# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Common Commands

### Docker (preferred)

```bash
# ── Local development ─────────────────────────────────────────────────────────
docker compose up                  # Start app + postgres + redis
docker compose up --build          # Rebuild app image first
docker compose down                # Stop containers (keeps volumes)
docker compose down -v             # Stop and delete volumes (wipes DB + Redis)

# Run a one-off command inside the running app container
docker compose exec app npx prisma migrate dev --name <name>
docker compose exec app npm run prisma:seed
docker compose exec app npx prisma studio   # exposes :5555

# ── Production (on the VPS) ───────────────────────────────────────────────────
docker compose -f docker-compose.prod.yml up -d           # start detached
docker compose -f docker-compose.prod.yml up -d --build   # after a code push
docker compose -f docker-compose.prod.yml logs -f app     # tail logs

# Run migrations then seed (first deploy only)
docker compose -f docker-compose.prod.yml exec app npx prisma migrate deploy
docker compose -f docker-compose.prod.yml exec app node prisma/seed.js

# Zero-downtime restart after code change
docker compose -f docker-compose.prod.yml build app
docker compose -f docker-compose.prod.yml up -d app
```

### Without Docker

```bash
# Development
npm run dev                        # Start with nodemon (auto-reload)
npm start                          # Start without auto-reload

# Database
npx prisma generate                # Regenerate Prisma client after schema changes
npx prisma migrate dev --name <name>  # Create and apply a new migration
npx prisma migrate deploy          # Apply migrations in production (no prompt)
npx prisma db push                 # Push schema without creating a migration file
npx prisma studio                  # Open visual DB browser at localhost:5555
npm run prisma:seed                # Seed admin user + sample categories + products

# Shortcuts (npm scripts)
npm run prisma:generate
npm run prisma:migrate             # = migrate dev
npm run prisma:migrate:prod        # = migrate deploy
npm run prisma:seed
npm run prisma:studio
```

There is no test runner or linter configured. `NODE_ENV=test` suppresses morgan logging.

## Architecture

### Docker setup

Three compose files serve different purposes:

| File | Purpose |
|---|---|
| `docker-compose.yml` | Local dev — mounts source into container, runs `npm run dev` (nodemon), exposes postgres `:5432` and redis `:6379` to host |
| `docker-compose.prod.yml` | Production — uses the lean `runner` stage, binds app to `127.0.0.1:5000` only (Nginx proxies), postgres/redis ports not exposed, includes a one-shot `migrate` service |
| `Dockerfile` | Multi-stage: `deps` (prod node_modules) → `builder` (all deps + prisma generate) → `runner` (minimal Alpine, non-root user) |

The `DATABASE_URL` and `REDIS_HOST` environment variables are overridden inside compose files to point to the container service names (`postgres`, `redis`) regardless of what is in `.env`. When running without Docker, those variables in `.env` must point to `localhost`.

The production `.env` needs three extra vars for the postgres container: `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`.

### Request flow

Every request passes through this chain before hitting a controller:

```
Nginx → Express
  → helmet / cors / compression
  → urlencoded parser (SSLCommerz callbacks only, path-scoped)
  → json parser
  → morgan (skipped in test env)
  → generalLimiter (120 req/min, applied to /api/*)
  → Route → [authLimiter | paymentLimiter] → validator chain → validate middleware → [authenticate] → [requireAdmin] → Controller
  → errorHandler
```

`express.urlencoded` is mounted **only** on `/api/payments/sslcommerz` because SSL Commerz POSTs form-encoded data. All other routes use `express.json`.

`app.set('trust proxy', 1)` is required — Nginx sits in front, so without it `req.ip` would always be `127.0.0.1` and rate limiting would be broken.

### Controllers → Services split

Controllers own HTTP concerns (req/res, validation outcomes, status codes). Heavy logic is delegated:

- **`cacheService`** — all Redis operations. Cart keys are `cart:<userId>`, TTL 7 days. Generic `cacheGet/cacheSet/cacheDel` used for product listing cache (2 min TTL).
- **`sslcommerzService`** — wraps `sslcommerz-lts`. `initiatePayment` builds the payload and returns `GatewayPageURL`. `validatePayment(val_id)` re-queries SSL Commerz to verify; this must always be called before marking a payment complete — never trust the callback payload alone.
- **`bkashService`** — raw `axios` calls to the bKash tokenized checkout API. Holds an in-process token cache (`tokenCache`) that refreshes 60 seconds before expiry. Exports `createPayment`, `executePayment`, `queryPayment`, `refundPayment`.
- **`emailService`** — nodemailer over SendGrid SMTP. All calls in controllers are fire-and-forget (`.catch()` logs via winston).
- **`smsService`** — routes to Twilio or BulkSMSBD based on `SMS_PROVIDER` env var. Also fire-and-forget.

### Authentication

`src/middleware/auth.js` exports four guards:
- `authenticate` — verifies JWT, queries DB, attaches `req.user`. Hard-fails with 401/403.
- `requireAdmin` — checks `req.user.role === 'ADMIN'`. Must be chained after `authenticate`.
- `requireCustomer` — same pattern for `CUSTOMER` role.
- `optionalAuth` — attaches user if token is present but never blocks. Used for public routes that behave differently when logged in.

Refresh tokens are stored as bcrypt hashes in `users.refreshToken`. On logout the column is set to `null`, invalidating all refresh tokens for that user.

### Database patterns

All writes that touch multiple tables use `prisma.$transaction(async (tx) => { ... })`. The critical example is `placeOrder` in `orderController.js`: it creates the order, payment record, and decrements stock for every item in a single transaction.

Order and OrderItem snapshot product fields (`productName`, `productSku`, `unitPrice`) at creation time — they never reference the live product for historical accuracy.

`prisma` is a singleton exported from `src/config/database.js`. Import it directly everywhere with `require('../config/database')`.

### Response helpers

All controllers use `src/utils/response.js`:
- `success(res, data, message, statusCode)` — default 200
- `created(res, data, message)` — 201
- `error(res, message, statusCode, errors)` — pass `errors` array for validation-style responses
- `paginated(res, data, meta)` — includes `meta: { total, page, limit, totalPages }`

Always `return` these calls inside controllers to prevent double-response bugs.

### Adding a new route

1. Create `src/controllers/<name>Controller.js` — export named handler functions
2. Create `src/routes/<name>.js` — import controller, attach `authenticate`/`requireAdmin` as needed, add `express-validator` chains + `validate` middleware
3. Register in `server.js`: `app.use('/api/<name>', require('./src/routes/<name>'))`

### Validation pattern

Routes declare `express-validator` chains inline, then call the `validate` middleware as the last middleware before the controller. `validate` reads `validationResult(req)` and returns a `422` with an `errors` array if any field fails. Controllers can assume all inputs are valid by the time they run.

### Error handling

Controllers never send 500s directly. They call `next(err)` for unexpected errors, which lands in `src/middleware/errorHandler.js`. That handler translates Prisma error codes (`P2002` → 409, `P2025` → 404), Multer size errors, and generic errors. In production, raw error messages are hidden for 500s.

### Product caching

`productController.getProducts` builds a cache key from the full query (where + pagination + sort), caches for 120 seconds. `createProduct`, `updateProduct`, `deleteProduct`, and `updateStock` all call `cacheDel('products:*')`. Category list is cached for 600 seconds under `categories:all`.

### Order status machine

Valid transitions are enforced in `adminController.adminUpdateStatus`:

```
PENDING → CONFIRMED | CANCELLED
CONFIRMED → PROCESSING | CANCELLED
PROCESSING → SHIPPED | CANCELLED
SHIPPED → DELIVERED
DELIVERED → REFUNDED
```

`CANCELLED` and `REFUNDED` are terminal. Every status change also writes a row to `OrderStatusHistory`.

### Payment webhook security

- **SSL Commerz**: success/fail/cancel/IPN routes are NOT behind `authenticate` middleware — they are called by the gateway, not the browser. The IPN route always responds 200 to prevent SSL Commerz from retrying. Payment is only confirmed after `validatePayment(val_id)` returns `VALID` or `VALIDATED`.
- **bKash**: callback is a browser GET redirect. After checking `status=success`, the server calls `executePayment(paymentID)` before marking the payment complete.

### Environment

`APP_URL` must be the publicly accessible URL of this API — it is embedded into SSL Commerz success/fail/cancel/IPN URLs and the bKash callback URL at payment initiation time. In local dev these callbacks won't work unless the server is exposed (e.g. via ngrok).

`SSLCOMMERZ_IS_LIVE=false` uses the sandbox gateway. Flip to `true` for production.

`BKASH_BASE_URL` switches between sandbox (`tokenized.sandbox.bka.sh`) and production (`tokenized.pay.bka.sh`).
