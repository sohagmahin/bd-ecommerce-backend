const prisma = require('../config/database');
const { success, paginated } = require('../utils/response');
const { parsePagination, paginationMeta } = require('../utils/helpers');

// GET /api/admin/dashboard
const getDashboard = async (req, res, next) => {
  try {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const [
      totalOrders,
      monthOrders,
      todayOrders,
      totalRevenue,
      monthRevenue,
      todayRevenue,
      totalCustomers,
      newCustomersThisMonth,
      pendingOrders,
      lowStockProducts,
      recentOrders,
    ] = await prisma.$transaction([
      prisma.order.count(),
      prisma.order.count({ where: { createdAt: { gte: startOfMonth } } }),
      prisma.order.count({ where: { createdAt: { gte: startOfToday } } }),

      prisma.payment.aggregate({
        where: { status: 'COMPLETED' },
        _sum: { amount: true },
      }),
      prisma.payment.aggregate({
        where: { status: 'COMPLETED', paidAt: { gte: startOfMonth } },
        _sum: { amount: true },
      }),
      prisma.payment.aggregate({
        where: { status: 'COMPLETED', paidAt: { gte: startOfToday } },
        _sum: { amount: true },
      }),

      prisma.user.count({ where: { role: 'CUSTOMER' } }),
      prisma.user.count({ where: { role: 'CUSTOMER', createdAt: { gte: startOfMonth } } }),

      prisma.order.count({ where: { status: 'PENDING' } }),

      prisma.product.findMany({
        where: { isActive: true, stock: { lte: prisma.product.fields.lowStockAlert } },
        select: { id: true, name: true, stock: true, lowStockAlert: true },
        take: 10,
      }),

      prisma.order.findMany({
        take: 10,
        orderBy: { createdAt: 'desc' },
        include: {
          user: { select: { name: true, email: true } },
          payment: { select: { status: true, method: true } },
        },
      }),
    ]);

    // Order status breakdown
    const ordersByStatus = await prisma.order.groupBy({
      by: ['status'],
      _count: { _all: true },
    });

    // Revenue last 7 days
    const last7Days = await Promise.all(
      Array.from({ length: 7 }, (_, i) => {
        const day = new Date();
        day.setDate(day.getDate() - i);
        const dayStart = new Date(day.getFullYear(), day.getMonth(), day.getDate());
        const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
        return prisma.payment
          .aggregate({
            where: { status: 'COMPLETED', paidAt: { gte: dayStart, lt: dayEnd } },
            _sum: { amount: true },
          })
          .then((r) => ({
            date: dayStart.toISOString().slice(0, 10),
            revenue: parseFloat(r._sum.amount || 0),
          }));
      })
    );

    return success(res, {
      orders: {
        total: totalOrders,
        thisMonth: monthOrders,
        today: todayOrders,
        pending: pendingOrders,
        byStatus: ordersByStatus.reduce((acc, s) => {
          acc[s.status] = s._count._all;
          return acc;
        }, {}),
      },
      revenue: {
        total: parseFloat(totalRevenue._sum.amount || 0),
        thisMonth: parseFloat(monthRevenue._sum.amount || 0),
        today: parseFloat(todayRevenue._sum.amount || 0),
        last7Days: last7Days.reverse(),
      },
      customers: {
        total: totalCustomers,
        newThisMonth: newCustomersThisMonth,
      },
      lowStockProducts,
      recentOrders,
    });
  } catch (err) {
    next(err);
  }
};

// GET /api/admin/users
const getUsers = async (req, res, next) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);
    const { role, search, active } = req.query;

    const where = {
      ...(role && { role }),
      ...(active !== undefined && { isActive: active === 'true' }),
      ...(search && {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } },
          { phone: { contains: search } },
        ],
      }),
    };

    const [users, total] = await prisma.$transaction([
      prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true, name: true, email: true, phone: true,
          role: true, isActive: true, isEmailVerified: true,
          createdAt: true,
          _count: { select: { orders: true } },
        },
      }),
      prisma.user.count({ where }),
    ]);

    return paginated(res, users, paginationMeta(total, page, limit));
  } catch (err) {
    next(err);
  }
};

// PATCH /api/admin/users/:id/status
const toggleUserStatus = async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    const updated = await prisma.user.update({
      where: { id: req.params.id },
      data: { isActive: !user.isActive },
      select: { id: true, name: true, email: true, isActive: true },
    });
    return success(res, updated, `User ${updated.isActive ? 'activated' : 'deactivated'}`);
  } catch (err) {
    next(err);
  }
};

// GET /api/admin/sales-report
const getSalesReport = async (req, res, next) => {
  try {
    const { from, to } = req.query;
    const fromDate = from ? new Date(from) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const toDate = to ? new Date(to) : new Date();

    const [payments, topProducts, paymentMethods] = await prisma.$transaction([
      prisma.payment.findMany({
        where: { status: 'COMPLETED', paidAt: { gte: fromDate, lte: toDate } },
        include: {
          order: {
            include: {
              items: { select: { productName: true, quantity: true, total: true } },
              user: { select: { name: true, email: true } },
            },
          },
        },
        orderBy: { paidAt: 'desc' },
      }),

      prisma.orderItem.groupBy({
        by: ['productId', 'productName'],
        where: { order: { payment: { status: 'COMPLETED', paidAt: { gte: fromDate, lte: toDate } } } },
        _sum: { quantity: true, total: true },
        orderBy: { _sum: { total: 'desc' } },
        take: 10,
      }),

      prisma.payment.groupBy({
        by: ['method'],
        where: { status: 'COMPLETED', paidAt: { gte: fromDate, lte: toDate } },
        _count: { _all: true },
        _sum: { amount: true },
      }),
    ]);

    const totalRevenue = payments.reduce((sum, p) => sum + parseFloat(p.amount), 0);
    const totalOrders = payments.length;

    return success(res, {
      summary: { totalRevenue, totalOrders, averageOrderValue: totalOrders ? totalRevenue / totalOrders : 0 },
      topProducts,
      paymentMethods,
      transactions: payments.slice(0, 50), // cap at 50 for API
    });
  } catch (err) {
    next(err);
  }
};

module.exports = { getDashboard, getUsers, toggleUserStatus, getSalesReport };
