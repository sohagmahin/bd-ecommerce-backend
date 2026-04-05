const prisma = require('../config/database');
const { success, error } = require('../utils/response');
const {
  getCart, addToCart, updateCartItem, removeFromCart, clearCart,
} = require('../services/cacheService');

// GET /api/cart
const getCartItems = async (req, res, next) => {
  try {
    const items = await getCart(req.user.id);

    // Recalculate totals with current prices from DB
    let subtotal = 0;
    const enrichedItems = await Promise.all(
      items.map(async (item) => {
        const product = await prisma.product.findUnique({
          where: { id: item.productId },
          select: { id: true, name: true, price: true, stock: true, isActive: true, images: { where: { isPrimary: true }, take: 1 } },
        });
        if (!product || !product.isActive) return null;

        const currentPrice = parseFloat(product.price);
        const lineTotal = currentPrice * item.quantity;
        subtotal += lineTotal;

        return {
          ...item,
          price: currentPrice,
          name: product.name,
          imageUrl: product.images[0]?.url || null,
          inStock: product.stock >= item.quantity,
          lineTotal,
        };
      })
    );

    const validItems = enrichedItems.filter(Boolean);
    return success(res, { items: validItems, subtotal: parseFloat(subtotal.toFixed(2)) });
  } catch (err) {
    next(err);
  }
};

// POST /api/cart/items
const addItem = async (req, res, next) => {
  try {
    const { productId, quantity = 1 } = req.body;

    const product = await prisma.product.findUnique({
      where: { id: productId },
      select: { id: true, name: true, price: true, stock: true, isActive: true },
    });

    if (!product || !product.isActive) return error(res, 'Product not found', 404);
    if (product.stock < quantity) return error(res, `Only ${product.stock} units available`, 400);

    const items = await addToCart(req.user.id, {
      productId,
      quantity: parseInt(quantity),
      price: parseFloat(product.price),
      name: product.name,
    });

    return success(res, items, 'Item added to cart');
  } catch (err) {
    next(err);
  }
};

// PATCH /api/cart/items/:productId
const updateItem = async (req, res, next) => {
  try {
    const { productId } = req.params;
    const { quantity } = req.body;

    if (quantity > 0) {
      const product = await prisma.product.findUnique({
        where: { id: productId },
        select: { stock: true, isActive: true },
      });
      if (!product?.isActive) return error(res, 'Product not available', 404);
      if (product.stock < quantity) return error(res, `Only ${product.stock} units available`, 400);
    }

    const items = await updateCartItem(req.user.id, productId, parseInt(quantity));
    return success(res, items, 'Cart updated');
  } catch (err) {
    next(err);
  }
};

// DELETE /api/cart/items/:productId
const removeItem = async (req, res, next) => {
  try {
    const items = await removeFromCart(req.user.id, req.params.productId);
    return success(res, items, 'Item removed from cart');
  } catch (err) {
    next(err);
  }
};

// DELETE /api/cart
const clearCartHandler = async (req, res, next) => {
  try {
    await clearCart(req.user.id);
    return success(res, null, 'Cart cleared');
  } catch (err) {
    next(err);
  }
};

module.exports = { getCartItems, addItem, updateItem, removeItem, clearCartHandler };
