const prisma = require('../config/database');
const { cloudinary } = require('../config/cloudinary');
const { success, created, error, paginated } = require('../utils/response');
const { slugify, parsePagination, paginationMeta } = require('../utils/helpers');
const { cacheGet, cacheSet, cacheDel } = require('../services/cacheService');

// GET /api/products
const getProducts = async (req, res, next) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);
    const { category, search, featured, minPrice, maxPrice, sort } = req.query;

    const where = { isActive: true };
    if (category) where.category = { slug: category };
    if (featured === 'true') where.isFeatured = true;
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
        { tags: { has: search.toLowerCase() } },
      ];
    }
    if (minPrice || maxPrice) {
      where.price = {
        ...(minPrice && { gte: parseFloat(minPrice) }),
        ...(maxPrice && { lte: parseFloat(maxPrice) }),
      };
    }

    const orderBy = {
      'price_asc': { price: 'asc' },
      'price_desc': { price: 'desc' },
      'newest': { createdAt: 'desc' },
      'oldest': { createdAt: 'asc' },
    }[sort] || { createdAt: 'desc' };

    const cacheKey = `products:${JSON.stringify({ where, skip, limit, orderBy })}`;
    const cached = await cacheGet(cacheKey);
    if (cached) return res.json(cached);

    const [products, total] = await prisma.$transaction([
      prisma.product.findMany({
        where,
        skip,
        take: limit,
        orderBy,
        include: {
          category: { select: { id: true, name: true, slug: true } },
          images: { where: { isPrimary: true }, take: 1, select: { url: true, altText: true } },
        },
      }),
      prisma.product.count({ where }),
    ]);

    const response = {
      success: true,
      message: 'Success',
      data: products,
      meta: paginationMeta(total, page, limit),
    };
    await cacheSet(cacheKey, response, 120); // 2 min cache
    return res.json(response);
  } catch (err) {
    next(err);
  }
};

// GET /api/products/:slug
const getProduct = async (req, res, next) => {
  try {
    const product = await prisma.product.findFirst({
      where: { slug: req.params.slug, isActive: true },
      include: {
        category: { select: { id: true, name: true, slug: true } },
        images: { orderBy: { sortOrder: 'asc' } },
      },
    });
    if (!product) return error(res, 'Product not found', 404);
    return success(res, product);
  } catch (err) {
    next(err);
  }
};

// POST /api/admin/products
const createProduct = async (req, res, next) => {
  try {
    const {
      name, description, shortDescription, sku, price,
      comparePrice, costPrice, stock, lowStockAlert,
      categoryId, tags, weight, isFeatured,
    } = req.body;

    let slug = slugify(name);
    // Ensure slug uniqueness
    const existing = await prisma.product.findUnique({ where: { slug } });
    if (existing) slug = `${slug}-${Date.now()}`;

    const product = await prisma.product.create({
      data: {
        name,
        slug,
        description,
        shortDescription,
        sku,
        price: parseFloat(price),
        comparePrice: comparePrice ? parseFloat(comparePrice) : null,
        costPrice: costPrice ? parseFloat(costPrice) : null,
        stock: parseInt(stock || '0'),
        lowStockAlert: parseInt(lowStockAlert || '5'),
        categoryId,
        tags: tags ? (Array.isArray(tags) ? tags : tags.split(',').map((t) => t.trim())) : [],
        weight: weight ? parseFloat(weight) : null,
        isFeatured: isFeatured === 'true' || isFeatured === true,
      },
    });

    await cacheDel('products:*');
    return created(res, product, 'Product created');
  } catch (err) {
    next(err);
  }
};

// PATCH /api/admin/products/:id
const updateProduct = async (req, res, next) => {
  try {
    const { id } = req.params;
    const updateData = { ...req.body };

    // Type cast numerics
    if (updateData.price) updateData.price = parseFloat(updateData.price);
    if (updateData.comparePrice) updateData.comparePrice = parseFloat(updateData.comparePrice);
    if (updateData.costPrice) updateData.costPrice = parseFloat(updateData.costPrice);
    if (updateData.stock !== undefined) updateData.stock = parseInt(updateData.stock);
    if (updateData.tags && typeof updateData.tags === 'string') {
      updateData.tags = updateData.tags.split(',').map((t) => t.trim());
    }

    const product = await prisma.product.update({ where: { id }, data: updateData });
    await cacheDel('products:*');
    return success(res, product, 'Product updated');
  } catch (err) {
    next(err);
  }
};

// DELETE /api/admin/products/:id
const deleteProduct = async (req, res, next) => {
  try {
    const { id } = req.params;
    // Soft delete
    await prisma.product.update({ where: { id }, data: { isActive: false } });
    await cacheDel('products:*');
    return success(res, null, 'Product deleted');
  } catch (err) {
    next(err);
  }
};

// POST /api/admin/products/:id/images
const uploadImages = async (req, res, next) => {
  try {
    const { id } = req.params;
    const files = req.files;
    if (!files?.length) return error(res, 'No images provided', 400);

    const images = await prisma.$transaction(
      files.map((file, idx) =>
        prisma.productImage.create({
          data: {
            productId: id,
            url: file.path,         // Cloudinary URL
            publicId: file.filename, // Cloudinary public_id
            isPrimary: idx === 0,
            sortOrder: idx,
          },
        })
      )
    );

    return success(res, images, 'Images uploaded');
  } catch (err) {
    next(err);
  }
};

// DELETE /api/admin/products/images/:imageId
const deleteImage = async (req, res, next) => {
  try {
    const { imageId } = req.params;
    const image = await prisma.productImage.findUnique({ where: { id: imageId } });
    if (!image) return error(res, 'Image not found', 404);

    // Delete from Cloudinary
    await cloudinary.uploader.destroy(image.publicId);
    await prisma.productImage.delete({ where: { id: imageId } });

    return success(res, null, 'Image deleted');
  } catch (err) {
    next(err);
  }
};

// GET /api/categories
const getCategories = async (req, res, next) => {
  try {
    const cached = await cacheGet('categories:all');
    if (cached) return success(res, cached);

    const categories = await prisma.category.findMany({
      where: { isActive: true, parentId: null },
      include: { children: { where: { isActive: true } } },
      orderBy: { sortOrder: 'asc' },
    });
    await cacheSet('categories:all', categories, 600); // 10 min cache
    return success(res, categories);
  } catch (err) {
    next(err);
  }
};

// POST /api/admin/categories
const createCategory = async (req, res, next) => {
  try {
    const { name, description, parentId, imageUrl, sortOrder } = req.body;
    const slug = slugify(name);
    const category = await prisma.category.create({
      data: { name, slug, description, parentId, imageUrl, sortOrder: parseInt(sortOrder || '0') },
    });
    await cacheDel('categories:all');
    return created(res, category, 'Category created');
  } catch (err) {
    next(err);
  }
};

// PATCH /api/admin/products/:id/stock
const updateStock = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { stock } = req.body;
    const product = await prisma.product.update({
      where: { id },
      data: { stock: parseInt(stock) },
      select: { id: true, name: true, stock: true },
    });
    return success(res, product, 'Stock updated');
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getProducts, getProduct, createProduct, updateProduct, deleteProduct,
  uploadImages, deleteImage, getCategories, createCategory, updateStock,
};
