const axios = require('axios');
const logger = require('../utils/logger');

// ─── bKash PGW credentials ────────────────────────────────────────────────────
// Register at: https://developer.bka.sh/
// Sandbox docs: https://developer.bka.sh/docs/checkout-process-overview
const BASE_URL = process.env.BKASH_BASE_URL; // sandbox or production URL
const APP_KEY = process.env.BKASH_APP_KEY;   // ← your bKash app key
const APP_SECRET = process.env.BKASH_APP_SECRET; // ← your bKash app secret
const USERNAME = process.env.BKASH_USERNAME;
const PASSWORD = process.env.BKASH_PASSWORD;

let tokenCache = { token: null, expiresAt: 0 };

// ─── Token grant/refresh ──────────────────────────────────────────────────────
async function getToken() {
  if (tokenCache.token && Date.now() < tokenCache.expiresAt) {
    return tokenCache.token;
  }

  const response = await axios.post(
    `${BASE_URL}/tokenized/checkout/token/grant`,
    { app_key: APP_KEY, app_secret: APP_SECRET },
    {
      headers: {
        'Content-Type': 'application/json',
        username: USERNAME,
        password: PASSWORD,
      },
    }
  );

  const { id_token, token_type, expires_in } = response.data;
  tokenCache = {
    token: id_token,
    expiresAt: Date.now() + (expires_in - 60) * 1000, // refresh 60s early
  };

  logger.info('bKash token granted');
  return id_token;
}

async function refreshToken() {
  tokenCache = { token: null, expiresAt: 0 };
  return getToken();
}

// ─── Create payment ───────────────────────────────────────────────────────────
async function createPayment({ orderId, amount, currency = 'BDT', intent = 'sale' }) {
  const token = await getToken();
  const response = await axios.post(
    `${BASE_URL}/tokenized/checkout/create`,
    {
      mode: '0011',                // 0011 = checkout URL
      payerReference: orderId,
      callbackURL: process.env.BKASH_CALLBACK_URL,
      amount: String(amount),
      currency,
      intent,
      merchantInvoiceNumber: orderId,
    },
    {
      headers: {
        'Content-Type': 'application/json',
        Authorization: token,
        'X-APP-Key': APP_KEY,
      },
    }
  );

  if (response.data.statusCode !== '0000') {
    logger.error('bKash create payment failed', response.data);
    throw new Error(`bKash: ${response.data.statusMessage}`);
  }

  logger.info('bKash payment created', {
    paymentID: response.data.paymentID,
    orderId,
  });

  return response.data; // contains bkashURL (redirect URL)
}

// ─── Execute payment ──────────────────────────────────────────────────────────
async function executePayment(paymentId) {
  const token = await getToken();
  const response = await axios.post(
    `${BASE_URL}/tokenized/checkout/execute`,
    { paymentID: paymentId },
    {
      headers: {
        'Content-Type': 'application/json',
        Authorization: token,
        'X-APP-Key': APP_KEY,
      },
    }
  );

  if (response.data.statusCode !== '0000') {
    logger.error('bKash execute failed', response.data);
    throw new Error(`bKash execute: ${response.data.statusMessage}`);
  }

  logger.info('bKash payment executed', {
    paymentID: paymentId,
    trxID: response.data.trxID,
  });

  return response.data;
}

// ─── Query payment ────────────────────────────────────────────────────────────
async function queryPayment(paymentId) {
  const token = await getToken();
  const response = await axios.post(
    `${BASE_URL}/tokenized/checkout/payment/status`,
    { paymentID: paymentId },
    {
      headers: {
        'Content-Type': 'application/json',
        Authorization: token,
        'X-APP-Key': APP_KEY,
      },
    }
  );
  return response.data;
}

// ─── Refund ───────────────────────────────────────────────────────────────────
async function refundPayment({ paymentId, trxId, amount, sku, reason }) {
  const token = await getToken();
  const response = await axios.post(
    `${BASE_URL}/tokenized/checkout/payment/refund`,
    {
      paymentID: paymentId,
      trxID: trxId,
      amount: String(amount),
      sku,
      reason,
    },
    {
      headers: {
        'Content-Type': 'application/json',
        Authorization: token,
        'X-APP-Key': APP_KEY,
      },
    }
  );
  return response.data;
}

module.exports = { createPayment, executePayment, queryPayment, refundPayment, getToken };
