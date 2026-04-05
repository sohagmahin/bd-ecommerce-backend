const router = require('express').Router();
const { body, param } = require('express-validator');
const ctrl = require('../controllers/cartController');
const { authenticate } = require('../middleware/auth');
const validate = require('../middleware/validate');

router.use(authenticate);

router.get('/', ctrl.getCartItems);

router.post(
  '/items',
  [
    body('productId').isUUID().withMessage('Valid product ID required'),
    body('quantity').isInt({ min: 1 }).withMessage('Quantity must be at least 1'),
  ],
  validate,
  ctrl.addItem
);

router.patch(
  '/items/:productId',
  [
    param('productId').isUUID(),
    body('quantity').isInt({ min: 0 }).withMessage('Quantity must be 0 or more'),
  ],
  validate,
  ctrl.updateItem
);

router.delete('/items/:productId', ctrl.removeItem);
router.delete('/', ctrl.clearCartHandler);

module.exports = router;
