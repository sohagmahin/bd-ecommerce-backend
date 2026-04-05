const router = require('express').Router();
const { body } = require('express-validator');
const ctrl = require('../controllers/orderController');
const { authenticate, requireAdmin } = require('../middleware/auth');
const validate = require('../middleware/validate');

// ─── Customer routes ──────────────────────────────────────────────────────────
router.use(authenticate);

router.post(
  '/',
  [
    body('addressId').isUUID().withMessage('Valid address ID required'),
    body('paymentMethod')
      .optional()
      .isIn(['SSLCOMMERZ', 'BKASH', 'NAGAD', 'CARD', 'COD'])
      .withMessage('Invalid payment method'),
  ],
  validate,
  ctrl.placeOrder
);

router.get('/', ctrl.getMyOrders);
router.get('/addresses', ctrl.getAddresses);

router.post(
  '/addresses',
  [
    body('fullName').trim().notEmpty().withMessage('Full name required'),
    body('phone').isMobilePhone('bn-BD').withMessage('Valid phone number required'),
    body('line1').trim().notEmpty().withMessage('Address line 1 required'),
    body('city').trim().notEmpty().withMessage('City required'),
    body('district').trim().notEmpty().withMessage('District required'),
    body('division').trim().notEmpty().withMessage('Division required'),
  ],
  validate,
  ctrl.addAddress
);

router.get('/:id', ctrl.getOrder);
router.post('/:id/cancel', ctrl.cancelOrder);

// ─── Admin routes ─────────────────────────────────────────────────────────────
router.get('/admin/all', requireAdmin, ctrl.adminGetOrders);

router.patch(
  '/admin/:id/status',
  requireAdmin,
  [
    body('status')
      .isIn(['CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'REFUNDED'])
      .withMessage('Invalid status'),
  ],
  validate,
  ctrl.adminUpdateStatus
);

module.exports = router;
