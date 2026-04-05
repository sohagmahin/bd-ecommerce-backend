const crypto = require('crypto');

/**
 * Generate a unique order number — BD-YYYYMMDD-XXXXX
 */
function generateOrderNumber() {
  const date = new Date();
  const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '');
  const random = Math.floor(10000 + Math.random() * 90000);
  return `BD-${dateStr}-${random}`;
}

/**
 * Convert a product name to a URL-safe slug
 */
function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Build pagination meta object
 */
function paginationMeta(total, page, limit) {
  return {
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
}

/**
 * Parse pagination query params with safe defaults
 */
function parsePagination(query) {
  const page = Math.max(1, parseInt(query.page || '1', 10));
  const limit = Math.min(100, Math.max(1, parseInt(query.limit || '20', 10)));
  const skip = (page - 1) * limit;
  return { page, limit, skip };
}

/**
 * Verify HMAC-SHA256 signature (for webhook payloads)
 */
function verifyHmacSignature(payload, secret, receivedSignature) {
  const computedSignature = crypto
    .createHmac('sha256', secret)
    .update(typeof payload === 'string' ? payload : JSON.stringify(payload))
    .digest('hex');
  return crypto.timingSafeEqual(
    Buffer.from(computedSignature),
    Buffer.from(receivedSignature)
  );
}

/**
 * Calculate order totals
 */
function calculateOrderTotals(items, shippingFee = 60, discount = 0) {
  const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const total = subtotal + shippingFee - discount;
  return {
    subtotal: parseFloat(subtotal.toFixed(2)),
    shippingFee: parseFloat(shippingFee.toFixed(2)),
    discount: parseFloat(discount.toFixed(2)),
    total: parseFloat(total.toFixed(2)),
  };
}

module.exports = {
  generateOrderNumber,
  slugify,
  paginationMeta,
  parsePagination,
  verifyHmacSignature,
  calculateOrderTotals,
};
