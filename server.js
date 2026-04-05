require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const morgan = require('morgan');

const logger = require('./src/utils/logger');
const errorHandler = require('./src/middleware/errorHandler');
const { generalLimiter } = require('./src/middleware/rateLimiter');

// Route modules
const authRoutes = require('./src/routes/auth');
const productRoutes = require('./src/routes/products');
const cartRoutes = require('./src/routes/cart');
const orderRoutes = require('./src/routes/orders');
const paymentRoutes = require('./src/routes/payments');
const adminRoutes = require('./src/routes/admin');

const app = express();
const PORT = process.env.PORT || 5000;

// ─── Security & utility middleware ─────────────────────────────────────────────
app.use(helmet());
app.use(compression());

app.use(
  cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

// Trust Nginx reverse proxy (for correct req.ip behind proxy)
app.set('trust proxy', 1);

// ─── Body parsing ─────────────────────────────────────────────────────────────
// SSL Commerz sends application/x-www-form-urlencoded callbacks
app.use('/api/payments/sslcommerz', express.urlencoded({ extended: true }));
app.use(express.json({ limit: '10mb' }));

// ─── Logging ──────────────────────────────────────────────────────────────────
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('combined', { stream: { write: (msg) => logger.info(msg.trim()) } }));
}

// ─── Global rate limiter ──────────────────────────────────────────────────────
app.use('/api/', generalLimiter);

// ─── Health check ─────────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), uptime: process.uptime() });
});

// ─── API routes ───────────────────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/admin', adminRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ success: false, message: `Route ${req.originalUrl} not found` });
});

// ─── Global error handler ─────────────────────────────────────────────────────
app.use(errorHandler);

// ─── Start server ─────────────────────────────────────────────────────────────
async function startServer() {
  try {
    // Verify DB connection
    const prisma = require('./src/config/database');
    await prisma.$connect();
    logger.info('Database connected');

    // Verify Redis connection
    const { getRedisClient } = require('./src/config/redis');
    const redis = getRedisClient();
    await redis.ping();
    logger.info('Redis connected');

    app.listen(PORT, () => {
      logger.info(`Server running on port ${PORT} [${process.env.NODE_ENV || 'development'}]`);
    });
  } catch (err) {
    logger.error('Failed to start server', { error: err.message });
    process.exit(1);
  }
}

startServer();

// ─── Graceful shutdown ────────────────────────────────────────────────────────
const shutdown = async (signal) => {
  logger.info(`${signal} received, shutting down gracefully`);
  const prisma = require('./src/config/database');
  await prisma.$disconnect();
  process.exit(0);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled promise rejection', { reason });
});

module.exports = app;
