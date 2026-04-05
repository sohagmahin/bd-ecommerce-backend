const prisma = require('../config/database');
const { success, error } = require('../utils/response');
const sslCommerzService = require('../services/sslcommerzService');
const bkashService = require('../services/bkashService');
const logger = require('../utils/logger');

// ─────────────────────────────────────────────────────────────────────────────
//  SSL COMMERZ
// ─────────────────────────────────────────────────────────────────────────────

// POST /api/payments/sslcommerz/init
const sslInit = async (req, res, next) => {
  try {
    const { orderId } = req.body;

    const order = await prisma.order.findFirst({
      where: { id: orderId, userId: req.user.id },
      include: { items: true, payment: true },
    });
    if (!order) return error(res, 'Order not found', 404);
    if (order.payment?.status === 'COMPLETED') return error(res, 'Payment already completed', 400);

    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    const { gatewayUrl, sessionKey } = await sslCommerzService.initiatePayment(order, user);

    return success(res, { gatewayUrl, sessionKey }, 'Payment session created');
  } catch (err) {
    next(err);
  }
};

// POST /api/payments/sslcommerz/success  (redirect from SSL Commerz gateway)
const sslSuccess = async (req, res, next) => {
  try {
    const { tran_id, val_id, amount, card_type, store_amount, status } = req.body;

    if (status !== 'VALID' && status !== 'VALIDATED') {
      logger.warn('SSLCommerz success called with non-VALID status', { tran_id, status });
      return res.redirect(`${process.env.FRONTEND_URL}/payment/fail?orderId=${tran_id}`);
    }

    // Always re-validate with SSL Commerz — never trust the callback alone
    const validation = await sslCommerzService.validatePayment(val_id);

    if (
      validation.status !== 'VALID' &&
      validation.status !== 'VALIDATED'
    ) {
      logger.error('SSLCommerz validation failed', { tran_id, validation });
      return res.redirect(`${process.env.FRONTEND_URL}/payment/fail?orderId=${tran_id}`);
    }

    // Update payment record
    await prisma.payment.update({
      where: { orderId: tran_id },
      data: {
        status: 'COMPLETED',
        sslTransactionId: tran_id,
        sslValId: val_id,
        sslStoreAmount: parseFloat(store_amount),
        sslCardType: card_type,
        gatewayResponse: validation,
        paidAt: new Date(),
      },
    });

    // Confirm the order
    await prisma.order.update({ where: { id: tran_id }, data: { status: 'CONFIRMED' } });
    await prisma.orderStatusHistory.create({
      data: { orderId: tran_id, status: 'CONFIRMED', note: 'Payment received via SSL Commerz' },
    });

    logger.info('SSLCommerz payment confirmed', { orderId: tran_id, valId: val_id });
    return res.redirect(`${process.env.FRONTEND_URL}/payment/success?orderId=${tran_id}`);
  } catch (err) {
    logger.error('SSLCommerz success handler error', { error: err.message });
    next(err);
  }
};

// POST /api/payments/sslcommerz/fail
const sslFail = async (req, res) => {
  const { tran_id } = req.body;
  await prisma.payment.update({
    where: { orderId: tran_id },
    data: { status: 'FAILED', gatewayResponse: req.body },
  }).catch(() => {});
  return res.redirect(`${process.env.FRONTEND_URL}/payment/fail?orderId=${tran_id}`);
};

// POST /api/payments/sslcommerz/cancel
const sslCancel = async (req, res) => {
  const { tran_id } = req.body;
  await prisma.payment.update({
    where: { orderId: tran_id },
    data: { status: 'CANCELLED', gatewayResponse: req.body },
  }).catch(() => {});
  return res.redirect(`${process.env.FRONTEND_URL}/payment/cancel?orderId=${tran_id}`);
};

