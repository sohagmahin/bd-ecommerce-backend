const prisma = require('../config/database');
const { success, created, error, paginated } = require('../utils/response');
const { generateOrderNumber, calculateOrderTotals, parsePagination, paginationMeta } = require('../utils/helpers');
const { clearCart, getCart } = require('../services/cacheService');
const { sendOrderConfirmation, sendOrderStatusUpdate } = require('../services/emailService');
const { sendOrderConfirmationSms, sendOrderStatusSms } = require('../services/smsService');
const logger = require('../utils/logger');

const SHIPPING_FEE = 60; // BDT default

// POST /api/orders
const placeOrder = async (req, res, next) => {
  try {
    const { addressId, paymentMethod, notes } = req.body;

    // Resolve shipping address
    const address = await prisma.address.findFirst({
      where: { id: addressId, userId: req.user.id },
    });
    if (!address) return error(res, 'Shipping address not found', 404);

    // Get cart items
    const cartItems = await getCart(req.user.id);
    if (!cartItems.length) return error(res, 'Cart is empty', 400);

    // Validate stock and build order items
    const itemsToCreate = [];
    for (const cartItem of cartItems) {
      const product = await prisma.product.findUnique({
        where: { id: cartItem.productId },
        include: { images: { where: { isPrimary: true }, take: 1 } },
      });
      if (!product || !product.isActive) {
        return error(res, `Product "${cartItem.name}" is no longer available`, 400);
      }
      if (product.stock < cartItem.quantity) {
        return error(res, `Insufficient stock for "${product.name}". Available: ${product.stock}`, 400);
      }
      itemsToCreate.push({
        productId: product.id,
        productName: product.name,
        productSku: product.sku,
        imageUrl: product.images[0]?.url || null,
        unitPrice: parseFloat(product.price),
        quantity: cartItem.quantity,
        total: parseFloat(product.price) * cartItem.quantity,
      });
    }

    const { subtotal, shippingFee, discount, total } = calculateOrderTotals(
      itemsToCreate.map((i) => ({ price: i.unitPrice, quantity: i.quantity })),
      SHIPPING_FEE
    );

    // Create order + decrement stock in a transaction
    const order = await prisma.$transaction(async (tx) => {
      const newOrder = await tx.order.create({
        data: {
          orderNumber: generateOrderNumber(),
          userId: req.user.id,
          shippingName: address.fullName,
          shippingPhone: address.phone,
          shippingLine1: address.line1,
          shippingLine2: address.line2,
          shippingCity: address.city,
          shippingDistrict: address.district,
          shippingDivision: address.division,
          shippingPostal: address.postalCode,
          subtotal,
          shippingFee,
          discount,
          total,
          notes,
          items: { create: itemsToCreate },
          statusHistory: {
            create: { status: 'PENDING', note: 'Order placed' },
          },
        },
        include: { items: true },
      });

      // Create payment record
      await tx.payment.create({
        data: {
          orderId: newOrder.id,
          method: paymentMethod || 'SSLCOMMERZ',
          amount: total,
          status: 'PENDING',
        },
      });

      // Decrement stock
      for (const item of itemsToCreate) {
        await tx.product.update({
          where: { id: item.productId },
          data: { stock: { decrement: item.quantity } },
        });
      }

      return newOrder;
    });

    // Clear cart after successful order
    await clearCart(req.user.id);

    // Notifications (fire and forget)
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    sendOrderConfirmation(user, order).catch((e) =>
      logger.warn('Order confirmation email failed', { error: e.message })
    );
    if (user.phone) {
      sendOrderConfirmationSms(user.phone, order.orderNumber, total).catch((e) =>
        logger.warn('Order SMS failed', { error: e.message })
      );
    }

    return created(res, order, 'Order placed successfully');
  } catch (err) {
    next(err);
  }
};

// GET /api/orders
const getMyOrders = async (req, res, next) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);
    const { status } = req.query;

    const where = { userId: req.user.id, ...(status && { status }) };

    const [orders, total] = await prisma.$transaction([
      prisma.order.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          items: true,
          payment: { select: { status: true, method: true } },
        },
      }),
      prisma.order.count({ where }),
    ]);

    return paginated(res, orders, paginationMeta(total, page, limit));
  } catch (err) {
    next(err);
  }
};

