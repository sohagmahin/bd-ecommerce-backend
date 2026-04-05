const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seed...');

  // ─── Admin User ──────────────────────────────────────────────────────────
  const hashedPassword = await bcrypt.hash(
    process.env.ADMIN_PASSWORD || 'Admin@12345',
    12
  );

  const admin = await prisma.user.upsert({
    where: { email: process.env.ADMIN_EMAIL || 'admin@yourdomain.com' },
    update: {},
    create: {
      name: process.env.ADMIN_NAME || 'Super Admin',
      email: process.env.ADMIN_EMAIL || 'admin@yourdomain.com',
      password: hashedPassword,
      role: 'ADMIN',
      isEmailVerified: true,
    },
  });
  console.log(`✅ Admin user created: ${admin.email}`);

  // ─── Categories ───────────────────────────────────────────────────────────
  const categories = [
    { name: 'Electronics', slug: 'electronics', description: 'Phones, laptops, gadgets' },
    { name: 'Fashion', slug: 'fashion', description: 'Clothing, shoes, accessories' },
    { name: 'Home & Living', slug: 'home-living', description: 'Furniture, decor, kitchen' },
    { name: 'Health & Beauty', slug: 'health-beauty', description: 'Skincare, health products' },
    { name: 'Sports', slug: 'sports', description: 'Sports equipment and gear' },
  ];

  for (const cat of categories) {
    await prisma.category.upsert({
      where: { slug: cat.slug },
      update: {},
      create: cat,
    });
  }
  console.log(`✅ ${categories.length} categories seeded`);

  const electronicsCategory = await prisma.category.findUnique({
    where: { slug: 'electronics' },
  });

  // ─── Sample Products ──────────────────────────────────────────────────────
  const products = [
    {
      name: 'Xiaomi Redmi 12C',
      slug: 'xiaomi-redmi-12c',
      sku: 'MOB-XMI-12C',
      price: 14999,
      comparePrice: 16999,
      stock: 50,
      categoryId: electronicsCategory.id,
      shortDescription: '6.71" HD+ display, 5000mAh battery, 50MP camera',
      description:
        'The Xiaomi Redmi 12C comes with a 6.71-inch HD+ display and is powered by the MediaTek Helio G85 processor with 4GB RAM. It features a 50MP dual camera and a massive 5000mAh battery.',
      tags: ['smartphone', 'xiaomi', 'budget phone'],
      isFeatured: true,
    },
    {
      name: 'Samsung Galaxy A34 5G',
      slug: 'samsung-galaxy-a34-5g',
      sku: 'MOB-SAM-A34',
      price: 34999,
      comparePrice: 38000,
      stock: 30,
      categoryId: electronicsCategory.id,
      shortDescription: '6.6" Super AMOLED, 5000mAh, 48MP triple camera',
      description:
        'Samsung Galaxy A34 5G features a 6.6-inch Super AMOLED display with 120Hz refresh rate, Dimensity 1080 processor, 48MP triple camera system, and 5000mAh battery with 25W fast charging.',
      tags: ['smartphone', 'samsung', '5g'],
      isFeatured: true,
    },
    {
      name: 'boAt Bassheads 100 Wired Earphones',
      slug: 'boat-bassheads-100',
      sku: 'EAR-BOAT-BH100',
      price: 499,
      comparePrice: 799,
      stock: 200,
      categoryId: electronicsCategory.id,
      shortDescription: 'Super Extra Bass, in-line mic, universal compatibility',
      description:
        'boAt BassHeads 100 wired earphones with 10mm dynamic driver for powerful bass. Features in-line microphone with multifunction button.',
      tags: ['earphones', 'audio', 'wired'],
    },
  ];

  for (const product of products) {
    await prisma.product.upsert({
      where: { slug: product.slug },
      update: {},
      create: product,
    });
  }
  console.log(`✅ ${products.length} sample products seeded`);

  console.log('🎉 Seed completed successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