// POST /api/payments/sslcommerz/ipn
// IPN = Instant Payment Notification (server-to-server from SSL Commerz)
const sslIpn = async (req, res) => {
  try {
    const { tran_id, val_id, status } = req.body;
    logger.info('SSLCommerz IPN received', { tran_id, status });

    if (status !== 'VALID') {
      return res.status(200).json({ message: 'IPN received' });
    }

    // Validate again
    const validation = await sslCommerzService.validatePayment(val_id);
    if (validation.status !== 'VALID' && validation.status !== 'VALIDATED') {
      logger.error('SSLCommerz IPN validation failed', { tran_id });
      return res.status(200).json({ message: 'Validation failed' });
    }

    // Idempotent update
    await prisma.payment.updateMany({
      where: { orderId: tran_id, status: { not: 'COMPLETED' } },
      data: {
        status: 'COMPLETED',
        sslTransactionId: tran_id,
        sslValId: val_id,
        gatewayResponse: validation,
        paidAt: new Date(),
      },
    });

    return res.status(200).json({ message: 'IPN processed' });
  } catch (err) {
    logger.error('SSLCommerz IPN error', { error: err.message });
    return res.status(200).json({ message: 'Error processed' }); // always 200 to prevent retries
  }
};

// ─────────────────────────────────────────────────────────────────────────────
//  bKash PGW
// ─────────────────────────────────────────────────────────────────────────────

// POST /api/payments/bkash/create
const bkashCreate = async (req, res, next) => {
  try {
    const { orderId } = req.body;

    const order = await prisma.order.findFirst({
      where: { id: orderId, userId: req.user.id },
      include: { payment: true },
    });
    if (!order) return error(res, 'Order not found', 404);
    if (order.payment?.status === 'COMPLETED') return error(res, 'Payment already completed', 400);

    const result = await bkashService.createPayment({
      orderId,
      amount: parseFloat(order.total),
    });

    // Update payment record with bKash payment ID
    await prisma.payment.update({
      where: { orderId },
      data: { bkashPaymentId: result.paymentID, status: 'INITIATED' },
    });

    return success(res, {
      bkashURL: result.bkashURL,
      paymentID: result.paymentID,
    }, 'bKash payment created');
  } catch (err) {
    next(err);
  }
};

// GET /api/payments/bkash/callback  (bKash redirects here after customer action)
const bkashCallback = async (req, res, next) => {
  try {
    const { paymentID, status } = req.query;

    if (status === 'cancel' || status === 'failure') {
      const payment = await prisma.payment.findFirst({ where: { bkashPaymentId: paymentID } });
      if (payment) {
        await prisma.payment.update({
          where: { id: payment.id },
          data: { status: status === 'cancel' ? 'CANCELLED' : 'FAILED' },
        });
      }
      return res.redirect(
        `${process.env.FRONTEND_URL}/payment/${status === 'cancel' ? 'cancel' : 'fail'}?paymentID=${paymentID}`
      );
    }

    // Execute payment
    const executeResult = await bkashService.executePayment(paymentID);

    const payment = await prisma.payment.findFirst({ where: { bkashPaymentId: paymentID } });
    if (!payment) return res.redirect(`${process.env.FRONTEND_URL}/payment/fail`);

    await prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: 'COMPLETED',
        bkashTrxId: executeResult.trxID,
        bkashCustomerMsisdn: executeResult.customerMsisdn,
        gatewayResponse: executeResult,
        paidAt: new Date(),
      },
    });

    await prisma.order.update({ where: { id: payment.orderId }, data: { status: 'CONFIRMED' } });
    await prisma.orderStatusHistory.create({
      data: { orderId: payment.orderId, status: 'CONFIRMED', note: 'Payment received via bKash' },
    });

    logger.info('bKash payment confirmed', { paymentID, trxID: executeResult.trxID });
    return res.redirect(
      `${process.env.FRONTEND_URL}/payment/success?orderId=${payment.orderId}`
    );
  } catch (err) {
    logger.error('bKash callback error', { error: err.message });
    next(err);
  }
};

// GET /api/payments/:orderId/status
const getPaymentStatus = async (req, res, next) => {
  try {
    const payment = await prisma.payment.findUnique({
      where: { orderId: req.params.orderId },
    });
    if (!payment) return error(res, 'Payment record not found', 404);
    return success(res, payment);
  } catch (err) {
    next(err);
  }
};

module.exports = {
  sslInit, sslSuccess, sslFail, sslCancel, sslIpn,
  bkashCreate, bkashCallback, getPaymentStatus,
};
