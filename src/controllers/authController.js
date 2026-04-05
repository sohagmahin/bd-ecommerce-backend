const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const prisma = require('../config/database');
const { success, created, error } = require('../utils/response');
const { sendWelcomeEmail } = require('../services/emailService');
const logger = require('../utils/logger');

function signAccessToken(userId, role) {
  return jwt.sign({ userId, role }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });
}

function signRefreshToken(userId) {
  return jwt.sign({ userId }, process.env.JWT_REFRESH_SECRET, {
    expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d',
  });
}

// POST /api/auth/register
const register = async (req, res, next) => {
  try {
    const { name, email, phone, password } = req.body;

    const existing = await prisma.user.findFirst({
      where: { OR: [{ email }, ...(phone ? [{ phone }] : [])] },
    });
    if (existing) return error(res, 'Email or phone already registered', 409);

    const hashedPassword = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({
      data: { name, email, phone: phone || null, password: hashedPassword, role: 'CUSTOMER' },
      select: { id: true, name: true, email: true, phone: true, role: true, createdAt: true },
    });

    // Fire and forget
    sendWelcomeEmail(user).catch((e) => logger.warn('Welcome email failed', { error: e.message }));

    const accessToken = signAccessToken(user.id, user.role);
    return created(res, { user, accessToken }, 'Registration successful');
  } catch (err) {
    next(err);
  }
};

// POST /api/auth/login
const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return error(res, 'Invalid email or password', 401);
    if (!user.isActive) return error(res, 'Account is deactivated', 403);

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return error(res, 'Invalid email or password', 401);

    const accessToken = signAccessToken(user.id, user.role);
    const refreshToken = signRefreshToken(user.id);

    // Persist refresh token hash
    await prisma.user.update({
      where: { id: user.id },
      data: { refreshToken: await bcrypt.hash(refreshToken, 8) },
    });

    const userData = {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role,
    };

    return success(res, { user: userData, accessToken, refreshToken }, 'Login successful');
  } catch (err) {
    next(err);
  }
};

// POST /api/auth/admin/login
const adminLogin = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || user.role !== 'ADMIN') return error(res, 'Invalid credentials', 401);
    if (!user.isActive) return error(res, 'Account is deactivated', 403);

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return error(res, 'Invalid credentials', 401);

    const accessToken = signAccessToken(user.id, user.role);
    const refreshToken = signRefreshToken(user.id);

    await prisma.user.update({
      where: { id: user.id },
      data: { refreshToken: await bcrypt.hash(refreshToken, 8) },
    });

    return success(
      res,
      { user: { id: user.id, name: user.name, email: user.email, role: user.role }, accessToken, refreshToken },
      'Admin login successful'
    );
  } catch (err) {
    next(err);
  }
};

// POST /api/auth/refresh
const refreshToken = async (req, res, next) => {
  try {
    const { refreshToken: token } = req.body;
    if (!token) return error(res, 'Refresh token required', 400);

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_REFRESH_SECRET);
    } catch {
      return error(res, 'Invalid or expired refresh token', 401);
    }

    const user = await prisma.user.findUnique({ where: { id: decoded.userId } });
    if (!user?.refreshToken) return error(res, 'Session revoked', 401);

    const isValid = await bcrypt.compare(token, user.refreshToken);
    if (!isValid) return error(res, 'Invalid refresh token', 401);

    const newAccessToken = signAccessToken(user.id, user.role);
    return success(res, { accessToken: newAccessToken }, 'Token refreshed');
  } catch (err) {
    next(err);
  }
};

// POST /api/auth/logout
const logout = async (req, res, next) => {
  try {
    await prisma.user.update({
      where: { id: req.user.id },
      data: { refreshToken: null },
    });
    return success(res, null, 'Logged out successfully');
  } catch (err) {
    next(err);
  }
};

// GET /api/auth/me
const getMe = async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true, name: true, email: true, phone: true, role: true,
        avatar: true, isEmailVerified: true, createdAt: true,
        address: true,
      },
    });
    return success(res, user);
  } catch (err) {
    next(err);
  }
};

// PATCH /api/auth/me
const updateProfile = async (req, res, next) => {
  try {
    const { name, phone } = req.body;
    const user = await prisma.user.update({
      where: { id: req.user.id },
      data: { ...(name && { name }), ...(phone && { phone }) },
      select: { id: true, name: true, email: true, phone: true, avatar: true },
    });
    return success(res, user, 'Profile updated');
  } catch (err) {
    next(err);
  }
};

// POST /api/auth/change-password
const changePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;

    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) return error(res, 'Current password is incorrect', 400);

    const hashed = await bcrypt.hash(newPassword, 12);
    await prisma.user.update({ where: { id: req.user.id }, data: { password: hashed } });
    return success(res, null, 'Password changed successfully');
  } catch (err) {
    next(err);
  }
};

module.exports = { register, login, adminLogin, refreshToken, logout, getMe, updateProfile, changePassword };
