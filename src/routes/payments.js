const router = require('express').Router();
const { body } = require('express-validator');
const ctrl = require('../controllers/paymentController');
const { authenticate } = require('../middleware/auth');
const { paymentLimiter } = require('../middleware/rateLimiter');
const validate = require('../middleware/validate');

// ─── SSL Commerz ──────────────────────────────────────────────────────────────

router.post(
  '/sslcommerz/init',
  authenticate,
  paymentLimiter,
  [body('orderId').isUUID().withMessage('Valid order ID required')],
  validate,
  ctrl.sslInit
);

// These are POST redirects from the SSL Commerz gateway — NOT authenticated via JWT
// SSL Commerz posts form data to these URLs
router.post('/sslcommerz/success', ctrl.sslSuccess);
router.post('/sslcommerz/fail', ctrl.sslFail);
router.post('/sslcommerz/cancel', ctrl.sslCancel);
router.post('/sslcommerz/ipn', ctrl.sslIpn);    // server-to-server IPN

// ─── bKash ────────────────────────────────────────────────────────────────────

router.post(
  '/bkash/create',
  authenticate,
  paymentLimiter,
  [body('orderId').isUUID().withMessage('Valid order ID required')],
  validate,
  ctrl.bkashCreate
);

// bKash redirects customer browser here after payment
router.get('/bkash/callback', ctrl.bkashCallback);

// ─── Payment status ───────────────────────────────────────────────────────────

router.get('/:orderId/status', authenticate, ctrl.getPaymentStatus);

module.exports = router;
