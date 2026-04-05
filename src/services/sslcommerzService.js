const SSLCommerzPayment = require('sslcommerz-lts');
const logger = require('../utils/logger');

// ─── SSL Commerz credentials ──────────────────────────────────────────────────
// Obtain from: https://developer.sslcommerz.com/
// Sandbox registration: https://developer.sslcommerz.com/registration/
const STORE_ID = process.env.SSLCOMMERZ_STORE_ID;       // ← your store ID
const STORE_PASSWORD = process.env.SSLCOMMERZ_STORE_PASSWORD; // ← your store password
const IS_LIVE = process.env.SSLCOMMERZ_IS_LIVE === 'true';

/**
 * Initiate a payment session and return the gateway URL.
 * @param {Object} order  - Prisma Order with items & user
 * @param {Object} user   - Prisma User
 * @returns {string}      - GatewayPageURL to redirect the customer
 */
async function initiatePayment(order, user) {
  const appUrl = process.env.APP_URL;

  const data = {
    total_amount: parseFloat(order.total),
    currency: 'BDT',
    tran_id: order.id,                       // use order UUID as transaction ID
    success_url: `${appUrl}/api/payments/sslcommerz/success`,
    fail_url: `${appUrl}/api/payments/sslcommerz/fail`,
    cancel_url: `${appUrl}/api/payments/sslcommerz/cancel`,
    ipn_url: `${appUrl}/api/payments/sslcommerz/ipn`, // server-to-server IPN

    // Customer info
    cus_name: user.name,
    cus_email: user.email,
    cus_phone: user.phone || '01700000000',
    cus_add1: order.shippingLine1,
    cus_add2: order.shippingLine2 || '',
    cus_city: order.shippingCity,
    cus_state: order.shippingDivision,
    cus_postcode: order.shippingPostal || '1000',
    cus_country: 'Bangladesh',

    // Shipping info
    ship_name: order.shippingName,
    ship_add1: order.shippingLine1,
    ship_city: order.shippingCity,
    ship_postcode: order.shippingPostal || '1000',
    ship_country: 'Bangladesh',

    // Product info (summary)
    product_name: `Order #${order.orderNumber}`,
    product_category: 'E-commerce',
    product_profile: 'general',
    product_amount: parseFloat(order.subtotal),
    shipping_method: 'Courier',
    num_of_item: order.items?.length || 1,
    product_profile: 'physical-goods',
  };

  const sslcz = new SSLCommerzPayment(STORE_ID, STORE_PASSWORD, IS_LIVE);
  const response = await sslcz.init(data);

  if (!response?.GatewayPageURL) {
    logger.error('SSLCommerz init failed', { response, orderId: order.id });
    throw new Error('Failed to initiate SSL Commerz payment');
  }

  logger.info('SSLCommerz session created', {
    orderId: order.id,
    sessionKey: response.sessionkey,
  });

  return { gatewayUrl: response.GatewayPageURL, sessionKey: response.sessionkey };
}

/**
 * Validate an IPN / success callback by re-querying SSL Commerz.
 * Always validate before marking payment as complete.
 */
async function validatePayment(valId) {
  const sslcz = new SSLCommerzPayment(STORE_ID, STORE_PASSWORD, IS_LIVE);
  const response = await sslcz.validate({ val_id: valId });
  return response;
}

module.exports = { initiatePayment, validatePayment };
