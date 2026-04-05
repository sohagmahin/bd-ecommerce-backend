const { getRedisClient } = require('../config/redis');
const logger = require('../utils/logger');

const CART_TTL = 60 * 60 * 24 * 7; // 7 days in seconds

function cartKey(userId) {
  return `cart:${userId}`;
}

/**
 * Get cart for a user. Returns an array of { productId, quantity, price, name, imageUrl }
 */
async function getCart(userId) {
  const redis = getRedisClient();
  const raw = await redis.get(cartKey(userId));
  return raw ? JSON.parse(raw) : [];
}

/**
 * Save full cart array back to Redis
 */
async function saveCart(userId, items) {
  const redis = getRedisClient();
  await redis.setex(cartKey(userId), CART_TTL, JSON.stringify(items));
}

/**
 * Add or update an item in the cart
 */
async function addToCart(userId, item) {
  const items = await getCart(userId);
  const idx = items.findIndex((i) => i.productId === item.productId);
  if (idx >= 0) {
    items[idx].quantity += item.quantity;
  } else {
    items.push(item);
  }
  await saveCart(userId, items);
  return items;
}

/**
 * Update quantity of a cart item. Removes item if quantity <= 0.
 */
async function updateCartItem(userId, productId, quantity) {
  let items = await getCart(userId);
  if (quantity <= 0) {
    items = items.filter((i) => i.productId !== productId);
  } else {
    const idx = items.findIndex((i) => i.productId === productId);
    if (idx >= 0) items[idx].quantity = quantity;
  }
  await saveCart(userId, items);
  return items;
}

/**
 * Remove an item from the cart
 */
async function removeFromCart(userId, productId) {
  const items = (await getCart(userId)).filter((i) => i.productId !== productId);
  await saveCart(userId, items);
  return items;
}

/**
 * Clear the entire cart (e.g. after successful order)
 */
async function clearCart(userId) {
  const redis = getRedisClient();
  await redis.del(cartKey(userId));
}

/**
 * Generic cache get/set helpers for product listings, etc.
 */
async function cacheGet(key) {
  try {
    const redis = getRedisClient();
    const val = await redis.get(key);
    return val ? JSON.parse(val) : null;
  } catch (err) {
    logger.warn('Cache GET failed', { key, error: err.message });
    return null;
  }
}

async function cacheSet(key, value, ttlSeconds = 300) {
  try {
    const redis = getRedisClient();
    await redis.setex(key, ttlSeconds, JSON.stringify(value));
  } catch (err) {
    logger.warn('Cache SET failed', { key, error: err.message });
  }
}

async function cacheDel(key) {
  try {
    const redis = getRedisClient();
    await redis.del(key);
  } catch (err) {
    logger.warn('Cache DEL failed', { key, error: err.message });
  }
}

module.exports = {
  getCart,
  saveCart,
  addToCart,
  updateCartItem,
  removeFromCart,
  clearCart,
  cacheGet,
  cacheSet,
  cacheDel,
};
