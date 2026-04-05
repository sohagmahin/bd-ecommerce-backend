const nodemailer = require('nodemailer');
const logger = require('../utils/logger');

// ─── Transporter ──────────────────────────────────────────────────────────────
// Using nodemailer with SendGrid SMTP. Alternatively swap to @sendgrid/mail SDK.
function createTransporter() {
  return nodemailer.createTransport({
    host: 'smtp.sendgrid.net',
    port: 587,
    secure: false,
    auth: {
      user: 'apikey',                         // always 'apikey' for SendGrid
      pass: process.env.SENDGRID_API_KEY,     // ← plug in your SendGrid API key
    },
  });
}

async function sendMail({ to, subject, html, text }) {
  try {
    const transporter = createTransporter();
    const info = await transporter.sendMail({
      from: `"${process.env.EMAIL_FROM_NAME}" <${process.env.EMAIL_FROM}>`,
      to,
      subject,
      html,
      text,
    });
    logger.info('Email sent', { messageId: info.messageId, to, subject });
    return info;
  } catch (err) {
    logger.error('Email send failed', { error: err.message, to, subject });
    throw err;
  }
}

// ─── Email Templates ──────────────────────────────────────────────────────────

async function sendOrderConfirmation(user, order) {
  const itemRows = order.items
    .map(
      (i) =>
        `<tr>
          <td>${i.productName}</td>
          <td>${i.quantity}</td>
          <td>৳${i.unitPrice}</td>
          <td>৳${i.total}</td>
        </tr>`
    )
    .join('');

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto;">
      <h2 style="color: #2563eb;">Order Confirmed! 🎉</h2>
      <p>Hi ${user.name},</p>
      <p>Your order <strong>#${order.orderNumber}</strong> has been confirmed.</p>
      <table border="1" cellpadding="8" cellspacing="0" width="100%">
        <thead style="background:#f3f4f6;">
          <tr><th>Product</th><th>Qty</th><th>Unit Price</th><th>Total</th></tr>
        </thead>
        <tbody>${itemRows}</tbody>
      </table>
      <p style="margin-top:16px;"><strong>Subtotal:</strong> ৳${order.subtotal}</p>
      <p><strong>Shipping:</strong> ৳${order.shippingFee}</p>
      <p><strong>Total:</strong> ৳${order.total}</p>
      <hr/>
      <p>We'll notify you when your order ships.</p>
      <p>— ${process.env.EMAIL_FROM_NAME} Team</p>
    </div>`;

  return sendMail({
    to: user.email,
    subject: `Order Confirmed: #${order.orderNumber}`,
    html,
    text: `Your order #${order.orderNumber} has been confirmed. Total: ৳${order.total}`,
  });
}

async function sendOrderStatusUpdate(user, order, newStatus) {
  const statusMessages = {
    CONFIRMED: 'Your order has been confirmed.',
    PROCESSING: 'Your order is being processed.',
    SHIPPED: 'Your order is on its way!',
    DELIVERED: 'Your order has been delivered. Enjoy!',
    CANCELLED: 'Your order has been cancelled.',
    REFUNDED: 'Your refund has been initiated.',
  };

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto;">
      <h2 style="color: #2563eb;">Order Update</h2>
      <p>Hi ${user.name},</p>
      <p>Order <strong>#${order.orderNumber}</strong> status: <strong>${newStatus}</strong></p>
      <p>${statusMessages[newStatus] || ''}</p>
      <p>— ${process.env.EMAIL_FROM_NAME} Team</p>
    </div>`;

  return sendMail({
    to: user.email,
    subject: `Order Update: #${order.orderNumber} — ${newStatus}`,
    html,
    text: `Order #${order.orderNumber} is now ${newStatus}. ${statusMessages[newStatus] || ''}`,
  });
}

async function sendWelcomeEmail(user) {
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto;">
      <h2 style="color: #2563eb;">Welcome to ${process.env.EMAIL_FROM_NAME}!</h2>
      <p>Hi ${user.name}, thanks for joining us.</p>
      <p>Start shopping and enjoy exclusive deals.</p>
      <p>— ${process.env.EMAIL_FROM_NAME} Team</p>
    </div>`;

  return sendMail({
    to: user.email,
    subject: `Welcome to ${process.env.EMAIL_FROM_NAME}!`,
    html,
    text: `Welcome to ${process.env.EMAIL_FROM_NAME}, ${user.name}!`,
  });
}

module.exports = { sendMail, sendOrderConfirmation, sendOrderStatusUpdate, sendWelcomeEmail };