// GET /api/orders/:id
const getOrder = async (req, res, next) => {
  try {
    const order = await prisma.order.findFirst({
      where: { id: req.params.id, userId: req.user.id },
      include: {
        items: true,
        payment: true,
        statusHistory: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!order) return error(res, 'Order not found', 404);
    return success(res, order);
  } catch (err) {
    next(err);
  }
};

// POST /api/orders/:id/cancel  (customer cancel — only allowed in PENDING)
const cancelOrder = async (req, res, next) => {
  try {
    const order = await prisma.order.findFirst({
      where: { id: req.params.id, userId: req.user.id },
    });
    if (!order) return error(res, 'Order not found', 404);
    if (order.status !== 'PENDING') {
      return error(res, 'Only pending orders can be cancelled', 400);
    }

    await updateOrderStatus(order.id, 'CANCELLED', 'Cancelled by customer');
    return success(res, null, 'Order cancelled');
  } catch (err) {
    next(err);
  }
};

// ─── Admin order management ───────────────────────────────────────────────────

// GET /api/admin/orders
const adminGetOrders = async (req, res, next) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);
    const { status, search } = req.query;

    const where = {
      ...(status && { status }),
      ...(search && {
        OR: [
          { orderNumber: { contains: search, mode: 'insensitive' } },
          { user: { name: { contains: search, mode: 'insensitive' } } },
          { user: { email: { contains: search, mode: 'insensitive' } } },
        ],
      }),
    };

    const [orders, total] = await prisma.$transaction([
      prisma.order.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          user: { select: { id: true, name: true, email: true, phone: true } },
          items: true,
          payment: true,
        },
      }),
      prisma.order.count({ where }),
    ]);

    return paginated(res, orders, paginationMeta(total, page, limit));
  } catch (err) {
    next(err);
  }
};

// PATCH /api/admin/orders/:id/status
const adminUpdateStatus = async (req, res, next) => {
  try {
    const { status, note } = req.body;
    const validTransitions = {
      PENDING: ['CONFIRMED', 'CANCELLED'],
      CONFIRMED: ['PROCESSING', 'CANCELLED'],
      PROCESSING: ['SHIPPED', 'CANCELLED'],
      SHIPPED: ['DELIVERED'],
      DELIVERED: ['REFUNDED'],
      CANCELLED: [],
      REFUNDED: [],
    };

    const order = await prisma.order.findUnique({ where: { id: req.params.id } });
    if (!order) return error(res, 'Order not found', 404);

    if (!validTransitions[order.status]?.includes(status)) {
      return error(res, `Cannot transition from ${order.status} to ${status}`, 400);
    }

    const updated = await updateOrderStatus(order.id, status, note || `Status updated to ${status}`);

    // Notify customer
    const user = await prisma.user.findUnique({ where: { id: order.userId } });
    sendOrderStatusUpdate(user, order, status).catch(() => {});
    if (user.phone && ['SHIPPED', 'DELIVERED', 'CANCELLED'].includes(status)) {
      sendOrderStatusSms(user.phone, order.orderNumber, status).catch(() => {});
    }

    return success(res, updated, 'Order status updated');
  } catch (err) {
    next(err);
  }
};

// Internal helper
async function updateOrderStatus(orderId, status, note) {
  return prisma.$transaction(async (tx) => {
    const updated = await tx.order.update({
      where: { id: orderId },
      data: { status },
    });
    await tx.orderStatusHistory.create({ data: { orderId, status, note } });
    return updated;
  });
}

// POST /api/orders/addresses
const addAddress = async (req, res, next) => {
  try {
    const { label, fullName, phone, line1, line2, city, district, division, postalCode, isDefault } = req.body;

    if (isDefault) {
      await prisma.address.updateMany({
        where: { userId: req.user.id },
        data: { isDefault: false },
      });
    }

    const address = await prisma.address.create({
      data: {
        userId: req.user.id,
        label, fullName, phone, line1, line2,
        city, district, division, postalCode,
        isDefault: isDefault || false,
      },
    });
    return created(res, address, 'Address added');
  } catch (err) {
    next(err);
  }
};

// GET /api/orders/addresses
const getAddresses = async (req, res, next) => {
  try {
    const addresses = await prisma.address.findMany({
      where: { userId: req.user.id },
      orderBy: { isDefault: 'desc' },
    });
    return success(res, addresses);
  } catch (err) {
    next(err);
  }
};

module.exports = {
  placeOrder, getMyOrders, getOrder, cancelOrder,
  adminGetOrders, adminUpdateStatus,
  addAddress, getAddresses,
};
