# API Documentation

Base URL: `http://localhost:5000/api` (development)
Production: `https://api.yourdomain.com/api`

---

## Table of Contents

- [Conventions](#conventions)
- [Authentication](#authentication)
- [Auth Endpoints](#auth-endpoints)
- [Product Endpoints](#product-endpoints)
- [Category Endpoints](#category-endpoints)
- [Cart Endpoints](#cart-endpoints)
- [Order Endpoints](#order-endpoints)
- [Payment Endpoints](#payment-endpoints)
- [Admin Endpoints](#admin-endpoints)
- [Error Codes](#error-codes)

---

## Conventions

### Authorization Header

All protected routes require:

```
Authorization: Bearer <accessToken>
```

### Standard Response Envelope

Every response follows this shape:

```json
{
  "success": true | false,
  "message": "Human readable message",
  "data": { } | [ ] | null
}
```

### Paginated Response

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

### Validation Error `422`

```json
{
  "success": false,
  "message": "Validation failed",
  "errors": [
    { "field": "email", "message": "Valid email is required" },
    { "field": "password", "message": "Password must be at least 8 characters" }
  ]
}
```

### Route Access Legend

| Badge | Meaning |
|---|---|
| `PUBLIC` | No authentication required |
| `AUTH` | Requires valid customer or admin JWT |
| `CUSTOMER` | Requires customer JWT |
| `ADMIN` | Requires admin JWT |

---

## Auth Endpoints

### POST `/auth/register` `PUBLIC`

Register a new customer account.

**Request Body**

```json
{
  "name": "Rahim Uddin",
  "email": "rahim@example.com",
  "phone": "01712345678",
  "password": "Secret@123"
}
```

| Field | Type | Required | Rules |
|---|---|---|---|
| `name` | string | Yes | Non-empty |
| `email` | string | Yes | Valid email format |
| `phone` | string | No | Valid BD mobile number |
| `password` | string | Yes | Min 8 chars, 1 uppercase, 1 number |

**Response `201`**

```json
{
  "success": true,
  "message": "Registration successful",
  "data": {
    "user": {
      "id": "3f2504e0-4f89-11d3-9a0c-0305e82c3301",
      "name": "Rahim Uddin",
      "email": "rahim@example.com",
      "phone": "01712345678",
      "role": "CUSTOMER",
      "createdAt": "2024-01-15T10:30:00.000Z"
    },
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

**Error Responses**

| Status | Message |
|---|---|
| `409` | Email or phone already registered |
| `422` | Validation failed |

---

### POST `/auth/login` `PUBLIC`

Login as customer.

**Request Body**

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
      "id": "3f2504e0-4f89-11d3-9a0c-0305e82c3301",
      "name": "Rahim Uddin",
      "email": "rahim@example.com",
      "phone": "01712345678",
      "role": "CUSTOMER"
    },
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

**Error Responses**

| Status | Message |
|---|---|
| `401` | Invalid email or password |
| `403` | Account is deactivated |

---

### POST `/auth/admin/login` `PUBLIC`

Login as admin.

**Request Body**

```json
{
  "email": "admin@yourdomain.com",
  "password": "Admin@12345"
}
```

**Response `200`**

```json
{
  "success": true,
  "message": "Admin login successful",
  "data": {
    "user": {
      "id": "3f2504e0-4f89-11d3-9a0c-0305e82c3301",
      "name": "Super Admin",
      "email": "admin@yourdomain.com",
      "role": "ADMIN"
    },
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

**Error Responses**

| Status | Message |
|---|---|
| `401` | Invalid credentials |
| `403` | Account is deactivated |

---

### POST `/auth/refresh` `PUBLIC`

Get a new access token using a refresh token.

**Request Body**

```json
{
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Response `200`**

```json
{
  "success": true,
  "message": "Token refreshed",
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

**Error Responses**

| Status | Message |
|---|---|
| `400` | Refresh token required |
| `401` | Invalid or expired refresh token |
| `401` | Session revoked |

---

### POST `/auth/logout` `AUTH`

Revoke refresh token and end session.

**Request Body** — none

**Response `200`**

```json
{
  "success": true,
  "message": "Logged out successfully",
  "data": null
}
```

---

### GET `/auth/me` `AUTH`

Get the currently authenticated user's profile.

**Response `200`**

```json
{
  "success": true,
  "message": "Success",
  "data": {
    "id": "3f2504e0-4f89-11d3-9a0c-0305e82c3301",
    "name": "Rahim Uddin",
    "email": "rahim@example.com",
    "phone": "01712345678",
    "role": "CUSTOMER",
    "avatar": null,
    "isEmailVerified": false,
    "createdAt": "2024-01-15T10:30:00.000Z",
    "address": [
      {
        "id": "uuid",
        "label": "Home",
        "fullName": "Rahim Uddin",
        "phone": "01712345678",
        "line1": "House 12, Road 5, Block C",
        "city": "Dhaka",
        "district": "Dhaka",
        "division": "Dhaka",
        "isDefault": true
      }
    ]
  }
}
```

---

### PATCH `/auth/me` `AUTH`

Update profile name or phone.

**Request Body** _(all fields optional)_

```json
{
  "name": "Rahim Uddin Khan",
  "phone": "01898765432"
}
```

**Response `200`**

```json
{
  "success": true,
  "message": "Profile updated",
  "data": {
    "id": "3f2504e0-4f89-11d3-9a0c-0305e82c3301",
    "name": "Rahim Uddin Khan",
    "email": "rahim@example.com",
    "phone": "01898765432",
    "avatar": null
  }
}
```

---

### POST `/auth/change-password` `AUTH`

Change account password.

**Request Body**

```json
{
  "currentPassword": "Secret@123",
  "newPassword": "NewSecret@456"
}
```

**Response `200`**

```json
{
  "success": true,
  "message": "Password changed successfully",
  "data": null
}
```

**Error Responses**

| Status | Message |
|---|---|
| `400` | Current password is incorrect |

---

## Product Endpoints

### GET `/products` `PUBLIC`

List all active products with filtering, searching and pagination.

**Query Parameters**

| Param | Type | Default | Description |
|---|---|---|---|
| `page` | number | `1` | Page number |
| `limit` | number | `20` | Items per page (max 100) |
| `category` | string | — | Filter by category slug |
| `search` | string | — | Search name, description, tags |
| `featured` | boolean | — | `true` to show featured only |
| `minPrice` | number | — | Min price in BDT |
| `maxPrice` | number | — | Max price in BDT |
| `sort` | string | `newest` | `price_asc` `price_desc` `newest` `oldest` |

**Example Request**

```
GET /products?category=electronics&sort=price_asc&minPrice=1000&maxPrice=50000&page=1&limit=12
```

**Response `200`**

```json
{
  "success": true,
  "message": "Success",
  "data": [
    {
      "id": "3f2504e0-4f89-11d3-9a0c-0305e82c3301",
      "name": "Xiaomi Redmi 12C",
      "slug": "xiaomi-redmi-12c",
      "shortDescription": "6.71\" HD+ display, 5000mAh battery, 50MP camera",
      "sku": "MOB-XMI-12C",
      "price": "14999.00",
      "comparePrice": "16999.00",
      "stock": 50,
      "isFeatured": true,
      "tags": ["smartphone", "xiaomi", "budget phone"],
      "category": {
        "id": "uuid",
        "name": "Electronics",
        "slug": "electronics"
      },
      "images": [
        {
          "url": "https://res.cloudinary.com/your-cloud/image/upload/v1/bd-ecommerce/products/abc.jpg",
          "altText": null
        }
      ],
      "createdAt": "2024-01-15T10:30:00.000Z"
    }
  ],
  "meta": {
    "total": 48,
    "page": 1,
    "limit": 12,
    "totalPages": 4
  }
}
```

---

### GET `/products/:slug` `PUBLIC`

Get full details of a single product by its slug.

**Example Request**

```
GET /products/xiaomi-redmi-12c
```

**Response `200`**

```json
{
  "success": true,
  "message": "Success",
  "data": {
    "id": "3f2504e0-4f89-11d3-9a0c-0305e82c3301",
    "name": "Xiaomi Redmi 12C",
    "slug": "xiaomi-redmi-12c",
    "description": "The Xiaomi Redmi 12C comes with a 6.71-inch HD+ display...",
    "shortDescription": "6.71\" HD+ display, 5000mAh battery, 50MP camera",
    "sku": "MOB-XMI-12C",
    "price": "14999.00",
    "comparePrice": "16999.00",
    "stock": 50,
    "lowStockAlert": 5,
    "weight": null,
    "tags": ["smartphone", "xiaomi", "budget phone"],
    "isFeatured": true,
    "isActive": true,
    "category": {
      "id": "uuid",
      "name": "Electronics",
      "slug": "electronics"
    },
    "images": [
      {
        "id": "uuid",
        "url": "https://res.cloudinary.com/your-cloud/image/upload/v1/bd-ecommerce/products/abc.jpg",
        "publicId": "bd-ecommerce/products/abc",
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

**Error Responses**

| Status | Message |
|---|---|
| `404` | Product not found |

---

### POST `/products` `ADMIN`

Create a new product.

**Request Body**

```json
{
  "name": "Samsung Galaxy A54 5G",
  "sku": "MOB-SAM-A54",
  "price": 42999,
  "comparePrice": 46000,
  "costPrice": 38000,
  "stock": 25,
  "lowStockAlert": 5,
  "categoryId": "3f2504e0-4f89-11d3-9a0c-0305e82c3301",
  "shortDescription": "6.4\" Super AMOLED, 5000mAh, 50MP triple camera",
  "description": "Full detailed description here...",
  "tags": ["smartphone", "samsung", "5g"],
  "weight": 202,
  "isFeatured": false
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `name` | string | Yes | Product display name |
| `sku` | string | Yes | Unique stock keeping unit |
| `price` | number | Yes | Selling price in BDT |
| `comparePrice` | number | No | Original / MRP price (shows discount) |
| `costPrice` | number | No | Internal cost price |
| `stock` | number | Yes | Initial stock quantity |
| `lowStockAlert` | number | No | Alert threshold (default: 5) |
| `categoryId` | UUID | Yes | Parent category UUID |
| `shortDescription` | string | No | One-liner for listing cards |
| `description` | string | No | Full HTML/text description |
| `tags` | string[] | No | Array or comma-separated string |
| `weight` | number | No | Weight in grams |
| `isFeatured` | boolean | No | Show in featured section |

**Response `201`**

```json
{
  "success": true,
  "message": "Product created",
  "data": {
    "id": "uuid",
    "name": "Samsung Galaxy A54 5G",
    "slug": "samsung-galaxy-a54-5g",
    "sku": "MOB-SAM-A54",
    "price": "42999.00",
    "comparePrice": "46000.00",
    "stock": 25,
    "isActive": true,
    "isFeatured": false,
    "createdAt": "2024-01-15T10:30:00.000Z"
  }
}
```

---

### PATCH `/products/:id` `ADMIN`

Update an existing product. All fields are optional — send only what needs to change.

**Request Body**

```json
{
  "price": 40999,
  "comparePrice": 46000,
  "stock": 30,
  "isFeatured": true,
  "isActive": true
}
```

**Response `200`**

```json
{
  "success": true,
  "message": "Product updated",
  "data": {
    "id": "uuid",
    "name": "Samsung Galaxy A54 5G",
    "price": "40999.00",
    "stock": 30,
    "isFeatured": true,
    "updatedAt": "2024-01-16T08:00:00.000Z"
  }
}
```

---

### DELETE `/products/:id` `ADMIN`

Soft-delete a product (`isActive = false`). Order history is preserved.

**Response `200`**

```json
{
  "success": true,
  "message": "Product deleted",
  "data": null
}
```

---

### POST `/products/:id/images` `ADMIN`

Upload one or more product images to Cloudinary.

**Request** — `multipart/form-data`

| Field | Type | Limit |
|---|---|---|
| `images` | File (multiple) | Max 10 files, 5MB each, JPG/PNG/WebP only |

**Response `200`**

```json
{
  "success": true,
  "message": "Images uploaded",
  "data": [
    {
      "id": "uuid",
      "productId": "uuid",
      "url": "https://res.cloudinary.com/your-cloud/image/upload/v1/bd-ecommerce/products/xyz.jpg",
      "publicId": "bd-ecommerce/products/xyz",
      "altText": null,
      "isPrimary": true,
      "sortOrder": 0
    },
    {
      "id": "uuid",
      "productId": "uuid",
      "url": "https://res.cloudinary.com/your-cloud/image/upload/v1/bd-ecommerce/products/xyz2.jpg",
      "publicId": "bd-ecommerce/products/xyz2",
      "isPrimary": false,
      "sortOrder": 1
    }
  ]
}
```

---

### DELETE `/products/images/:imageId` `ADMIN`

Delete a product image from both the database and Cloudinary.

**Response `200`**

```json
{
  "success": true,
  "message": "Image deleted",
  "data": null
}
```

**Error Responses**

| Status | Message |
|---|---|
| `404` | Image not found |

---

### PATCH `/products/:id/stock` `ADMIN`

Set absolute stock quantity for a product.

**Request Body**

```json
{
  "stock": 100
}
```

**Response `200`**

```json
{
  "success": true,
  "message": "Stock updated",
  "data": {
    "id": "uuid",
    "name": "Xiaomi Redmi 12C",
    "stock": 100
  }
}
```

---

## Category Endpoints

### GET `/products/categories` `PUBLIC`

Get all active top-level categories with their subcategories.

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
      "isActive": true,
      "sortOrder": 0,
      "children": [
        {
          "id": "uuid",
          "name": "Smartphones",
          "slug": "smartphones",
          "isActive": true,
          "sortOrder": 0
        },
        {
          "id": "uuid",
          "name": "Laptops",
          "slug": "laptops",
          "isActive": true,
          "sortOrder": 1
        }
      ]
    },
    {
      "id": "uuid",
      "name": "Fashion",
      "slug": "fashion",
      "description": "Clothing, shoes, accessories",
      "imageUrl": null,
      "children": []
    }
  ]
}
```

---

### POST `/products/categories` `ADMIN`

Create a new category or subcategory.

**Request Body**

```json
{
  "name": "Smartphones",
  "description": "Mobile phones and smartphones",
  "parentId": "uuid-of-electronics-category",
  "imageUrl": "https://example.com/image.jpg",
  "sortOrder": 1
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `name` | string | Yes | Unique category name |
| `description` | string | No | Short description |
| `parentId` | UUID | No | Parent category (omit for top-level) |
| `imageUrl` | string | No | Category banner URL |
| `sortOrder` | number | No | Display order (default: 0) |

**Response `201`**

```json
{
  "success": true,
  "message": "Category created",
  "data": {
    "id": "uuid",
    "name": "Smartphones",
    "slug": "smartphones",
    "description": "Mobile phones and smartphones",
    "parentId": "uuid",
    "isActive": true,
    "sortOrder": 1,
    "createdAt": "2024-01-15T10:30:00.000Z"
  }
}
```

---

## Cart Endpoints

All cart routes require authentication. Cart is stored in Redis with a 7-day TTL. Prices are re-fetched from the database on every `GET` to prevent stale pricing.

### GET `/cart` `AUTH`

Get current cart with live prices and stock status.

**Response `200`**

```json
{
  "success": true,
  "message": "Success",
  "data": {
    "items": [
      {
        "productId": "3f2504e0-4f89-11d3-9a0c-0305e82c3301",
        "quantity": 2,
        "price": 14999,
        "name": "Xiaomi Redmi 12C",
        "imageUrl": "https://res.cloudinary.com/your-cloud/image/upload/v1/...",
        "inStock": true,
        "lineTotal": 29998
      },
      {
        "productId": "uuid",
        "quantity": 1,
        "price": 499,
        "name": "boAt Bassheads 100",
        "imageUrl": "https://res.cloudinary.com/your-cloud/image/upload/v1/...",
        "inStock": true,
        "lineTotal": 499
      }
    ],
    "subtotal": 30497
  }
}
```

---

### POST `/cart/items` `AUTH`

Add a product to the cart. If the product already exists, quantity is incremented.

**Request Body**

```json
{
  "productId": "3f2504e0-4f89-11d3-9a0c-0305e82c3301",
  "quantity": 1
}
```

| Field | Type | Required | Rules |
|---|---|---|---|
| `productId` | UUID | Yes | Must be a valid active product |
| `quantity` | number | Yes | Min 1 |

**Response `200`**

```json
{
  "success": true,
  "message": "Item added to cart",
  "data": [
    {
      "productId": "uuid",
      "quantity": 2,
      "price": 14999,
      "name": "Xiaomi Redmi 12C"
    }
  ]
}
```

**Error Responses**

| Status | Message |
|---|---|
| `404` | Product not found |
| `400` | Only `{n}` units available |

---

### PATCH `/cart/items/:productId` `AUTH`

Update the quantity of a cart item. Set `quantity` to `0` to remove the item.

**Request Body**

```json
{
  "quantity": 3
}
```

**Response `200`** — returns full updated cart array

**Error Responses**

| Status | Message |
|---|---|
| `400` | Only `{n}` units available |

---

### DELETE `/cart/items/:productId` `AUTH`

Remove a specific item from the cart.

**Response `200`** — returns remaining cart items array

---

### DELETE `/cart` `AUTH`

Clear all items from the cart.

**Response `200`**

```json
{
  "success": true,
  "message": "Cart cleared",
  "data": null
}
```

---

## Order Endpoints

### POST `/orders/addresses` `AUTH`

Save a shipping address to the address book.

**Request Body**

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

| Field | Type | Required | Description |
|---|---|---|---|
| `label` | string | No | `Home`, `Work`, or custom label |
| `fullName` | string | Yes | Recipient full name |
| `phone` | string | Yes | Valid BD phone number |
| `line1` | string | Yes | Street address line 1 |
| `line2` | string | No | Apartment / area |
| `city` | string | Yes | City |
| `district` | string | Yes | District |
| `division` | string | Yes | Division |
| `postalCode` | string | No | Postal code |
| `isDefault` | boolean | No | Set as default address |

**Response `201`**

```json
{
  "success": true,
  "message": "Address added",
  "data": {
    "id": "uuid",
    "userId": "uuid",
    "label": "Home",
    "fullName": "Rahim Uddin",
    "phone": "01712345678",
    "line1": "House 12, Road 5, Block C",
    "line2": "Mirpur DOHS",
    "city": "Dhaka",
    "district": "Dhaka",
    "division": "Dhaka",
    "postalCode": "1216",
    "isDefault": true,
    "createdAt": "2024-01-15T10:30:00.000Z"
  }
}
```

---

### GET `/orders/addresses` `AUTH`

Get all saved addresses. Default address appears first.

**Response `200`**

```json
{
  "success": true,
  "message": "Success",
  "data": [
    {
      "id": "uuid",
      "label": "Home",
      "fullName": "Rahim Uddin",
      "phone": "01712345678",
      "line1": "House 12, Road 5, Block C",
      "city": "Dhaka",
      "district": "Dhaka",
      "division": "Dhaka",
      "postalCode": "1216",
      "isDefault": true
    }
  ]
}
```

---

### POST `/orders` `AUTH`

Place an order from the current cart. Validates stock, creates the order, decrements stock, and clears the cart — all atomically.

**Request Body**

```json
{
  "addressId": "uuid-of-saved-address",
  "paymentMethod": "SSLCOMMERZ",
  "notes": "Please call before delivery"
}
```

| Field | Type | Required | Values |
|---|---|---|---|
| `addressId` | UUID | Yes | Must belong to current user |
| `paymentMethod` | string | No | `SSLCOMMERZ` `BKASH` `NAGAD` `CARD` `COD` |
| `notes` | string | No | Delivery instructions |

**Response `201`**

```json
{
  "success": true,
  "message": "Order placed successfully",
  "data": {
    "id": "3f2504e0-4f89-11d3-9a0c-0305e82c3301",
    "orderNumber": "BD-20240115-54321",
    "status": "PENDING",
    "subtotal": "30497.00",
    "shippingFee": "60.00",
    "discount": "0.00",
    "total": "30557.00",
    "shippingName": "Rahim Uddin",
    "shippingPhone": "01712345678",
    "shippingLine1": "House 12, Road 5, Block C",
    "shippingLine2": "Mirpur DOHS",
    "shippingCity": "Dhaka",
    "shippingDistrict": "Dhaka",
    "shippingDivision": "Dhaka",
    "shippingPostal": "1216",
    "notes": "Please call before delivery",
    "items": [
      {
        "id": "uuid",
        "productName": "Xiaomi Redmi 12C",
        "productSku": "MOB-XMI-12C",
        "imageUrl": "https://res.cloudinary.com/...",
        "unitPrice": "14999.00",
        "quantity": 2,
        "total": "29998.00"
      },
      {
        "id": "uuid",
        "productName": "boAt Bassheads 100",
        "productSku": "EAR-BOAT-BH100",
        "unitPrice": "499.00",
        "quantity": 1,
        "total": "499.00"
      }
    ],
    "createdAt": "2024-01-15T11:00:00.000Z"
  }
}
```

**Error Responses**

| Status | Message |
|---|---|
| `400` | Cart is empty |
| `400` | Product `"name"` is no longer available |
| `400` | Insufficient stock for `"name"`. Available: `{n}` |
| `404` | Shipping address not found |

---

### GET `/orders` `AUTH`

Get current user's order history with pagination.

**Query Parameters**

| Param | Type | Description |
|---|---|---|
| `page` | number | Page number (default: 1) |
| `limit` | number | Items per page (default: 20) |
| `status` | string | Filter: `PENDING` `CONFIRMED` `PROCESSING` `SHIPPED` `DELIVERED` `CANCELLED` |

**Example**

```
GET /orders?status=SHIPPED&page=1&limit=10
```

**Response `200`**

```json
{
  "success": true,
  "message": "Success",
  "data": [
    {
      "id": "uuid",
      "orderNumber": "BD-20240115-54321",
      "status": "SHIPPED",
      "total": "30557.00",
      "items": [
        {
          "productName": "Xiaomi Redmi 12C",
          "quantity": 2,
          "unitPrice": "14999.00",
          "total": "29998.00"
        }
      ],
      "payment": {
        "status": "COMPLETED",
        "method": "SSLCOMMERZ"
      },
      "createdAt": "2024-01-15T11:00:00.000Z"
    }
  ],
  "meta": {
    "total": 8,
    "page": 1,
    "limit": 10,
    "totalPages": 1
  }
}
```

---

### GET `/orders/:id` `AUTH`

Get full details of a single order including status history timeline.

**Response `200`**

```json
{
  "success": true,
  "message": "Success",
  "data": {
    "id": "3f2504e0-4f89-11d3-9a0c-0305e82c3301",
    "orderNumber": "BD-20240115-54321",
    "status": "SHIPPED",
    "subtotal": "30497.00",
    "shippingFee": "60.00",
    "discount": "0.00",
    "total": "30557.00",
    "shippingName": "Rahim Uddin",
    "shippingPhone": "01712345678",
    "shippingLine1": "House 12, Road 5, Block C",
    "shippingCity": "Dhaka",
    "notes": "Please call before delivery",
    "items": [
      {
        "id": "uuid",
        "productName": "Xiaomi Redmi 12C",
        "productSku": "MOB-XMI-12C",
        "imageUrl": "https://res.cloudinary.com/...",
        "unitPrice": "14999.00",
        "quantity": 2,
        "total": "29998.00"
      }
    ],
    "payment": {
      "id": "uuid",
      "method": "SSLCOMMERZ",
      "status": "COMPLETED",
      "amount": "30557.00",
      "currency": "BDT",
      "sslTransactionId": "SSL_TXN_123456",
      "paidAt": "2024-01-15T11:05:00.000Z"
    },
    "statusHistory": [
      {
        "status": "PENDING",
        "note": "Order placed",
        "createdAt": "2024-01-15T11:00:00.000Z"
      },
      {
        "status": "CONFIRMED",
        "note": "Payment received via SSL Commerz",
        "createdAt": "2024-01-15T11:05:00.000Z"
      },
      {
        "status": "PROCESSING",
        "note": "Preparing your order",
        "createdAt": "2024-01-15T14:00:00.000Z"
      },
      {
        "status": "SHIPPED",
        "note": "Shipped via Pathao Courier, tracking: PTH123456",
        "createdAt": "2024-01-16T09:00:00.000Z"
      }
    ],
    "createdAt": "2024-01-15T11:00:00.000Z",
    "updatedAt": "2024-01-16T09:00:00.000Z"
  }
}
```

**Error Responses**

| Status | Message |
|---|---|
| `404` | Order not found |

---

### POST `/orders/:id/cancel` `AUTH`

Cancel an order. Only orders in `PENDING` status can be cancelled by the customer.

**Request Body** — none

**Response `200`**

```json
{
  "success": true,
  "message": "Order cancelled",
  "data": null
}
```

**Error Responses**

| Status | Message |
|---|---|
| `400` | Only pending orders can be cancelled |
| `404` | Order not found |

---

### GET `/orders/admin/all` `ADMIN`

Get all orders with customer details. Supports search and filtering.

**Query Parameters**

| Param | Type | Description |
|---|---|---|
| `page` | number | Page number |
| `limit` | number | Items per page |
| `status` | string | Filter by order status |
| `search` | string | Search by order number, customer name, or email |

**Response `200`** — paginated list

```json
{
  "success": true,
  "message": "Success",
  "data": [
    {
      "id": "uuid",
      "orderNumber": "BD-20240115-54321",
      "status": "PENDING",
      "total": "30557.00",
      "user": {
        "id": "uuid",
        "name": "Rahim Uddin",
        "email": "rahim@example.com",
        "phone": "01712345678"
      },
      "items": [ ],
      "payment": {
        "status": "PENDING",
        "method": "SSLCOMMERZ"
      },
      "createdAt": "2024-01-15T11:00:00.000Z"
    }
  ],
  "meta": {
    "total": 250,
    "page": 1,
    "limit": 20,
    "totalPages": 13
  }
}
```

---

### PATCH `/orders/admin/:id/status` `ADMIN`

Update an order's status. Enforces valid status transitions.

**Request Body**

```json
{
  "status": "SHIPPED",
  "note": "Shipped via Pathao Courier, tracking: PTH123456"
}
```

| `status` value | Allowed from |
|---|---|
| `CONFIRMED` | `PENDING` |
| `PROCESSING` | `CONFIRMED` |
| `SHIPPED` | `PROCESSING` |
| `DELIVERED` | `SHIPPED` |
| `CANCELLED` | `PENDING` `CONFIRMED` `PROCESSING` |
| `REFUNDED` | `DELIVERED` |

**Response `200`**

```json
{
  "success": true,
  "message": "Order status updated",
  "data": {
    "id": "uuid",
    "orderNumber": "BD-20240115-54321",
    "status": "SHIPPED",
    "updatedAt": "2024-01-16T09:00:00.000Z"
  }
}
```

**Error Responses**

| Status | Message |
|---|---|
| `400` | Cannot transition from `SHIPPED` to `CONFIRMED` |
| `404` | Order not found |

---

## Payment Endpoints

### POST `/payments/sslcommerz/init` `AUTH`

Initiate an SSL Commerz payment session. Returns the gateway URL to redirect the customer.

**Rate Limit:** 20 requests per 5 minutes

**Request Body**

```json
{
  "orderId": "3f2504e0-4f89-11d3-9a0c-0305e82c3301"
}
```

**Response `200`**

```json
{
  "success": true,
  "message": "Payment session created",
  "data": {
    "gatewayUrl": "https://sandbox.sslcommerz.com/EasyCheckOut/testcdef1234abcd...",
    "sessionKey": "SSLK1234567890ABCDEF"
  }
}
```

**Next Step:** Redirect customer browser to `gatewayUrl`. SSL Commerz will show bKash, Nagad, card options under one page.

**Error Responses**

| Status | Message |
|---|---|
| `400` | Payment already completed |
| `404` | Order not found |

---

### POST `/payments/sslcommerz/success` `PUBLIC (Gateway callback)`

> Called by the SSL Commerz gateway after successful payment. Do not call this from your frontend.

Server re-validates payment with SSL Commerz API, marks order as `CONFIRMED`, then redirects customer to:
```
FRONTEND_URL/payment/success?orderId=<uuid>
```

---

### POST `/payments/sslcommerz/fail` `PUBLIC (Gateway callback)`

> Called by the SSL Commerz gateway on payment failure.

Marks payment as `FAILED`, redirects to:
```
FRONTEND_URL/payment/fail?orderId=<uuid>
```

---

### POST `/payments/sslcommerz/cancel` `PUBLIC (Gateway callback)`

> Called by the SSL Commerz gateway when customer cancels.

Marks payment as `CANCELLED`, redirects to:
```
FRONTEND_URL/payment/cancel?orderId=<uuid>
```

---

### POST `/payments/sslcommerz/ipn` `PUBLIC (Gateway callback)`

> Server-to-server Instant Payment Notification from SSL Commerz. Always responds `200` to prevent IPN retries.

Configure this URL in your SSL Commerz merchant panel. Provides a backup confirmation independent of browser redirects.

---

### POST `/payments/bkash/create` `AUTH`

Create a bKash payment. Returns the bKash checkout URL to redirect the customer.

**Rate Limit:** 20 requests per 5 minutes

**Request Body**

```json
{
  "orderId": "3f2504e0-4f89-11d3-9a0c-0305e82c3301"
}
```

**Response `200`**

```json
{
  "success": true,
  "message": "bKash payment created",
  "data": {
    "bkashURL": "https://sandbox.payment.bkash.com/?paymentId=TR0011234567890&hash=...",
    "paymentID": "TR0011234567890"
  }
}
```

**Next Step:** Redirect customer browser to `bkashURL`. Customer completes payment in bKash app or via USSD.

**Error Responses**

| Status | Message |
|---|---|
| `400` | Payment already completed |
| `404` | Order not found |

---

### GET `/payments/bkash/callback` `PUBLIC (Gateway callback)`

> Called by bKash after customer action on the bKash payment page.

**Query Parameters**

| Param | Description |
|---|---|
| `paymentID` | bKash payment ID |
| `status` | `success`, `cancel`, or `failure` |

On `success`: executes payment via bKash API, marks order `CONFIRMED`, redirects to:
```
FRONTEND_URL/payment/success?orderId=<uuid>
```

On `cancel` / `failure`: marks payment accordingly, redirects to:
```
FRONTEND_URL/payment/cancel?paymentID=<id>
FRONTEND_URL/payment/fail?paymentID=<id>
```

---

### GET `/payments/:orderId/status` `AUTH`

Get the payment record for an order.

**Response `200`**

```json
{
  "success": true,
  "message": "Success",
  "data": {
    "id": "uuid",
    "orderId": "3f2504e0-4f89-11d3-9a0c-0305e82c3301",
    "method": "SSLCOMMERZ",
    "status": "COMPLETED",
    "amount": "30557.00",
    "currency": "BDT",
    "sslTransactionId": "SSL_TXN_123456",
    "sslValId": "VAL123456",
    "sslCardType": "MASTERCARD",
    "bkashPaymentId": null,
    "bkashTrxId": null,
    "paidAt": "2024-01-15T11:05:00.000Z",
    "createdAt": "2024-01-15T11:00:00.000Z",
    "updatedAt": "2024-01-15T11:05:00.000Z"
  }
}
```

**Error Responses**

| Status | Message |
|---|---|
| `404` | Payment record not found |

---

## Admin Endpoints

All admin routes require `Authorization: Bearer <admin_token>` where the token belongs to a user with `role: ADMIN`.

### GET `/admin/dashboard` `ADMIN`

Get overall store statistics and recent activity.

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
        "CANCELLED": 24,
        "REFUNDED": 0
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
      {
        "id": "uuid",
        "name": "boAt Bassheads 100",
        "stock": 3,
        "lowStockAlert": 5
      }
    ],
    "recentOrders": [
      {
        "id": "uuid",
        "orderNumber": "BD-20240115-54321",
        "status": "PENDING",
        "total": "30557.00",
        "user": { "name": "Rahim Uddin", "email": "rahim@example.com" },
        "payment": { "status": "COMPLETED", "method": "SSLCOMMERZ" },
        "createdAt": "2024-01-15T11:00:00.000Z"
      }
    ]
  }
}
```

---

### GET `/admin/users` `ADMIN`

List all users with order counts.

**Query Parameters**

| Param | Type | Description |
|---|---|---|
| `page` | number | Page number |
| `limit` | number | Items per page |
| `role` | string | `CUSTOMER` or `ADMIN` |
| `search` | string | Search by name, email, or phone |
| `active` | boolean | `true` or `false` |

**Response `200`**

```json
{
  "success": true,
  "message": "Success",
  "data": [
    {
      "id": "uuid",
      "name": "Rahim Uddin",
      "email": "rahim@example.com",
      "phone": "01712345678",
      "role": "CUSTOMER",
      "isActive": true,
      "isEmailVerified": false,
      "createdAt": "2024-01-10T08:00:00.000Z",
      "_count": {
        "orders": 5
      }
    }
  ],
  "meta": {
    "total": 3400,
    "page": 1,
    "limit": 20,
    "totalPages": 170
  }
}
```

---

### PATCH `/admin/users/:id/status` `ADMIN`

Toggle a user's active status. Deactivated users cannot log in.

**Request Body** — none

**Response `200`**

```json
{
  "success": true,
  "message": "User deactivated",
  "data": {
    "id": "uuid",
    "name": "Rahim Uddin",
    "email": "rahim@example.com",
    "isActive": false
  }
}
```

---

### GET `/admin/sales-report` `ADMIN`

Get revenue report with top products and payment method breakdown.

**Query Parameters**

| Param | Type | Default | Description |
|---|---|---|---|
| `from` | date string | 30 days ago | Report start date (`YYYY-MM-DD`) |
| `to` | date string | today | Report end date (`YYYY-MM-DD`) |

**Example**

```
GET /admin/sales-report?from=2024-01-01&to=2024-01-31
```

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
        "_sum": {
          "quantity": 12,
          "total": "419988.00"
        }
      },
      {
        "productId": "uuid",
        "productName": "Xiaomi Redmi 12C",
        "_sum": {
          "quantity": 30,
          "total": "449970.00"
        }
      }
    ],
    "paymentMethods": [
      {
        "method": "SSLCOMMERZ",
        "_count": { "_all": 55 },
        "_sum": { "amount": "198000.00" }
      },
      {
        "method": "BKASH",
        "_count": { "_all": 28 },
        "_sum": { "amount": "96000.00" }
      },
      {
        "method": "COD",
        "_count": { "_all": 4 },
        "_sum": { "amount": "26000.00" }
      }
    ],
    "transactions": [
      {
        "id": "uuid",
        "amount": "30557.00",
        "method": "SSLCOMMERZ",
        "paidAt": "2024-01-15T11:05:00.000Z",
        "order": {
          "orderNumber": "BD-20240115-54321",
          "user": { "name": "Rahim Uddin", "email": "rahim@example.com" },
          "items": [ ]
        }
      }
    ]
  }
}
```

---

## Error Codes

| HTTP Status | Meaning | When |
|---|---|---|
| `200` | OK | Successful GET / PATCH / POST (non-create) |
| `201` | Created | Successful resource creation |
| `400` | Bad Request | Business logic error (empty cart, invalid status transition) |
| `401` | Unauthorized | Missing / expired / invalid token |
| `403` | Forbidden | Valid token but insufficient role |
| `404` | Not Found | Resource doesn't exist or doesn't belong to user |
| `409` | Conflict | Duplicate unique field (email, phone, SKU) |
| `422` | Unprocessable Entity | Input validation failed |
| `429` | Too Many Requests | Rate limit exceeded |
| `500` | Internal Server Error | Unexpected server-side error |
