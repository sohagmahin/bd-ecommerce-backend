# BD E-Commerce Backend

A production-ready RESTful API backend for a B2C e-commerce platform targeting the Bangladesh market. Built with Node.js, Express.js, PostgreSQL (Prisma ORM), Redis, and integrated with Bangladesh-specific payment gateways — SSL Commerz and bKash PGW.

---

## Table of Contents

- [Tech Stack](#tech-stack)
- [Architecture Overview](#architecture-overview)
- [Project Structure](#project-structure)
- [Database Schema](#database-schema)
- [Prerequisites](#prerequisites)
- [Local Development Setup](#local-development-setup)
- [Environment Variables](#environment-variables)
- [Production Deployment (Ubuntu 22.04 VPS)](#production-deployment-ubuntu-2204-vps)
- [Payment Gateway Integration](#payment-gateway-integration)
- [API Reference](#api-reference)
  - [Response Format](#response-format)
  - [Authentication](#authentication-endpoints)
  - [Products](#product-endpoints)
  - [Categories](#category-endpoints)
  - [Cart](#cart-endpoints)
  - [Orders](#order-endpoints)
  - [Payments](#payment-endpoints)
  - [Admin Dashboard](#admin-endpoints)
- [Order Status Flow](#order-status-flow)
- [Rate Limiting](#rate-limiting)
- [Security Notes](#security-notes)

---

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js 18+ |
| Framework | Express.js 4 |
| Database | PostgreSQL 15 via Prisma ORM |
| Cache / Cart | Redis (ioredis) |
| Image Storage | Cloudinary (free tier friendly) |
| Authentication | JWT (access + refresh token) |
| Email | SendGrid (nodemailer SMTP) |
| SMS | Twilio or BulkSMSBD (switchable) |
| Payment | SSL Commerz + bKash PGW |
| Process Manager | PM2 (cluster mode) |
| Reverse Proxy | Nginx |
| CDN / DDoS | Cloudflare |

---

## Architecture Overview

```
                        ┌─────────────┐
                        │  Cloudflare  │  CDN + DDoS protection
                        └──────┬──────┘
                               │ HTTPS
                        ┌──────▼──────┐
                        │    Nginx     │  Reverse proxy + TLS termination
                        └──────┬──────┘
                               │ HTTP (127.0.0.1:5000)
               ┌───────────────▼───────────────┐
               │     PM2 Cluster (Node.js)       │
               │  ┌─────────────────────────┐   │
               │  │      Express App         │   │
               │  │  ┌──────────────────┐   │   │
               │  │  │   Middleware      │   │   │
               │  │  │  - Helmet / CORS  │   │   │
               │  │  │  - Rate Limiter   │   │   │
               │  │  │  - JWT Auth       │   │   │
               │  │  │  - Validator      │   │   │
               │  │  └────────┬─────────┘   │   │
               │  │           │             │   │
               │  │  ┌────────▼─────────┐   │   │
               │  │  │    Controllers    │   │   │
               │  │  │  Auth / Products  │   │   │
               │  │  │  Orders / Cart    │   │   │
               │  │  │  Payments / Admin │   │   │
               │  │  └────────┬─────────┘   │   │
               │  │           │             │   │
               │  │  ┌────────▼─────────┐   │   │
               │  │  │    Services       │   │   │
               │  │  │  SSLCommerz       │   │   │
               │  │  │  bKash PGW        │   │   │
               │  │  │  Email / SMS      │   │   │
               │  │  │  Cache (Redis)    │   │   │
               │  │  └──────────────────┘   │   │
               │  └─────────────────────────┘   │
               └───────────────────────────────┘
                       │              │
              ┌────────▼───┐   ┌──────▼──────┐
              │ PostgreSQL  │   │    Redis     │
              │  (Prisma)   │   │  (Cart/Cache)│
              └────────────┘   └─────────────┘
                       │
              ┌────────▼────────┐
              │   Cloudinary     │
              │  (Image Storage) │
              └─────────────────┘
```

### Request Lifecycle

```
Request → Nginx → Express
  → helmet() + cors() + compression()
  → morgan (logging)
  → generalLimiter (120 req/min)
  → Route match
    → authLimiter (auth routes only)
    → express-validator rules
    → validate middleware (422 on failure)
    → authenticate middleware (JWT check)
    → requireAdmin / requireCustomer (role guard)
    → Controller
      → Prisma (PostgreSQL)
      → Redis (cart / cache)
      → External services (SSLCommerz, bKash, Cloudinary, SendGrid, Twilio)
    → standardized JSON response
  → errorHandler (global catch)
→ Response
```

---

## Project Structure

```
bd-ecommerce/
├── server.js                   # App entry point
├── ecosystem.config.js         # PM2 config
├── nginx.conf                  # Nginx site config
├── package.json
├── .env.example
├── .gitignore
│
├── prisma/
│   ├── schema.prisma           # Database schema (all models)
│   └── seed.js                 # Admin user + sample data
│
└── src/
    ├── config/
    │   ├── database.js         # Prisma client singleton
    │   ├── redis.js            # ioredis client with reconnect
    │   └── cloudinary.js       # Cloudinary SDK + multer storage
    │
    ├── controllers/
    │   ├── authController.js   # register, login, token refresh, profile
    │   ├── productController.js# product CRUD, image management, categories
    │   ├── cartController.js   # cart operations (Redis-backed)
    │   ├── orderController.js  # order lifecycle, address book
    │   ├── paymentController.js# SSLCommerz + bKash flows + webhooks
    │   └── adminController.js  # dashboard stats, user management, reports
    │
    ├── routes/
    │   ├── auth.js             # /api/auth/*
    │   ├── products.js         # /api/products/*
    │   ├── cart.js             # /api/cart/*
    │   ├── orders.js           # /api/orders/*
    │   ├── payments.js         # /api/payments/*
    │   └── admin.js            # /api/admin/*
    │
    ├── middleware/
    │   ├── auth.js             # JWT authenticate, role guards, optionalAuth
    │   ├── errorHandler.js     # Global error handler
    │   ├── rateLimiter.js      # Per-route rate limits
    │   └── validate.js         # express-validator result checker
    │
    ├── services/
    │   ├── cacheService.js     # Redis cart + generic cache helpers
    │   ├── sslcommerzService.js# SSLCommerz init + validate
    │   ├── bkashService.js     # bKash token, create, execute, refund
    │   ├── emailService.js     # SendGrid order/status/welcome emails
    │   └── smsService.js       # Twilio / BulkSMSBD SMS
    │
    └── utils/
        ├── logger.js           # Winston (colorized dev, JSON prod)
        ├── response.js         # success(), error(), paginated() helpers
        └── helpers.js          # slugify, orderNumber, pagination, HMAC
```

---

## Database Schema

```
┌──────────┐         ┌──────────────┐
│   User   │────────<│   Address    │
└────┬─────┘         └──────────────┘
     │
     │  ┌──────────────────────────────────┐
     └─<│           Order                  │
        │  orderNumber, status, totals,    │
        │  shippingAddress (snapshot)      │
        └──┬───────────────────┬───────────┘
           │                   │
          <│  OrderItem        │  Payment
           │  productName*     │  method, status
           │  unitPrice*       │  SSLCommerz fields
           │  quantity         │  bKash fields
           │                   │  gatewayResponse (JSON)
     ┌─────┘
     │
┌────▼─────┐         ┌──────────────┐
│ Product  │────────<│ ProductImage │
│  sku     │         │  url (CDN)   │
│  price   │         │  publicId    │
│  stock   │         └──────────────┘
└────┬─────┘
     │
┌────▼─────┐
│ Category │──< children (self-referential tree)
└──────────┘

* = snapshot at time of order (price/name never change retroactively)
```

**Enums**

| Enum | Values |
|---|---|
| `Role` | `CUSTOMER`, `ADMIN` |
| `OrderStatus` | `PENDING` → `CONFIRMED` → `PROCESSING` → `SHIPPED` → `DELIVERED` \| `CANCELLED` \| `REFUNDED` |
| `PaymentStatus` | `PENDING`, `INITIATED`, `COMPLETED`, `FAILED`, `CANCELLED`, `REFUNDED` |
| `PaymentMethod` | `SSLCOMMERZ`, `BKASH`, `NAGAD`, `CARD`, `COD` |

---

## Prerequisites

| Tool | Version | Install |
|---|---|---|
| Node.js | 18+ | [nodejs.org](https://nodejs.org) |
| PostgreSQL | 14+ | `sudo apt install postgresql` |
| Redis | 6+ | `sudo apt install redis-server` |
| npm | 9+ | bundled with Node |

---

## Local Development Setup

> **Recommended:** Use Docker — see [Local Development Setup with Docker](#local-development-setup-with-docker) below. No need to install PostgreSQL or Redis locally.

### Without Docker

### 1. Clone and install dependencies

```bash
git clone <your-repo-url> bd-ecommerce
cd bd-ecommerce
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Minimum values required for local dev without Docker:

```env
DATABASE_URL="postgresql://postgres:yourpassword@localhost:5432/bd_ecommerce?schema=public"
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
JWT_SECRET=your-super-secret-key-at-least-64-characters-long
JWT_REFRESH_SECRET=another-super-secret-key-for-refresh-tokens
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret
FRONTEND_URL=http://localhost:3000
APP_URL=http://localhost:5000
```

### 3. Create the PostgreSQL database

```bash
psql -U postgres -c "CREATE DATABASE bd_ecommerce;"
```

### 4. Run migrations and seed

```bash
npx prisma generate
npx prisma migrate dev --name init
npm run prisma:seed
```

Seed creates:
- **Admin:** `admin@yourdomain.com` / `Admin@12345` (override via `.env`)
- **5 categories:** Electronics, Fashion, Home & Living, Health & Beauty, Sports
- **3 sample products** in Electronics

### 5. Start the development server

```bash
npm run dev
```

Server starts at `http://localhost:5000`. Health check: `GET http://localhost:5000/health`

### Useful Prisma commands

```bash
npx prisma studio          # Visual DB browser at localhost:5555
npx prisma migrate reset   # Wipe DB and re-run all migrations
npx prisma db push         # Push schema changes without a migration file
```

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `NODE_ENV` | Yes | `development` or `production` |
| `PORT` | No | Server port (default: `5000`) |
| `APP_URL` | Yes | Full URL of this API (used in payment callbacks) |
| `FRONTEND_URL` | Yes | Next.js frontend URL (CORS + payment redirects) |
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `REDIS_HOST` | Yes | Redis host |
| `REDIS_PORT` | Yes | Redis port |
| `REDIS_PASSWORD` | No | Redis password (if secured) |
| `JWT_SECRET` | Yes | Min 64 chars random string |
| `JWT_EXPIRES_IN` | No | Access token TTL (default: `7d`) |
| `JWT_REFRESH_SECRET` | Yes | Separate secret for refresh tokens |
| `JWT_REFRESH_EXPIRES_IN` | No | Refresh token TTL (default: `30d`) |
| `CLOUDINARY_CLOUD_NAME` | Yes | Cloudinary cloud name |
| `CLOUDINARY_API_KEY` | Yes | Cloudinary API key |
| `CLOUDINARY_API_SECRET` | Yes | Cloudinary API secret |
| `SSLCOMMERZ_STORE_ID` | Yes | SSL Commerz store ID |
| `SSLCOMMERZ_STORE_PASSWORD` | Yes | SSL Commerz store password |
| `SSLCOMMERZ_IS_LIVE` | Yes | `false` (sandbox) or `true` (live) |
| `BKASH_APP_KEY` | Yes | bKash PGW app key |
| `BKASH_APP_SECRET` | Yes | bKash PGW app secret |
| `BKASH_USERNAME` | Yes | bKash PGW username |
| `BKASH_PASSWORD` | Yes | bKash PGW password |
| `BKASH_BASE_URL` | Yes | bKash sandbox or production base URL |
| `BKASH_CALLBACK_URL` | Yes | Full URL for bKash callback (must be public) |
| `SENDGRID_API_KEY` | Yes | SendGrid API key |
| `EMAIL_FROM` | Yes | Sender email address |
| `EMAIL_FROM_NAME` | Yes | Sender display name |
| `TWILIO_ACCOUNT_SID` | Yes* | Twilio account SID (`SMS_PROVIDER=twilio`) |
| `TWILIO_AUTH_TOKEN` | Yes* | Twilio auth token |
| `TWILIO_PHONE_NUMBER` | Yes* | Twilio phone number |
| `BULKSMSBD_API_KEY` | Yes* | BulkSMSBD API key (`SMS_PROVIDER=bulksmsbd`) |
| `BULKSMSBD_SENDER_ID` | Yes* | BulkSMSBD sender ID |
| `SMS_PROVIDER` | No | `twilio` (default) or `bulksmsbd` |
| `ADMIN_EMAIL` | No | Seed admin email |
| `ADMIN_PASSWORD` | No | Seed admin password |
| `ADMIN_NAME` | No | Seed admin name |

---

## Local Development Setup with Docker

The fastest way to get the full stack running locally — no need to install PostgreSQL or Redis.

### Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (Mac/Windows) or Docker Engine + Compose plugin (Linux)

### Start

```bash
cp .env.example .env    # fill in external credentials (Cloudinary, SSLCommerz, bKash, etc.)
docker compose up --build
```

This starts three containers: `ecom_app` (Node/Express), `ecom_postgres`, `ecom_redis`.

The app waits for postgres and redis healthchecks before starting.

### First-time database setup

```bash
docker compose exec app npx prisma migrate dev --name init
docker compose exec app npm run prisma:seed
```

### Useful dev commands

```bash
docker compose up --build          # rebuild after adding npm packages
docker compose exec app npx prisma studio   # DB browser at localhost:5555
docker compose down -v             # wipe all data and start fresh
docker compose logs -f app         # tail app logs
```

> Add new npm packages on the host (`npm install <pkg>`), then `docker compose up --build` to rebuild the image.

---

## Production Deployment (Ubuntu 22.04 VPS)

### 1. Server initial setup

```bash
sudo apt update && sudo apt upgrade -y

# Docker Engine
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER && newgrp docker

# Nginx + Certbot
sudo apt install -y nginx certbot python3-certbot-nginx
```

### 2. Deploy the application

```bash
git clone <your-repo-url> /var/www/bd-ecommerce
cd /var/www/bd-ecommerce

cp .env.example .env
nano .env   # fill in all production values including POSTGRES_USER, POSTGRES_PASSWORD, POSTGRES_DB

# Start everything (builds image, runs migrate service, starts app)
docker compose -f docker-compose.prod.yml up -d --build
```

### 3. First-time database seed

```bash
docker compose -f docker-compose.prod.yml exec app node prisma/seed.js
```

### 4. Configure Nginx + TLS

```bash
sudo cp nginx.conf /etc/nginx/sites-available/bd-ecommerce
sudo nano /etc/nginx/sites-available/bd-ecommerce   # set your domain

sudo ln -s /etc/nginx/sites-available/bd-ecommerce /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

sudo certbot --nginx -d api.yourdomain.com
sudo systemctl reload nginx
```

### 5. Update deployment

```bash
cd /var/www/bd-ecommerce
git pull origin main
docker compose -f docker-compose.prod.yml up -d --build
```

> Migrations run automatically via the `migrate` one-shot service on every `up --build`.

### Useful production commands

```bash
docker compose -f docker-compose.prod.yml logs -f app        # tail logs
docker compose -f docker-compose.prod.yml ps                 # container status
docker compose -f docker-compose.prod.yml exec app npx prisma studio  # DB browser (dev only)
docker compose -f docker-compose.prod.yml restart app        # restart app container
```

---

## Payment Gateway Integration

### SSL Commerz Flow

```
Customer → POST /api/payments/sslcommerz/init
         ← { gatewayUrl }
Customer → Redirected to gatewayUrl (bKash/Nagad/card selection)
SSL Commerz → POST /api/payments/sslcommerz/success (form POST)
           ← Server re-validates via sslcz.validate(val_id)
           ← Updates payment + order status
           ← Redirects customer to FRONTEND_URL/payment/success
SSL Commerz → POST /api/payments/sslcommerz/ipn (server-to-server)
           ← Same validation, idempotent update
```

**Important:** Never trust the success callback alone. Always re-validate with `val_id` against the SSL Commerz API.

### bKash PGW Flow

```
Customer → POST /api/payments/bkash/create
         ← { bkashURL, paymentID }
Customer → Redirected to bkashURL (bKash app / USSD)
bKash   → GET /api/payments/bkash/callback?paymentID=...&status=success
        ← Server calls bKash execute API
        ← Updates payment + order status
        ← Redirects customer to FRONTEND_URL/payment/success
```

**Sandbox credentials:** Register at [developer.bka.sh](https://developer.bka.sh) for sandbox keys.

---

## API Reference

### Response Format

All endpoints return a consistent JSON envelope:

**Success**
```json
{
  "success": true,
  "message": "Success",
  "data": { }
}
```

**Paginated list**
```json
{
  "success": true,
  "message": "Success",
  "data": [ ],
  "meta": {
    "total": 100,
    "page": 1,
    "limit": 20,
    "totalPages": 5
  }
}
```

**Error**
```json
{
  "success": false,
  "message": "Error description"
}
```

**Validation error (422)**
```json
{
  "success": false,
  "message": "Validation failed",
  "errors": [
    { "field": "email", "message": "Valid email is required" }
  ]
}
```

### Authentication

Pass the access token as a Bearer token in the `Authorization` header:

```
Authorization: Bearer <accessToken>
```

---

## Authentication Endpoints

### Register

```
POST /api/auth/register
```

**Body**
```json
{
  "name": "Rahim Uddin",
  "email": "rahim@example.com",
  "phone": "01712345678",
  "password": "Secret@123"
}
```

> `phone` is optional. Password must be min 8 chars, contain 1 uppercase and 1 number.

**Response `201`**
```json
{
  "success": true,
  "message": "Registration successful",
  "data": {
    "user": {
      "id": "uuid",
      "name": "Rahim Uddin",
      "email": "rahim@example.com",
      "phone": "01712345678",
      "role": "CUSTOMER",
      "createdAt": "2024-01-15T10:30:00.000Z"
    },
    "accessToken": "eyJhbGci..."
  }
}
```

---

### Customer Login

```
POST /api/auth/login
```

**Body**
```json
{
  "email": "rahim@example.com",
  "password": "Secret@123"
}
```

**Response `200`**
```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "user": {
      "id": "uuid",
      "name": "Rahim Uddin",
      "email": "rahim@example.com",
      "role": "CUSTOMER"
    },
    "accessToken": "eyJhbGci...",
    "refreshToken": "eyJhbGci..."
  }
}
```

---

### Admin Login

```
POST /api/auth/admin/login
```

**Body**
```json
{
  "email": "admin@yourdomain.com",
  "password": "Admin@12345"
}
```

**Response `200`** — same shape as customer login with `role: "ADMIN"`

---

### Refresh Access Token

```
POST /api/auth/refresh
```

**Body**
```json
{
  "refreshToken": "eyJhbGci..."
}
```

**Response `200`**
```json
{
  "success": true,
  "message": "Token refreshed",
  "data": {
    "accessToken": "eyJhbGci..."
  }
}
```

---

### Logout

```
POST /api/auth/logout
Authorization: Bearer <token>
```

**Response `200`**
```json
{ "success": true, "message": "Logged out successfully", "data": null }
```

---

### Get My Profile

```
GET /api/auth/me
Authorization: Bearer <token>
```

**Response `200`**
```json
{
  "success": true,
  "message": "Success",
  "data": {
    "id": "uuid",
    "name": "Rahim Uddin",
    "email": "rahim@example.com",
    "phone": "01712345678",
    "role": "CUSTOMER",
    "avatar": null,
    "isEmailVerified": false,
    "createdAt": "2024-01-15T10:30:00.000Z",
    "address": [ ]
  }
}
```

---

### Update Profile

```
PATCH /api/auth/me
Authorization: Bearer <token>
```

**Body** (all fields optional)
```json
{
  "name": "Rahim Uddin Updated",
  "phone": "01898765432"
}
```

**Response `200`** — returns updated user fields

---

### Change Password

```
POST /api/auth/change-password
Authorization: Bearer <token>
```

**Body**
```json
{
  "currentPassword": "Secret@123",
  "newPassword": "NewSecret@456"
}
```

**Response `200`**
```json
{ "success": true, "message": "Password changed successfully", "data": null }
```

---

## Product Endpoints

### List Products

```
GET /api/products
```

**Query Parameters**

| Param | Type | Description |
|---|---|---|
| `page` | number | Page number (default: 1) |
| `limit` | number | Items per page (default: 20, max: 100) |
| `category` | string | Category slug |
| `search` | string | Full-text search on name, description, tags |
| `featured` | boolean | `true` to show only featured products |
| `minPrice` | number | Minimum price in BDT |
| `maxPrice` | number | Maximum price in BDT |
| `sort` | string | `price_asc`, `price_desc`, `newest`, `oldest` |

**Example**
```
GET /api/products?category=electronics&sort=price_asc&minPrice=1000&maxPrice=50000&page=1&limit=12
```

**Response `200`**
```json
{
  "success": true,
  "message": "Success",
  "data": [
    {
      "id": "uuid",
      "name": "Xiaomi Redmi 12C",
      "slug": "xiaomi-redmi-12c",
      "shortDescription": "6.71\" HD+ display, 5000mAh battery",
      "price": "14999.00",
      "comparePrice": "16999.00",
      "stock": 50,
      "isFeatured": true,
      "category": { "id": "uuid", "name": "Electronics", "slug": "electronics" },
      "images": [{ "url": "https://res.cloudinary.com/...", "altText": null }],
      "createdAt": "2024-01-15T10:30:00.000Z"
    }
  ],
  "meta": { "total": 48, "page": 1, "limit": 12, "totalPages": 4 }
}
```

---

### Get Single Product

```
GET /api/products/:slug
```

**Example:** `GET /api/products/xiaomi-redmi-12c`

**Response `200`**
```json
{
  "success": true,
  "message": "Success",
  "data": {
    "id": "uuid",
    "name": "Xiaomi Redmi 12C",
    "slug": "xiaomi-redmi-12c",
    "description": "Full product description...",
    "shortDescription": "6.71\" HD+ display, 5000mAh battery",
    "sku": "MOB-XMI-12C",
    "price": "14999.00",
    "comparePrice": "16999.00",
    "stock": 50,
    "weight": null,
    "tags": ["smartphone", "xiaomi", "budget phone"],
    "isFeatured": true,
    "category": { "id": "uuid", "name": "Electronics", "slug": "electronics" },
    "images": [
      {
        "id": "uuid",
        "url": "https://res.cloudinary.com/...",
        "publicId": "bd-ecommerce/products/abc123",
        "altText": null,
        "isPrimary": true,
        "sortOrder": 0
      }
    ],
    "createdAt": "2024-01-15T10:30:00.000Z",
    "updatedAt": "2024-01-15T10:30:00.000Z"
  }
}
```

---

### Create Product _(Admin)_

```
POST /api/products
Authorization: Bearer <admin_token>
Content-Type: application/json
```

**Body**
```json
{
  "name": "Samsung Galaxy A54 5G",
  "sku": "MOB-SAM-A54",
  "price": 42999,
  "comparePrice": 46000,
  "costPrice": 38000,
  "stock": 25,
  "lowStockAlert": 5,
  "categoryId": "uuid-of-electronics-category",
  "shortDescription": "6.4\" Super AMOLED, 5000mAh, 50MP camera",
  "description": "Full detailed description here...",
  "tags": ["smartphone", "samsung", "5g"],
  "weight": 202,
  "isFeatured": false
}
```

**Response `201`** — returns created product object

---

### Update Product _(Admin)_

```
PATCH /api/products/:id
Authorization: Bearer <admin_token>
```

**Body** (all fields optional — send only what you want to change)
```json
{
  "price": 40999,
  "stock": 30,
  "isFeatured": true
}
```

**Response `200`** — returns updated product object

---

### Delete Product _(Admin)_

```
DELETE /api/products/:id
Authorization: Bearer <admin_token>
```

> Soft-delete: sets `isActive = false`. Product is hidden from listings but order history is preserved.

**Response `200`**
```json
{ "success": true, "message": "Product deleted", "data": null }
```

---

### Upload Product Images _(Admin)_

```
POST /api/products/:id/images
Authorization: Bearer <admin_token>
Content-Type: multipart/form-data
```

**Form field:** `images` (multiple files, max 10, max 5MB each, JPG/PNG/WebP)

**Response `200`**
```json
{
  "success": true,
  "message": "Images uploaded",
  "data": [
    {
      "id": "uuid",
      "productId": "uuid",
      "url": "https://res.cloudinary.com/your-cloud/image/upload/...",
      "publicId": "bd-ecommerce/products/xyz",
      "isPrimary": true,
      "sortOrder": 0
    }
  ]
}
```

---

### Delete Product Image _(Admin)_

```
DELETE /api/products/images/:imageId
Authorization: Bearer <admin_token>
```

> Also deletes the image from Cloudinary.

**Response `200`**
```json
{ "success": true, "message": "Image deleted", "data": null }
```

---

### Update Stock _(Admin)_

```
PATCH /api/products/:id/stock
Authorization: Bearer <admin_token>
```

**Body**
```json
{ "stock": 100 }
```

**Response `200`**
```json
{
  "success": true,
  "message": "Stock updated",
  "data": { "id": "uuid", "name": "Xiaomi Redmi 12C", "stock": 100 }
}
```

---

## Category Endpoints

### List Categories

```
GET /api/products/categories
```

Returns top-level categories with their children (tree structure).

**Response `200`**
```json
{
  "success": true,
  "message": "Success",
  "data": [
    {
      "id": "uuid",
      "name": "Electronics",
      "slug": "electronics",
      "description": "Phones, laptops, gadgets",
      "imageUrl": null,
      "sortOrder": 0,
      "children": [
        { "id": "uuid", "name": "Smartphones", "slug": "smartphones" }
      ]
    }
  ]
}
```

---

### Create Category _(Admin)_

```
POST /api/products/categories
Authorization: Bearer <admin_token>
```

**Body**
```json
{
  "name": "Smartphones",
  "description": "Mobile phones and smartphones",
  "parentId": "uuid-of-electronics-category",
  "sortOrder": 1
}
```

**Response `201`** — returns created category object

---

## Cart Endpoints

All cart endpoints require authentication (`Authorization: Bearer <token>`).

Cart is stored in Redis with a 7-day TTL. Prices are always re-validated against the database on `GET /api/cart`.

### Get Cart

```
GET /api/cart
Authorization: Bearer <token>
```

**Response `200`**
```json
{
  "success": true,
  "message": "Success",
  "data": {
    "items": [
      {
        "productId": "uuid",
        "quantity": 2,
        "price": 14999,
        "name": "Xiaomi Redmi 12C",
        "imageUrl": "https://res.cloudinary.com/...",
        "inStock": true,
        "lineTotal": 29998
      }
    ],
    "subtotal": 29998
  }
}
```

---

### Add Item to Cart

```
POST /api/cart/items
Authorization: Bearer <token>
```

**Body**
```json
{
  "productId": "uuid-of-product",
  "quantity": 1
}
```

**Response `200`** — returns full updated cart items array

---

### Update Cart Item Quantity

```
PATCH /api/cart/items/:productId
Authorization: Bearer <token>
```

**Body**
```json
{ "quantity": 3 }
```

> Set `quantity` to `0` to remove the item.

**Response `200`** — returns full updated cart items array

---

### Remove Cart Item

```
DELETE /api/cart/items/:productId
Authorization: Bearer <token>
```

**Response `200`** — returns updated cart items array

---

### Clear Cart

```
DELETE /api/cart
Authorization: Bearer <token>
```

**Response `200`**
```json
{ "success": true, "message": "Cart cleared", "data": null }
```

---

## Order Endpoints

### Add Shipping Address

```
POST /api/orders/addresses
Authorization: Bearer <token>
```

**Body**
```json
{
  "label": "Home",
  "fullName": "Rahim Uddin",
  "phone": "01712345678",
  "line1": "House 12, Road 5, Block C",
  "line2": "Mirpur DOHS",
  "city": "Dhaka",
  "district": "Dhaka",
  "division": "Dhaka",
  "postalCode": "1216",
  "isDefault": true
}
```

**Response `201`** — returns created address object

---

### Get My Addresses

```
GET /api/orders/addresses
Authorization: Bearer <token>
```

**Response `200`** — array of address objects, default address first

---

### Place Order

```
POST /api/orders
Authorization: Bearer <token>
```

Takes items from the Redis cart, validates stock, creates the order, and decrements stock atomically.

**Body**
```json
{
  "addressId": "uuid-of-saved-address",
  "paymentMethod": "SSLCOMMERZ",
  "notes": "Please call before delivery"
}
```

> `paymentMethod` options: `SSLCOMMERZ`, `BKASH`, `NAGAD`, `CARD`, `COD`

**Response `201`**
```json
{
  "success": true,
  "message": "Order placed successfully",
  "data": {
    "id": "uuid",
    "orderNumber": "BD-20240115-54321",
    "status": "PENDING",
    "subtotal": "29998.00",
    "shippingFee": "60.00",
    "discount": "0.00",
    "total": "30058.00",
    "shippingName": "Rahim Uddin",
    "shippingPhone": "01712345678",
    "shippingLine1": "House 12, Road 5, Block C",
    "shippingCity": "Dhaka",
    "shippingDistrict": "Dhaka",
    "shippingDivision": "Dhaka",
    "items": [
      {
        "id": "uuid",
        "productName": "Xiaomi Redmi 12C",
        "productSku": "MOB-XMI-12C",
        "unitPrice": "14999.00",
        "quantity": 2,
        "total": "29998.00"
      }
    ],
    "createdAt": "2024-01-15T10:30:00.000Z"
  }
}
```

---

### Get My Orders

```
GET /api/orders
Authorization: Bearer <token>
```

**Query Parameters**

| Param | Description |
|---|---|
| `page` | Page number |
| `limit` | Items per page |
| `status` | Filter by status: `PENDING`, `CONFIRMED`, etc. |

**Response `200`** — paginated list of orders with items and payment status

---

### Get Order by ID

```
GET /api/orders/:id
Authorization: Bearer <token>
```

**Response `200`**
```json
{
  "success": true,
  "message": "Success",
  "data": {
    "id": "uuid",
    "orderNumber": "BD-20240115-54321",
    "status": "SHIPPED",
    "total": "30058.00",
    "items": [ ],
    "payment": {
      "method": "SSLCOMMERZ",
      "status": "COMPLETED",
      "paidAt": "2024-01-15T11:00:00.000Z"
    },
    "statusHistory": [
      { "status": "PENDING",   "note": "Order placed",              "createdAt": "..." },
      { "status": "CONFIRMED", "note": "Payment received via SSL Commerz", "createdAt": "..." },
      { "status": "SHIPPED",   "note": "Shipped via Pathao Courier", "createdAt": "..." }
    ]
  }
}
```

---

### Cancel Order

```
POST /api/orders/:id/cancel
Authorization: Bearer <token>
```

> Only orders in `PENDING` status can be cancelled by the customer.

**Response `200`**
```json
{ "success": true, "message": "Order cancelled", "data": null }
```

---

### Get All Orders _(Admin)_

```
GET /api/orders/admin/all
Authorization: Bearer <admin_token>
```

**Query Parameters:** `page`, `limit`, `status`, `search` (order number / customer name / email)

**Response `200`** — paginated list including user details

---

### Update Order Status _(Admin)_

```
PATCH /api/orders/admin/:id/status
Authorization: Bearer <admin_token>
```

**Body**
```json
{
  "status": "SHIPPED",
  "note": "Shipped via Pathao Courier, tracking: PTH123456"
}
```

> Valid transitions are enforced. See [Order Status Flow](#order-status-flow).

**Response `200`**
```json
{ "success": true, "message": "Order status updated", "data": { "id": "uuid", "status": "SHIPPED" } }
```

---

## Payment Endpoints

### Initiate SSL Commerz Payment

```
POST /api/payments/sslcommerz/init
Authorization: Bearer <token>
```

**Body**
```json
{ "orderId": "uuid-of-order" }
```

**Response `200`**
```json
{
  "success": true,
  "message": "Payment session created",
  "data": {
    "gatewayUrl": "https://sandbox.sslcommerz.com/EasyCheckOut/testcdef...",
    "sessionKey": "SSLK_SESSION_KEY"
  }
}
```

**Next step:** Redirect the customer browser to `gatewayUrl`.

---

### SSL Commerz Callbacks _(Gateway → Server)_

These are called by SSL Commerz directly — **not by your frontend**. Configure these URLs in your SSL Commerz merchant panel.

| Endpoint | Method | Description |
|---|---|---|
| `POST /api/payments/sslcommerz/success` | POST | Called on successful payment |
| `POST /api/payments/sslcommerz/fail` | POST | Called on failed payment |
| `POST /api/payments/sslcommerz/cancel` | POST | Called when customer cancels |
| `POST /api/payments/sslcommerz/ipn` | POST | Instant Payment Notification (server-to-server) |

All success/fail/cancel callbacks redirect the customer browser to `FRONTEND_URL/payment/{success|fail|cancel}?orderId=...`

---

### Create bKash Payment

```
POST /api/payments/bkash/create
Authorization: Bearer <token>
```

**Body**
```json
{ "orderId": "uuid-of-order" }
```

**Response `200`**
```json
{
  "success": true,
  "message": "bKash payment created",
  "data": {
    "bkashURL": "https://sandbox.payment.bkash.com/?paymentId=...",
    "paymentID": "TR001234567890"
  }
}
```

**Next step:** Redirect the customer to `bkashURL`.

---

### bKash Callback _(Gateway → Server)_

```
GET /api/payments/bkash/callback?paymentID=...&status=success
```

Called by bKash after customer completes payment. Executes the payment and redirects to `FRONTEND_URL/payment/success`.

---

### Get Payment Status

```
GET /api/payments/:orderId/status
Authorization: Bearer <token>
```

**Response `200`**
```json
{
  "success": true,
  "message": "Success",
  "data": {
    "id": "uuid",
    "orderId": "uuid",
    "method": "SSLCOMMERZ",
    "status": "COMPLETED",
    "amount": "30058.00",
    "currency": "BDT",
    "sslTransactionId": "...",
    "paidAt": "2024-01-15T11:00:00.000Z"
  }
}
```

---

## Admin Endpoints

All admin endpoints require `Authorization: Bearer <admin_token>`.

### Get Dashboard Stats

```
GET /api/admin/dashboard
Authorization: Bearer <admin_token>
```

**Response `200`**
```json
{
  "success": true,
  "message": "Success",
  "data": {
    "orders": {
      "total": 1250,
      "thisMonth": 87,
      "today": 12,
      "pending": 5,
      "byStatus": {
        "PENDING": 5,
        "CONFIRMED": 12,
        "PROCESSING": 8,
        "SHIPPED": 21,
        "DELIVERED": 1180,
        "CANCELLED": 24
      }
    },
    "revenue": {
      "total": 4850000.00,
      "thisMonth": 320000.00,
      "today": 45000.00,
      "last7Days": [
        { "date": "2024-01-09", "revenue": 42000 },
        { "date": "2024-01-10", "revenue": 38000 },
        { "date": "2024-01-11", "revenue": 55000 },
        { "date": "2024-01-12", "revenue": 41000 },
        { "date": "2024-01-13", "revenue": 60000 },
        { "date": "2024-01-14", "revenue": 50000 },
        { "date": "2024-01-15", "revenue": 45000 }
      ]
    },
    "customers": {
      "total": 3400,
      "newThisMonth": 145
    },
    "lowStockProducts": [
      { "id": "uuid", "name": "boAt Earphones", "stock": 3, "lowStockAlert": 5 }
    ],
    "recentOrders": [ ]
  }
}
```

---

### List Users _(Admin)_

```
GET /api/admin/users
Authorization: Bearer <admin_token>
```

**Query Parameters:** `page`, `limit`, `role` (`CUSTOMER`/`ADMIN`), `search`, `active` (`true`/`false`)

**Response `200`** — paginated list with order count per user

---

### Toggle User Status _(Admin)_

```
PATCH /api/admin/users/:id/status
Authorization: Bearer <admin_token>
```

Toggles `isActive` between `true` and `false`.

**Response `200`**
```json
{
  "success": true,
  "message": "User deactivated",
  "data": { "id": "uuid", "name": "Rahim Uddin", "email": "rahim@example.com", "isActive": false }
}
```

---

### Sales Report _(Admin)_

```
GET /api/admin/sales-report?from=2024-01-01&to=2024-01-31
Authorization: Bearer <admin_token>
```

**Query Parameters**

| Param | Type | Description |
|---|---|---|
| `from` | date string | Report start date (default: 30 days ago) |
| `to` | date string | Report end date (default: today) |

**Response `200`**
```json
{
  "success": true,
  "message": "Success",
  "data": {
    "summary": {
      "totalRevenue": 320000.00,
      "totalOrders": 87,
      "averageOrderValue": 3678.16
    },
    "topProducts": [
      {
        "productId": "uuid",
        "productName": "Samsung Galaxy A34 5G",
        "_sum": { "quantity": 12, "total": "419988.00" }
      }
    ],
    "paymentMethods": [
      { "method": "SSLCOMMERZ", "_count": { "_all": 55 }, "_sum": { "amount": "198000.00" } },
      { "method": "BKASH",      "_count": { "_all": 28 }, "_sum": { "amount": "96000.00"  } },
      { "method": "COD",        "_count": { "_all": 4  }, "_sum": { "amount": "26000.00"  } }
    ],
    "transactions": [ ]
  }
}
```

---

## Order Status Flow

```
                    ┌─────────┐
           order    │ PENDING │
          placed    └────┬────┘
                         │ admin confirms / payment received
                    ┌────▼─────┐
                    │CONFIRMED │
                    └────┬─────┘
                         │ admin starts processing
                   ┌─────▼──────┐
                   │ PROCESSING │
                   └─────┬──────┘
                         │ dispatched
                    ┌────▼─────┐
                    │ SHIPPED  │
                    └────┬─────┘
                         │ delivered to customer
                   ┌─────▼──────┐
                   │ DELIVERED  │
                   └─────┬──────┘
                         │ refund requested
                   ┌─────▼──────┐
                   │  REFUNDED  │
                   └────────────┘

  ─ ─ ─ From PENDING, CONFIRMED, or PROCESSING:
                   ┌────────────┐
                   │ CANCELLED  │
                   └────────────┘
```

| Current Status | Allowed Next Statuses |
|---|---|
| `PENDING` | `CONFIRMED`, `CANCELLED` |
| `CONFIRMED` | `PROCESSING`, `CANCELLED` |
| `PROCESSING` | `SHIPPED`, `CANCELLED` |
| `SHIPPED` | `DELIVERED` |
| `DELIVERED` | `REFUNDED` |
| `CANCELLED` | _(terminal)_ |
| `REFUNDED` | _(terminal)_ |

---

## Rate Limiting

| Route Group | Window | Max Requests |
|---|---|---|
| `POST /api/auth/register` | 15 min | 10 |
| `POST /api/auth/login` | 15 min | 10 |
| `POST /api/auth/admin/login` | 15 min | 10 |
| `POST /api/payments/*/init` | 5 min | 20 |
| All other `/api/*` routes | 1 min | 120 |

Exceeding limits returns:
```json
{ "success": false, "message": "Too many attempts. Please try again after 15 minutes." }
```

---

## Security Notes

- **JWT secrets** must be at least 64 random characters. Generate with: `openssl rand -hex 64`
- **SSL Commerz webhooks** — always re-validate using `val_id` against the SSL Commerz API. Never trust the callback payload alone.
- **bKash token** — cached in-memory with 60s early refresh. Never exposed to clients.
- **Passwords** — hashed with bcrypt (cost factor 12).
- **Refresh tokens** — stored as bcrypt hash in the database. Invalidated on logout.
- **Helmet.js** — sets secure HTTP headers (CSP, HSTS, X-Frame-Options, etc.).
- **CORS** — restricted to `FRONTEND_URL` only.
- **Trust proxy** — enabled so `req.ip` reflects the real client IP behind Nginx/Cloudflare.
- **Input validation** — all user inputs are validated with `express-validator` before reaching controllers.
- **SQL injection** — fully prevented by Prisma's parameterized queries.
- **File uploads** — restricted to image MIME types and 5MB size limit before reaching Cloudinary.
