const jwt = require('jsonwebtoken');
const prisma = require('../config/database');
const { error } = require('../utils/response');

/**
 * Verify JWT and attach user to req.user
 */
const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return error(res, 'Authentication token required', 401);
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        isActive: true,
        isEmailVerified: true,
      },
    });

    if (!user) return error(res, 'User not found', 401);
    if (!user.isActive) return error(res, 'Account is deactivated', 403);

    req.user = user;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') return error(res, 'Token expired', 401);
    if (err.name === 'JsonWebTokenError') return error(res, 'Invalid token', 401);
    next(err);
  }
};

/**
 * Allow only admin role
 */
const requireAdmin = (req, res, next) => {
  if (req.user?.role !== 'ADMIN') {
    return error(res, 'Admin access required', 403);
  }
  next();
};

/**
 * Allow only customer role
 */
const requireCustomer = (req, res, next) => {
  if (req.user?.role !== 'CUSTOMER') {
    return error(res, 'Customer access required', 403);
  }
  next();
};

/**
 * Optional auth — attaches user if token present but does not block if absent
 */
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) return next();

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: { id: true, name: true, email: true, role: true, isActive: true },
    });

    if (user?.isActive) req.user = user;
  } catch (_) {
    // ignore — optional auth
  }
  next();
};

module.exports = { authenticate, requireAdmin, requireCustomer, optionalAuth };
