const router = require('express').Router();
const { body, param } = require('express-validator');
const ctrl = require('../controllers/productController');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { uploadProduct } = require('../config/cloudinary');
const validate = require('../middleware/validate');

// ─── Public routes ────────────────────────────────────────────────────────────
router.get('/', ctrl.getProducts);
router.get('/categories', ctrl.getCategories);
router.get('/:slug', ctrl.getProduct);

// ─── Admin routes ─────────────────────────────────────────────────────────────
router.use(authenticate, requireAdmin);

router.post(
  '/',
  [
    body('name').trim().notEmpty().withMessage('Product name required'),
    body('sku').trim().notEmpty().withMessage('SKU required'),
    body('price').isFloat({ min: 0 }).withMessage('Valid price required'),
    body('stock').isInt({ min: 0 }).withMessage('Stock must be non-negative integer'),
    body('categoryId').notEmpty().withMessage('Category is required'),
  ],
  validate,
  ctrl.createProduct
);

router.patch(
  '/:id',
  [
    param('id').isUUID(),
    body('price').optional().isFloat({ min: 0 }),
    body('stock').optional().isInt({ min: 0 }),
  ],
  validate,
  ctrl.updateProduct
);

router.delete('/:id', ctrl.deleteProduct);

router.post(
  '/:id/images',
  uploadProduct.array('images', 10),
  ctrl.uploadImages
);

router.delete('/images/:imageId', ctrl.deleteImage);

router.patch(
  '/:id/stock',
  [body('stock').isInt({ min: 0 }).withMessage('Stock must be a non-negative integer')],
  validate,
  ctrl.updateStock
);

router.post(
  '/categories',
  [body('name').trim().notEmpty().withMessage('Category name required')],
  validate,
  ctrl.createCategory
);

module.exports = router;
