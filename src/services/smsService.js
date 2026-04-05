const logger = require('../utils/logger');

// ─── Provider: Twilio ─────────────────────────────────────────────────────────
async function sendViaTwilio(to, message) {
  const twilio = require('twilio');
  const client = twilio(
    process.env.TWILIO_ACCOUNT_SID,   // ← plug in from Twilio console
    process.env.TWILIO_AUTH_TOKEN
  );
  return client.messages.create({
    body: message,
    from: process.env.TWILIO_PHONE_NUMBER,
    to, // E.164 format, e.g. +8801712345678
  });
}

// ─── Provider: BulkSMSBD (local BD gateway) ───────────────────────────────────
// API docs: https://bulksmsbd.net/api
async function sendViaBulkSmsBd(to, message) {
  const axios = require('axios');
  // Strip leading + if present; BulkSMSBD expects number without +
  const number = to.replace(/^\+/, '');
  const response = await axios.get('https://bulksmsbd.net/api/smsapi', {
    params: {
      api_key: process.env.BULKSMSBD_API_KEY,    // ← plug in your BulkSMSBD API key
      type: 'text',
      number,
      senderid: process.env.BULKSMSBD_SENDER_ID, // ← your approved sender ID
      message,
    },
  });
  return response.data;
}

// ─── Unified send function ────────────────────────────────────────────────────
async function sendSms(to, message) {
  const provider = process.env.SMS_PROVIDER || 'twilio';
  try {
    if (provider === 'bulksmsbd') {
      await sendViaBulkSmsBd(to, message);
    } else {
      await sendViaTwilio(to, message);
    }
    logger.info('SMS sent', { to, provider });
  } catch (err) {
    logger.error('SMS send failed', { error: err.message, to, provider });
    // SMS failures are non-critical — log and continue
  }
}

// ─── Message helpers ──────────────────────────────────────────────────────────

async function sendOrderConfirmationSms(phone, orderNumber, total) {
  const msg = `Your order #${orderNumber} is confirmed. Total: ৳${total}. Thank you for shopping with us!`;
  return sendSms(phone, msg);
}

async function sendOrderStatusSms(phone, orderNumber, status) {
  const messages = {
    SHIPPED: `Good news! Your order #${orderNumber} has been shipped and is on its way.`,
    DELIVERED: `Your order #${orderNumber} has been delivered. Enjoy your purchase!`,
    CANCELLED: `Your order #${orderNumber} has been cancelled.`,
  };
  const msg = messages[status] || `Your order #${orderNumber} status updated to: ${status}`;
  return sendSms(phone, msg);
}

module.exports = { sendSms, sendOrderConfirmationSms, sendOrderStatusSms };
