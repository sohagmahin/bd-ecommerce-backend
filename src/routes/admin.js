const router = require('express').Router();
const { param } = require('express-validator');
const ctrl = require('../controllers/adminController');
const { authenticate, requireAdmin } = require('../middleware/auth');
const validate = require('../middleware/validate');

router.use(authenticate, requireAdmin);

router.get('/dashboard', ctrl.getDashboard);
router.get('/users', ctrl.getUsers);
router.patch(
  '/users/:id/status',
  [param('id').isUUID()],
  validate,
  ctrl.toggleUserStatus
);
router.get('/sales-report', ctrl.getSalesReport);

module.exports = router;
