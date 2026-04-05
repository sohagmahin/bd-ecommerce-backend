const router = require('express').Router();
const { body } = require('express-validator');
const ctrl = require('../controllers/authController');
const { authenticate } = require('../middleware/auth');
const { authLimiter } = require('../middleware/rateLimiter');
const validate = require('../middleware/validate');

const passwordRules = body('password')
  .isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
  .matches(/[A-Z]/).withMessage('Password must contain at least one uppercase letter')
  .matches(/[0-9]/).withMessage('Password must contain at least one number');

// Public routes
router.post(
  '/register',
  authLimiter,
  [
    body('name').trim().notEmpty().withMessage('Name is required'),
    body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
    body('phone').optional().isMobilePhone('bn-BD').withMessage('Valid BD phone number required'),
    passwordRules,
  ],
  validate,
  ctrl.register
);

router.post(
  '/login',
  authLimiter,
  [
    body('email').isEmail().normalizeEmail(),
    body('password').notEmpty().withMessage('Password is required'),
  ],
  validate,
  ctrl.login
);

router.post(
  '/admin/login',
  authLimiter,
  [
    body('email').isEmail().normalizeEmail(),
    body('password').notEmpty(),
  ],
  validate,
  ctrl.adminLogin
);

router.post(
  '/refresh',
  [body('refreshToken').notEmpty().withMessage('Refresh token required')],
  validate,
  ctrl.refreshToken
);

// Protected routes
router.use(authenticate);

router.post('/logout', ctrl.logout);
router.get('/me', ctrl.getMe);

router.patch(
  '/me',
  [
    body('name').optional().trim().notEmpty(),
    body('phone').optional().isMobilePhone('bn-BD'),
  ],
  validate,
  ctrl.updateProfile
);

router.post(
  '/change-password',
  [
    body('currentPassword').notEmpty().withMessage('Current password required'),
    passwordRules.bail().optional().isLength({ min: 8 }),
    body('newPassword').isLength({ min: 8 }).withMessage('New password must be at least 8 characters'),
  ],
  validate,
  ctrl.changePassword
);

module.exports = router;
