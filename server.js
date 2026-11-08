require('dotenv').config();

const express = require('express');
const path = require('path');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();
const mysql = require('mysql2/promise');
const { MongoClient, ObjectId } = require('mongodb');
const session = require('express-session');

const app = express();
const PORT = process.env.PORT || 8000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const SESSION_SECRET = process.env.SESSION_SECRET;
if (!ADMIN_PASSWORD || !SESSION_SECRET) {
  console.warn('Warning: ADMIN_PASSWORD and/or SESSION_SECRET not set. Configure .env/environment for admin access.');
}
const DATA_DIR = path.join(__dirname, 'data');
const DB_PATH = path.join(DATA_DIR, 'orders.db');
const MONGODB_URI = process.env.MONGODB_URI;
const MONGODB_DB = process.env.MONGODB_DB || 'mahashree_namkeen';
const MYSQL_CONFIG = {
  host: process.env.MYSQL_HOST,
  port: Number(process.env.MYSQL_PORT || 3306),
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
  database: process.env.MYSQL_DATABASE,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
};

const PRODUCT_CATEGORIES = [
  { slug: 'all-products', label: 'All Products', icon: '🛍️' },
  { slug: 'crunchy-snacks', label: 'Crunchy Snacks', icon: '🥨' },
  { slug: 'namkeen-mixtures', label: 'Namkeen & Mixtures', icon: '🥣' },
  { slug: 'bhujia-sev', label: 'Bhujia & Sev', icon: '🍜' },
  { slug: 'peanut-snacks', label: 'Peanut Snacks', icon: '🥜' },
  { slug: 'dal-pulse-snacks', label: 'Dal & Pulse Snacks', icon: '🌾' },
  { slug: 'spicy-masala-snacks', label: 'Spicy & Masala Snacks', icon: '🌶️' },
];
const PRODUCT_CATEGORY_SLUGS = new Set(PRODUCT_CATEGORIES.filter((c) => c.slug !== 'all-products').map((c) => c.slug));
const LEGACY_CATEGORY_MAP = { savory: 'namkeen-mixtures', nuts: 'peanut-snacks', 'best-seller': 'crunchy-snacks', crunchy: 'crunchy-snacks', namkeen: 'namkeen-mixtures', mixture: 'namkeen-mixtures', mixtures: 'namkeen-mixtures', bhujia: 'bhujia-sev', sev: 'bhujia-sev', peanut: 'peanut-snacks', peanuts: 'peanut-snacks', dal: 'dal-pulse-snacks', pulse: 'dal-pulse-snacks', spicy: 'spicy-masala-snacks', masala: 'spicy-masala-snacks' };

function inferProductCategory(product) {
  const text = `${product?.name || ''} ${product?.description || ''} ${product?.category || ''}`.toLowerCase();
  const has = (...ws) => ws.some((w) => text.includes(w));
  if (has('bhujia', 'sev', 'bhujiya')) return 'bhujia-sev';
  if (has('peanut', 'moongfali', 'badam peanut', 'groundnut')) return 'peanut-snacks';
  if (has('mixture', 'mix', 'namkeen', 'navratan', 'farsan', 'chivda', 'chewda')) return 'namkeen-mixtures';
  if (has('spicy', 'masala', 'chilli', 'chili', 'hot', 'teekha', 'peri')) return 'spicy-masala-snacks';
  if (has('moong dal', 'chana dal', 'masoor dal', 'dal moth', 'dal snack', 'pulse snack', 'lentil snack')) return 'dal-pulse-snacks';
  if (has('crunch', 'chips', 'crispy', 'kurkure', 'puff', 'sticks', 'fryums')) return 'crunchy-snacks';
  const mapped = LEGACY_CATEGORY_MAP[String(product?.category || '').trim().toLowerCase()];
  if (mapped && PRODUCT_CATEGORY_SLUGS.has(mapped)) return mapped;
  return 'namkeen-mixtures';
}
function normalizeProductCategory(raw, product) {
  const v = String(raw || '').trim().toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  if (v === 'uncategorized' || v === 'none' || v === '') return 'uncategorized';
  if (PRODUCT_CATEGORY_SLUGS.has(v)) return v;
  if (LEGACY_CATEGORY_MAP[v]) return LEGACY_CATEGORY_MAP[v];
  return inferProductCategory({ ...(product || {}), category: raw || product?.category || '' });
}
function normalizeProductRow(row) {
  if (!row) return row;
  const category = normalizeProductCategory(row.category, row);
  const cat = PRODUCT_CATEGORIES.find((c) => c.slug === category);
  return { ...row, category, categoryLabel: cat?.label || (category === 'uncategorized' ? 'Uncategorized' : category), price: Number(row.price || 0) };
}

const DEFAULT_PRODUCTS = [
  {
    name: 'Phurandana & Majedar Mix',
    category: 'crunchy-snacks',
    price: 225,
    description: 'Selected chewra, puffed grains, lentils, peanuts, and a rich spice blend.',
    image: 'https://images.unsplash.com/photo-1604908553252-8d5d7f8e34f0?auto=format&fit=crop&w=800&q=80',
  },
  {
    name: 'Majedar Mix',
    category: 'namkeen-mixtures',
    price: 175,
    description: 'Classic savory crunch with roasted ingredients and handpicked spice notes.',
    image: 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=800&q=80',
  },
  {
    name: 'Salted Peanut',
    category: 'nuts',
    price: 200,
    description: 'Roasted peanuts with balanced seasoning and a satisfying savory finish.',
    image: 'https://images.unsplash.com/photo-1471193945509-9ad0617afabf?auto=format&fit=crop&w=800&q=80',
  },
  {
    name: 'Navratan Mix',
    category: 'namkeen-mixtures',
    price: 120,
    description: 'A festive combination of gram flour, lentils, nuts, raisins, and warming spices.',
    image: 'https://images.unsplash.com/photo-1547592180-85f173990554?auto=format&fit=crop&w=800&q=80',
  },
];

const useMongo = Boolean(MONGODB_URI);
const useMysql = Boolean(MYSQL_CONFIG.host && MYSQL_CONFIG.user && MYSQL_CONFIG.database);
let databaseMode = 'sqlite';
let mongoClient = null;
let mongoDb = null;
let mysqlPool = null;
let sqliteDb = null;

fs.mkdirSync(DATA_DIR, { recursive: true });

function maskMongoUri(uri) {
  if (!uri) return 'MongoDB Atlas';
  try {
    return uri.replace(/:\/\/(.*?)(:\w+)?@/, '://***:***@');
  } catch (error) {
    return 'MongoDB Atlas';
  }
}

async function initMongo() {
  if (!useMongo) return null;

  try {
    mongoClient = new MongoClient(MONGODB_URI);
    await mongoClient.connect();
    mongoDb = mongoClient.db(MONGODB_DB);
    const ordersCollection = mongoDb.collection('orders');
    const productsCollection = mongoDb.collection('products');
    const ledgerCollection = mongoDb.collection('order_financial_ledger');
    await ordersCollection.createIndex({ created_at: -1 });
    await productsCollection.createIndex({ created_at: -1 });
    await ledgerCollection.createIndex({ source_order_id: 1 }, { unique: true, sparse: true });
    await ledgerCollection.createIndex({ idempotency_key: 1 }, { unique: true, sparse: true });
    await ledgerCollection.createIndex({ placed_at: -1 });
    const statsCol = mongoDb.collection('dashboard_statistics');
    const dailyCol = mongoDb.collection('dashboard_daily_stats');
    const countedCol = mongoDb.collection('dashboard_stats_counted');
    const auditCol = mongoDb.collection('dashboard_stats_audit');
    await statsCol.updateOne({_id:'main'},{$setOnInsert:{_id:'main',generation:1,total_orders:0,total_revenue:0,today_orders:0,today_revenue:0,week_orders:0,week_revenue:0,month_orders:0,month_revenue:0,updated_at:new Date()}},{upsert:true});
    await dailyCol.createIndex({stat_date:1,generation:1},{unique:true});
    await countedCol.createIndex({order_key:1},{unique:true});

    if ((await productsCollection.countDocuments()) === 0) {
      await productsCollection.insertMany(
        DEFAULT_PRODUCTS.map((product) => ({
          ...product,
          created_at: new Date(),
        }))
      );
    }

    console.log('MongoDB Atlas connected to database:', MONGODB_DB);
    return mongoDb;
  } catch (error) {
    console.error('MongoDB connection error:', error.message);
    throw error;
  }
}

async function initMysql() {
  if (!useMysql) return null;

  try {
    mysqlPool = mysql.createPool(MYSQL_CONFIG);
    const connection = await mysqlPool.getConnection();
    await connection.query(`
      CREATE TABLE IF NOT EXISTS orders (
        id INT AUTO_INCREMENT PRIMARY KEY,
        customer_name VARCHAR(255),
        phone VARCHAR(50),
        email VARCHAR(255),
        address TEXT,
        note TEXT,
        items LONGTEXT,
        total DECIMAL(10,2) DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await connection.query(`
      CREATE TABLE IF NOT EXISTS products (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255),
        category VARCHAR(100),
        price DECIMAL(10,2) DEFAULT 0,
        description TEXT,
        image TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await connection.query(`CREATE TABLE IF NOT EXISTS order_financial_ledger (
      id INT AUTO_INCREMENT PRIMARY KEY,
      source_order_id VARCHAR(64) UNIQUE,
      idempotency_key VARCHAR(191) NULL,
      order_snapshot LONGTEXT,
      items LONGTEXT,
      subtotal DECIMAL(10,2) DEFAULT 0,
      delivery_charge DECIMAL(10,2) DEFAULT 0,
      discount DECIMAL(10,2) DEFAULT 0,
      total DECIMAL(10,2) DEFAULT 0,
      revenue_amount DECIMAL(10,2) DEFAULT 0,
      status VARCHAR(50) DEFAULT 'pending',
      payment_status VARCHAR(50),
      payment_method VARCHAR(100),
      customer_name VARCHAR(255),
      phone VARCHAR(50),
      email VARCHAR(255),
      address TEXT,
      placed_at TIMESTAMP NULL,
      recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      active_deleted TINYINT(1) DEFAULT 0,
      active_deleted_at TIMESTAMP NULL,
      UNIQUE KEY uq_ledger_idem (idempotency_key)
    )`);
    await connection.query(`CREATE TABLE IF NOT EXISTS dashboard_statistics (
      id INT PRIMARY KEY, generation INT DEFAULT 1,
      total_orders INT DEFAULT 0, total_revenue DECIMAL(12,2) DEFAULT 0,
      today_orders INT DEFAULT 0, today_revenue DECIMAL(12,2) DEFAULT 0,
      week_orders INT DEFAULT 0, week_revenue DECIMAL(12,2) DEFAULT 0,
      month_orders INT DEFAULT 0, month_revenue DECIMAL(12,2) DEFAULT 0,
      today_date VARCHAR(20), week_start VARCHAR(20), month_key VARCHAR(20), updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`);
    await connection.query(`CREATE TABLE IF NOT EXISTS dashboard_daily_stats (
      stat_date VARCHAR(20), generation INT DEFAULT 1, orders INT DEFAULT 0, revenue DECIMAL(12,2) DEFAULT 0,
      PRIMARY KEY (stat_date, generation)
    )`);
    await connection.query(`CREATE TABLE IF NOT EXISTS dashboard_stats_counted (
      order_key VARCHAR(191) PRIMARY KEY, generation INT, counted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`);
    await connection.query(`CREATE TABLE IF NOT EXISTS dashboard_stats_audit (
      id INT AUTO_INCREMENT PRIMARY KEY, action VARCHAR(100), admin_user VARCHAR(255), at_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP, details TEXT
    )`);
    await connection.query(`INSERT IGNORE INTO dashboard_statistics (id,generation) VALUES (1,1)`);

    const [rows] = await connection.query(`SELECT COUNT(*) AS total FROM products`);
    if (Number(rows[0]?.total || 0) === 0) {
      await connection.query(
        `INSERT INTO products (name, category, price, description, image) VALUES ?`,
        [DEFAULT_PRODUCTS.map((product) => [product.name, product.category, product.price, product.description, product.image])]
      );
    }
    connection.release();
    console.log('MySQL database ready:', MYSQL_CONFIG.database);
    return mysqlPool;
  } catch (error) {
    console.error('MySQL connection error:', error.message);
    throw error;
  }
}

function initSqlite() {
  sqliteDb = new sqlite3.Database(DB_PATH, (err) => {
    if (err) {
      console.error('Database connection error:', err.message);
      process.exit(1);
    }

    sqliteDb.run(`
      CREATE TABLE IF NOT EXISTS orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        customer_name TEXT,
        phone TEXT,
        email TEXT,
        address TEXT,
        note TEXT,
        items TEXT,
        total REAL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `, (createErr) => {
      if (createErr) {
        console.error('Database setup error:', createErr.message);
        process.exit(1);
      }
      sqliteDb.run(`CREATE TABLE IF NOT EXISTS order_financial_ledger (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        source_order_id TEXT UNIQUE,
        idempotency_key TEXT,
        order_snapshot TEXT,
        items TEXT,
        subtotal REAL DEFAULT 0,
        delivery_charge REAL DEFAULT 0,
        discount REAL DEFAULT 0,
        total REAL DEFAULT 0,
        revenue_amount REAL DEFAULT 0,
        status TEXT DEFAULT 'pending',
        payment_status TEXT,
        payment_method TEXT,
        customer_name TEXT,
        phone TEXT,
        email TEXT,
        address TEXT,
        placed_at TEXT,
        recorded_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        active_deleted INTEGER DEFAULT 0,
        active_deleted_at TEXT
      )`);
      sqliteDb.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_ledger_idem ON order_financial_ledger(idempotency_key) WHERE idempotency_key IS NOT NULL AND idempotency_key != ''`, (e)=>{ if(e) console.error('ledger index',e.message); });
      sqliteDb.serialize(() => {
        const logE = (label) => (e) => { if (e) console.error(label, e.message); };
        sqliteDb.run(`CREATE TABLE IF NOT EXISTS dashboard_statistics (
          id INTEGER PRIMARY KEY CHECK (id=1),
          generation INTEGER DEFAULT 1,
          total_orders INTEGER DEFAULT 0,
          total_revenue REAL DEFAULT 0,
          today_orders INTEGER DEFAULT 0,
          today_revenue REAL DEFAULT 0,
          week_orders INTEGER DEFAULT 0,
          week_revenue REAL DEFAULT 0,
          month_orders INTEGER DEFAULT 0,
          month_revenue REAL DEFAULT 0,
          today_date TEXT,
          week_start TEXT,
          month_key TEXT,
          updated_at TEXT
        )`, logE('dashboard_statistics table'));
        // Migrate old daily stats schema (stat_date PK) to (stat_date,generation) PK if needed.
        sqliteDb.get(`SELECT sql FROM sqlite_master WHERE type='table' AND name='dashboard_daily_stats'`, (msErr, msRow) => {
          const sql = String(msRow?.sql||'');
          if (msRow && sql && !/PRIMARY KEY\s*\(\s*stat_date\s*,\s*generation\s*\)/i.test(sql)) {
            sqliteDb.serialize(() => {
              sqliteDb.run(`ALTER TABLE dashboard_daily_stats RENAME TO dashboard_daily_stats_old`, logE('daily stats migrate rename'));
              sqliteDb.run(`CREATE TABLE dashboard_daily_stats (stat_date TEXT, generation INTEGER DEFAULT 1, orders INTEGER DEFAULT 0, revenue DECIMAL(12,2) DEFAULT 0, PRIMARY KEY (stat_date, generation))`, logE('daily stats migrate create'));
              sqliteDb.run(`INSERT OR IGNORE INTO dashboard_daily_stats (stat_date,generation,orders,revenue) SELECT stat_date, COALESCE(generation,1), COALESCE(orders,0), COALESCE(revenue,0) FROM dashboard_daily_stats_old`, logE('daily stats migrate copy'));
              sqliteDb.run(`DROP TABLE IF EXISTS dashboard_daily_stats_old`, logE('daily stats migrate drop'));
            });
          } else {
            sqliteDb.run(`CREATE TABLE IF NOT EXISTS dashboard_daily_stats (
              stat_date TEXT, generation INTEGER DEFAULT 1, orders INTEGER DEFAULT 0, revenue REAL DEFAULT 0,
              PRIMARY KEY (stat_date, generation)
            )`, logE('dashboard_daily_stats table'));
          }
        });
        sqliteDb.run(`CREATE TABLE IF NOT EXISTS dashboard_stats_counted (
          order_key TEXT PRIMARY KEY,
          generation INTEGER,
          counted_at TEXT,
          event TEXT
        )`, logE('dashboard_stats_counted table'));
        sqliteDb.run(`ALTER TABLE dashboard_stats_counted ADD COLUMN event TEXT`, ()=>{});
        sqliteDb.run(`CREATE TABLE IF NOT EXISTS dashboard_stats_audit (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          action TEXT, admin_user TEXT, at_time TEXT, details TEXT
        )`, logE('dashboard_stats_audit table'));
        sqliteDb.run(`INSERT OR IGNORE INTO dashboard_statistics (id,generation,total_orders,total_revenue,today_orders,today_revenue,week_orders,week_revenue,month_orders,month_revenue,updated_at) VALUES (1,1,0,0,0,0,0,0,0,0,CURRENT_TIMESTAMP)`, logE('dashboard_statistics seed'));
      });

      sqliteDb.run(`
        CREATE TABLE IF NOT EXISTS products (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT,
          category TEXT,
          price REAL,
          description TEXT,
          image TEXT,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
      `, (productsErr) => {
        if (productsErr) {
          console.error('Products table setup error:', productsErr.message);
          process.exit(1);
        }

        sqliteDb.get(`SELECT COUNT(*) AS total FROM products`, (countErr, countRow) => {
          if (countErr) {
            console.error('Product seed check error:', countErr.message);
            return;
          }

          if (Number(countRow?.total || 0) === 0) {
            const insertStatement = sqliteDb.prepare(`
              INSERT INTO products (name, category, price, description, image)
              VALUES (?, ?, ?, ?, ?)
            `);

            DEFAULT_PRODUCTS.forEach((product) => {
              insertStatement.run(
                product.name,
                product.category,
                product.price,
                product.description,
                product.image
              );
            });

            insertStatement.finalize();
          }
        });

        console.log('SQLite database ready at', DB_PATH);
      });
    });
  });
}

async function initializeDatabase() {
  if (useMongo) {
    try {
      await initMongo();
      databaseMode = 'mongodb';
      return 'mongodb';
    } catch (error) {
      console.warn('Falling back to SQLite because MongoDB Atlas is unavailable.');
    }
  }

  if (useMysql) {
    try {
      await initMysql();
      databaseMode = 'mysql';
      return 'mysql';
    } catch (error) {
      console.warn('Falling back to SQLite because MySQL is unavailable.');
    }
  }

  initSqlite();
  databaseMode = 'sqlite';
  return 'sqlite';
}

function parseOrderJson(value, fallback) {
  if (value === null || value === undefined || value === '') return fallback;
  try { const parsed = typeof value === 'string' ? JSON.parse(value) : value; return parsed ?? fallback; } catch { return fallback; }
}
function normalizeMoney(value) { const n = Number(value); return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0; }
function normalizeOrder(row) {
  if (!row) return row;
  const items = parseOrderItems(row.items);
  const customer = parseOrderJson(row.customer, null) || { name: row.customer_name || '', phone: row.phone || '', email: row.email || '', address: row.address || row.delivery_address || '' };
  const totals = parseOrderJson(row.totals, null) || { subtotal: normalizeMoney(row.subtotal != null ? row.subtotal : row.total), deliveryCharge: normalizeMoney(row.delivery_charge), discount: normalizeMoney(row.discount), total: normalizeMoney(row.total) };
  return { ...row, id: row.id != null ? String(row.id) : row.id, customer_name: row.customer_name || customer.name || '', phone: row.phone || customer.phone || '', email: row.email || customer.email || '', address: row.address || customer.address || row.delivery_address || '', delivery_address: row.delivery_address || row.address || customer.address || '', items, subtotal: totals.subtotal, delivery_charge: totals.deliveryCharge, discount: totals.discount, total: totals.total, payment_method: row.payment_method || 'Cash on Delivery', payment_status: row.payment_status || 'Pending', status: row.status || 'pending', idempotency_key: row.idempotency_key || row.client_order_id || '', customer, totals };
}

function parseOrderItems(value) {
  if (!value) return [];

  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
}

async function insertProduct(productData) {
  const { name, category, price, description, image } = productData;
  const cleanName = String(name || '').trim();
  const cleanCategory = normalizeProductCategory(category, productData);
  const cleanImage = String(image || '').trim();

  const cleanPrice = Number(String(price ?? '').replace(/NPR|Rs\.?|,|\s/gi, ''));
  if (!cleanName || !cleanCategory || !Number.isFinite(cleanPrice) || cleanPrice <= 0 || !cleanImage) {
    throw new Error('Product name, category, a valid price greater than 0, and image are required.');
  }

  if (mongoDb) {
    const result = await mongoDb.collection('products').insertOne({
      name: cleanName,
      category: cleanCategory,
      price: cleanPrice,
      description: description || '',
      image: cleanImage,
      created_at: new Date(),
    });

    return { id: result.insertedId.toString(), ...productData, price: Number(price) };
  }

  if (useMysql && mysqlPool) {
    const [result] = await mysqlPool.execute(
      `INSERT INTO products (name, category, price, description, image)
       VALUES (?, ?, ?, ?, ?)`,
      [cleanName, cleanCategory, cleanPrice, description || '', cleanImage]
    );
    return normalizeProductRow({ id: result.insertId, name: cleanName, category: cleanCategory, price: cleanPrice, description: description || '', image: cleanImage });
  }

  return new Promise((resolve, reject) => {
    sqliteDb.run(
      `INSERT INTO products (name, category, price, description, image)
       VALUES (?, ?, ?, ?, ?)`,
      [cleanName, cleanCategory, cleanPrice, description || '', cleanImage],
      function (err) {
        if (err) return reject(err);
        resolve(normalizeProductRow({ id: this.lastID, name: cleanName, category: cleanCategory, price: cleanPrice, description: description || '', image: cleanImage }));
      }
    );
  });
}

async function getAllProducts() {
  if (mongoDb) {
    const rows = await mongoDb.collection('products').find({}).sort({ created_at: -1 }).toArray();
    return rows.map((row) => ({
      ...row,
      id: row._id.toString(),
      _id: undefined,
    })).map(normalizeProductRow);
  }

  if (useMysql && mysqlPool) {
    const [rows] = await mysqlPool.query(`SELECT * FROM products ORDER BY created_at DESC`);
    return rows.map((row) => ({
      ...row,
    })).map(normalizeProductRow);
  }

  return new Promise((resolve, reject) => {
    sqliteDb.all(`SELECT * FROM products ORDER BY created_at DESC`, (err, rows) => {
      if (err) return reject(err);
      resolve(rows.map(normalizeProductRow));
    });
  });
}

async function updateProductById(productId, productData) {
  if (!productId) throw new Error('Product ID is required.');
  const existing = (await getAllProducts()).find((p) => String(p.id) === String(productId));
  if (!existing) throw new Error('Product not found.');
  const cleanName = String(productData.name ?? existing.name ?? '').trim();
  const cleanCategory = normalizeProductCategory(productData.category ?? existing.category, { ...existing, ...productData });
  const cleanImage = String(productData.image ?? existing.image ?? '').trim();
  const cleanPrice = Number(String(productData.price ?? existing.price ?? '').replace(/NPR|Rs\.?|,|\s/gi, ''));
  const cleanDescription = String(productData.description ?? existing.description ?? '').trim();
  if (!cleanName || !cleanCategory || !Number.isFinite(cleanPrice) || cleanPrice <= 0 || !cleanImage) {
    throw new Error('Product name, category, a valid price greater than 0, and image are required.');
  }
  if (mongoDb) {
    const r = await mongoDb.collection('products').updateOne({ _id: new ObjectId(productId) }, { $set: { name: cleanName, category: cleanCategory, price: cleanPrice, description: cleanDescription, image: cleanImage } });
    if (r.matchedCount === 0) throw new Error('Product not found.');
    return normalizeProductRow({ ...existing, id: String(productId), name: cleanName, category: cleanCategory, price: cleanPrice, description: cleanDescription, image: cleanImage });
  }
  if (useMysql && mysqlPool) {
    const [r] = await mysqlPool.execute(`UPDATE products SET name=?, category=?, price=?, description=?, image=? WHERE id=?`, [cleanName, cleanCategory, cleanPrice, cleanDescription, cleanImage, productId]);
    if (r.affectedRows === 0) throw new Error('Product not found.');
    return normalizeProductRow({ id: String(productId), name: cleanName, category: cleanCategory, price: cleanPrice, description: cleanDescription, image: cleanImage });
  }
  return new Promise((resolve, reject) => {
    sqliteDb.run(`UPDATE products SET name=?, category=?, price=?, description=?, image=? WHERE id=?`, [cleanName, cleanCategory, cleanPrice, cleanDescription, cleanImage, productId], function (err) {
      if (err) return reject(err);
      if (this.changes === 0) return reject(new Error('Product not found.'));
      resolve(normalizeProductRow({ id: String(productId), name: cleanName, category: cleanCategory, price: cleanPrice, description: cleanDescription, image: cleanImage }));
    });
  });
}

async function deleteProductById(productId) {
  if (!productId) {
    throw new Error('Product ID is required.');
  }

  if (mongoDb) {
    const result = await mongoDb.collection('products').deleteOne({ _id: new ObjectId(productId) });
    if (result.deletedCount === 0) {
      throw new Error('Product not found.');
    }
    return { success: true };
  }

  if (useMysql && mysqlPool) {
    const [result] = await mysqlPool.execute(`DELETE FROM products WHERE id = ?`, [productId]);
    if (result.affectedRows === 0) {
      throw new Error('Product not found.');
    }
    return { success: true };
  }

  return new Promise((resolve, reject) => {
    sqliteDb.run(`DELETE FROM products WHERE id = ?`, [productId], function (err) {
      if (err) return reject(err);
      if (this.changes === 0) {
        return reject(new Error('Product not found.'));
      }
      resolve({ success: true });
    });
  });
}

function parseMoneyValue(v) {
  if (v === null || v === undefined || v === '') return NaN;
  if (typeof v === 'number') return Number.isFinite(v) ? v : NaN;
  const cleaned = String(v).replace(/NPR|Rs\.?|,|\s/gi, '').trim();
  if (!cleaned) return NaN;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : NaN;
}
function requireValidUnitPrice(v, label) {
  const n = parseMoneyValue(v);
  if (!Number.isFinite(n) || n <= 0) throw new Error(`${label || 'Product'} has no valid price. Please contact support before ordering.`);
  return normalizeMoney(n);
}
function computeOrderTotals(items, _ignoredDelivery, _ignoredDiscount) {
  // Delivery/discount removed from checkout pricing: total = subtotal only. Server recalculates; client values ignored.
  const subtotal = normalizeMoney(items.reduce((s, i) => s + (Number(i.price) * Number(i.quantity)), 0));
  const deliveryCharge = 0;
  const discount = 0;
  const total = normalizeMoney(Math.max(0, subtotal));
  return { subtotal, deliveryCharge, discount, total, itemCount: items.reduce((s, i) => s + Number(i.quantity), 0) };
}

function ledgerRevenueAmount(status, total) {
  return isOrderCountedForRevenue(status) ? normalizeMoney(total) : 0;
}
function ledgerRecordFromOrder(order, activeDeleted=false) {
  const o = normalizeOrder(order) || order || {};
  const total = normalizeMoney(o.total);
  const status = String(o.status || 'pending');
  return {
    source_order_id: String(o.id ?? ''),
    idempotency_key: o.idempotency_key || o.client_order_id || null,
    order_snapshot: JSON.stringify(o),
    items: JSON.stringify(Array.isArray(o.items) ? o.items : []),
    subtotal: normalizeMoney(o.subtotal ?? o.totals?.subtotal ?? total),
    delivery_charge: 0,
    discount: normalizeMoney(o.discount ?? o.totals?.discount ?? 0),
    total,
    revenue_amount: ledgerRevenueAmount(status, total),
    status,
    payment_status: String(o.payment_status || o.paymentStatus || 'Pending'),
    payment_method: String(o.payment_method || o.paymentMethod || ''),
    customer_name: String(o.customer_name || o.customer?.name || ''),
    phone: String(o.phone || o.customer?.phone || ''),
    email: String(o.email || o.customer?.email || ''),
    address: String(o.delivery_address || o.address || o.customer?.address || ''),
    placed_at: o.created_at || o.placed_at || new Date().toISOString(),
    active_deleted: activeDeleted ? 1 : 0,
    active_deleted_at: activeDeleted ? new Date().toISOString() : null,
  };
}
async function upsertFinancialLedger(order, opts={}) {
  const rec = ledgerRecordFromOrder(order, !!opts.activeDeleted);
  if (!rec.source_order_id) return null;
  const now = new Date().toISOString();
  try {
    if (mongoDb) {
      const col = mongoDb.collection('order_financial_ledger');
      await col.updateOne(
        { source_order_id: rec.source_order_id },
        { $set: { ...rec, updated_at: new Date() }, $setOnInsert: { recorded_at: new Date() } },
        { upsert: true }
      );
      return rec;
    }
    if (useMysql && mysqlPool) {
      await mysqlPool.execute(`INSERT INTO order_financial_ledger
        (source_order_id,idempotency_key,order_snapshot,items,subtotal,delivery_charge,discount,total,revenue_amount,status,payment_status,payment_method,customer_name,phone,email,address,placed_at,active_deleted,active_deleted_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        ON DUPLICATE KEY UPDATE
          idempotency_key=VALUES(idempotency_key),order_snapshot=VALUES(order_snapshot),items=VALUES(items),subtotal=VALUES(subtotal),delivery_charge=VALUES(delivery_charge),discount=VALUES(discount),total=VALUES(total),
          revenue_amount=VALUES(revenue_amount),status=VALUES(status),payment_status=VALUES(payment_status),payment_method=VALUES(payment_method),customer_name=VALUES(customer_name),phone=VALUES(phone),email=VALUES(email),address=VALUES(address),placed_at=VALUES(placed_at),
          active_deleted=GREATEST(active_deleted, VALUES(active_deleted)), active_deleted_at=COALESCE(active_deleted_at, VALUES(active_deleted_at)), updated_at=CURRENT_TIMESTAMP`,
        [rec.source_order_id,rec.idempotency_key,rec.order_snapshot,rec.items,rec.subtotal,rec.delivery_charge,rec.discount,rec.total,rec.revenue_amount,rec.status,rec.payment_status,rec.payment_method,rec.customer_name,rec.phone,rec.email,rec.address,rec.placed_at,rec.active_deleted,rec.active_deleted_at]
      );
      return rec;
    }
    await new Promise((resolve,reject)=>{
      sqliteDb.run(`INSERT INTO order_financial_ledger
        (source_order_id,idempotency_key,order_snapshot,items,subtotal,delivery_charge,discount,total,revenue_amount,status,payment_status,payment_method,customer_name,phone,email,address,placed_at,active_deleted,active_deleted_at,recorded_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        ON CONFLICT(source_order_id) DO UPDATE SET
          idempotency_key=COALESCE(excluded.idempotency_key,order_financial_ledger.idempotency_key),
          order_snapshot=excluded.order_snapshot,items=excluded.items,subtotal=excluded.subtotal,delivery_charge=excluded.delivery_charge,discount=excluded.discount,total=excluded.total,
          revenue_amount=excluded.revenue_amount,status=excluded.status,payment_status=excluded.payment_status,payment_method=excluded.payment_method,customer_name=excluded.customer_name,phone=excluded.phone,email=excluded.email,address=excluded.address,placed_at=excluded.placed_at,
          active_deleted=MAX(order_financial_ledger.active_deleted,excluded.active_deleted),active_deleted_at=COALESCE(order_financial_ledger.active_deleted_at,excluded.active_deleted_at),updated_at=excluded.updated_at`,
        [rec.source_order_id,rec.idempotency_key,rec.order_snapshot,rec.items,rec.subtotal,rec.delivery_charge,rec.discount,rec.total,rec.revenue_amount,rec.status,rec.payment_status,rec.payment_method,rec.customer_name,rec.phone,rec.email,rec.address,rec.placed_at,rec.active_deleted,rec.active_deleted_at,now,now],
        (err)=> err?reject(err):resolve());
    });
    return rec;
  } catch (err) { console.error('Ledger upsert error:', err.message); return null; }
}
async function markLedgerActiveDeleted(sourceOrderId) {
  const id = String(sourceOrderId||''); if (!id) return;
  const now = new Date().toISOString();
  try {
    if (mongoDb) return mongoDb.collection('order_financial_ledger').updateOne({source_order_id:id},{$set:{active_deleted:1,active_deleted_at:new Date(),updated_at:new Date()}});
    if (useMysql && mysqlPool) return mysqlPool.execute('UPDATE order_financial_ledger SET active_deleted=1, active_deleted_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE source_order_id=?',[id]);
    return new Promise((resolve,reject)=>sqliteDb.run('UPDATE order_financial_ledger SET active_deleted=1, active_deleted_at=?, updated_at=? WHERE source_order_id=?',[now,now,id],(err)=>err?reject(err):resolve()));
  } catch(e){ console.error('Ledger active_deleted mark error:', e.message); }
}
let ledgerBackfilled = false;
async function backfillFinancialLedgerFromOrders() {
  if (ledgerBackfilled) return;
  try {
    const orders = await getAllOrdersRaw();
    for (const o of orders) await upsertFinancialLedger(o, {activeDeleted:false});
    ledgerBackfilled = true;
  } catch(e){ console.error('Ledger backfill error:', e.message); }
}
async function getFinancialLedgerRows() {
  await backfillFinancialLedgerFromOrders();
  let rows;
  if (mongoDb) rows = await mongoDb.collection('order_financial_ledger').find({}).sort({placed_at:-1}).toArray();
  else if (useMysql && mysqlPool) { const [r]=await mysqlPool.query('SELECT * FROM order_financial_ledger ORDER BY placed_at DESC'); rows=r; }
  else rows = await new Promise((resolve,reject)=>sqliteDb.all('SELECT * FROM order_financial_ledger ORDER BY placed_at DESC',(err,r)=>err?reject(err):resolve(r||[])));
  if ((!rows || !rows.length)) { // repair: ensure existing active orders are represented (safe upserts, deduped)
    try { const active = await getAllOrdersRaw(); for (const o of active||[]) await upsertFinancialLedger(o,{activeDeleted:false}); } catch(e){}
    if (mongoDb) rows = await mongoDb.collection('order_financial_ledger').find({}).sort({placed_at:-1}).toArray();
    else if (useMysql && mysqlPool) { const [r]=await mysqlPool.query('SELECT * FROM order_financial_ledger ORDER BY placed_at DESC'); rows=r; }
    else rows = await new Promise((resolve,reject)=>sqliteDb.all('SELECT * FROM order_financial_ledger ORDER BY placed_at DESC',(err,r)=>err?reject(err):resolve(r||[])));
  }
  return rows || [];
}

function isOrderCountedForRevenue(status) {
  const s = String(status || 'pending').trim().toLowerCase();
  // Revenue rule (intentional): count all orders except cancelled/rejected/failed. Pending orders are included in counts and revenue.
  return !['cancelled', 'canceled', 'rejected', 'failed', 'refunded'].includes(s);
}

async function findOrderByIdempotencyKey(key) {
  if (!key) return null;
  try {
    if (mongoDb) { const row = await mongoDb.collection('orders').findOne({ idempotency_key: key }); return row ? normalizeOrder({ ...row, id: row._id.toString(), _id: undefined }) : null; }
    if (useMysql && mysqlPool) { const [rows] = await mysqlPool.execute(`SELECT * FROM orders WHERE idempotency_key = ? LIMIT 1`, [key]); return rows && rows[0] ? normalizeOrder(rows[0]) : null; }
    return await new Promise((resolve, reject) => sqliteDb.get(`SELECT * FROM orders WHERE idempotency_key = ? LIMIT 1`, [key], (err, row) => err ? reject(err) : resolve(row ? normalizeOrder(row) : null)));
  } catch { return null; }
}

async function buildTrustedOrder(orderData) {
  const customerName = String(orderData.customerName || orderData.customer?.name || '').trim();
  const phone = String(orderData.phone || orderData.customer?.phone || '').trim();
  const email = String(orderData.email || orderData.customer?.email || '').trim();
  const address = String(orderData.deliveryAddress || orderData.address || orderData.customer?.address || '').trim();
  const note = String(orderData.note || '').trim();
  const paymentMethod = String(orderData.paymentMethod || 'Cash on Delivery').trim() || 'Cash on Delivery';
  const paymentStatus = String(orderData.paymentStatus || 'Pending').trim() || 'Pending';
  const requestedItems = Array.isArray(orderData.items) ? orderData.items : [];
  if (!customerName || !phone) throw new Error('Customer name and phone are required.');
  if (!address) throw new Error('Delivery address is required.');
  if (!requestedItems.length) throw new Error('At least one selected product is required.');

  const products = await getAllProducts();
  const byId = new Map(products.map((p) => [String(p.id), p]));
  const snapshots = [];
  for (const item of requestedItems) {
    const pid = String(item.productId ?? item.id ?? item.product_id ?? '').trim();
    const qtyRaw = parseMoneyValue(item.quantity);
    const quantity = Math.max(1, Math.floor(Number.isFinite(qtyRaw) ? qtyRaw : 1));
    if (!pid) throw new Error('Each ordered item must include a valid product.');
    const product = byId.get(pid);
    if (!product) throw new Error(`Product unavailable: ${item.name || pid}. Please review your cart.`);
    const price = requireValidUnitPrice(product.price, product.name || 'Product');
    const lineTotal = normalizeMoney(price * quantity);
    snapshots.push({ productId: pid, name: String(product.name || item.name || 'Product'), image: String(product.image || ''), price, quantity, lineTotal });
  }
  const totals = computeOrderTotals(snapshots, 0, 0);
  const status = String(orderData.status || 'pending').trim() || 'pending';
  const customer = orderData.customer || { name: customerName, phone, email, address };
  return {
    customerName, phone, email, address, deliveryAddress: address, note,
    items: snapshots, subtotal: totals.subtotal, deliveryCharge: 0, discount: 0, total: totals.total,
    paymentMethod, paymentStatus, status, customer, totals,
    idempotencyKey: String(orderData.idempotencyKey || orderData.clientOrderId || '').trim(),
  };
}


// ===== Persistent Dashboard Statistics (independent of Orders collection) =====
function statsTodayKey(d=new Date()){
  // Use server local time (app timezone); consistent across endpoints
  const y=d.getFullYear(), m=String(d.getMonth()+1).padStart(2,'0'), day=String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${day}`;
}
function statsWeekStartKey(d=new Date()){ const x=new Date(d.getFullYear(),d.getMonth(),d.getDate()); x.setDate(x.getDate()-6); return statsTodayKey(x); }
function statsMonthKey(d=new Date()){ return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`; }
function orderStatsKey(order){ const o=order||{}; return String(o.id ?? o._id ?? o.idempotency_key ?? o.idempotencyKey ?? ''); }

async function getDashboardStatsRow(){
  if(mongoDb){
    const doc = await mongoDb.collection('dashboard_statistics').findOne({_id:'main'});
    if(doc) return doc;
    const init={_id:'main',generation:1,total_orders:0,total_revenue:0,today_orders:0,today_revenue:0,week_orders:0,week_revenue:0,month_orders:0,month_revenue:0,updated_at:new Date()};
    await mongoDb.collection('dashboard_statistics').updateOne({_id:'main'},{$setOnInsert:init},{upsert:true});
    return init;
  }
  if(useMysql && mysqlPool){
    const [rows]=await mysqlPool.execute('SELECT * FROM dashboard_statistics WHERE id=1 LIMIT 1');
    if(rows && rows[0]) return rows[0];
    await mysqlPool.execute('INSERT IGNORE INTO dashboard_statistics (id,generation) VALUES (1,1)');
    const [r2]=await mysqlPool.execute('SELECT * FROM dashboard_statistics WHERE id=1 LIMIT 1'); return r2[0]||{id:1,generation:1};
  }
  return await new Promise((resolve,reject)=>sqliteDb.get('SELECT * FROM dashboard_statistics WHERE id=1',(err,row)=>{
    if(err) return reject(err); if(row) return resolve(row);
    sqliteDb.run('INSERT OR IGNORE INTO dashboard_statistics (id,generation) VALUES (1,1)',()=>sqliteDb.get('SELECT * FROM dashboard_statistics WHERE id=1',(e2,r2)=>e2?reject(e2):resolve(r2||{id:1,generation:1})));
  }));
}
async function rollDashboardStatsPeriods(){
  const now=new Date(); const t=statsTodayKey(now), w=statsWeekStartKey(now), m=statsMonthKey(now);
  const row=await getDashboardStatsRow();
  const sets={}; let changed=false;
  if(row.today_date !== t){ sets.today_date=t; sets.today_orders=0; sets.today_revenue=0; changed=true; }
  if(row.week_start !== w){ sets.week_start=w; sets.week_orders=0; sets.week_revenue=0; changed=true; }
  if(row.month_key !== m){ sets.month_key=m; sets.month_orders=0; sets.month_revenue=0; changed=true; }
  if(!changed) return row;
  sets.updated_at = mongoDb ? new Date() : now.toISOString();
  if(mongoDb){ await mongoDb.collection('dashboard_statistics').updateOne({_id:'main'},{$set:sets}); return {...row,...sets}; }
  if(useMysql && mysqlPool){
    const fields=Object.keys(sets); const vals=Object.values(sets);
    await mysqlPool.execute(`UPDATE dashboard_statistics SET ${fields.map(f=>f+'=?').join(',')} WHERE id=1`, vals);
    return {...row,...sets};
  }
  await new Promise((resolve,reject)=>{ const f=Object.keys(sets); sqliteDb.run(`UPDATE dashboard_statistics SET ${f.map(k=>k+'=?').join(',')} WHERE id=1`, [...f.map(k=>sets[k])], err=>err?reject(err):resolve()); });
  return {...row,...sets};
}
async function recordAcceptedOrderInDashboardStats(order, previousStatus){
  // Count ONLY when order transitions to accepted and this acceptance event has not been recorded.
  // Pending placement never calls this. Idempotent by unique order_key (Mongo _id / order id).
  const prev = String(previousStatus || '').trim().toLowerCase();
  const next = String(order?.status || '').trim().toLowerCase();
  if (next !== 'accepted') return { counted:false, reason:'not_accepted' };
  // Only genuine transition to accepted (or repair of missing record? no - requirement says verify if acceptance event already recorded; duplicate accept must not count again)
  // We allow first-time recording if not yet counted, even if prev unknown, but block if already counted.
  const key = orderStatsKey(order);
  if(!key) return {counted:false,reason:'no_key'};
  const total = normalizeMoney(order?.total ?? order?.totals?.total ?? 0);
  const now=new Date(); const t=statsTodayKey(now);
  const statRow = await rollDashboardStatsPeriods();
  const gen = Number(statRow.generation||1);
  try {
    if(mongoDb){
      try { await mongoDb.collection('dashboard_stats_counted').insertOne({order_key:key,generation:gen,counted_at:new Date(),event:'accepted'}); }
      catch(e){ if(e && e.code===11000) return {counted:false,reason:'duplicate'}; throw e; }
      const inc = { total_orders:1, total_revenue:total, today_orders:1, today_revenue:total, week_orders:1, week_revenue:total, month_orders:1, month_revenue:total };
      await mongoDb.collection('dashboard_statistics').updateOne({_id:'main'},{$inc:inc,$set:{updated_at:new Date(),today_date:t}});
      await mongoDb.collection('dashboard_daily_stats').updateOne({stat_date:t,generation:gen},{$inc:{orders:1,revenue:total},$setOnInsert:{stat_date:t,generation:gen}},{upsert:true});
      return {counted:true};
    }
    if(useMysql && mysqlPool){
      const conn = await mysqlPool.getConnection();
      try{
        await conn.beginTransaction();
        try { await conn.execute('ALTER TABLE dashboard_stats_counted ADD COLUMN event VARCHAR(50)'); } catch {}
      const [ins]=await conn.execute('INSERT IGNORE INTO dashboard_stats_counted (order_key,generation,event) VALUES (?,?,?)',[key,gen,'accepted']);
        if(!ins.affectedRows){ await conn.rollback(); conn.release(); return {counted:false,reason:'duplicate'}; }
        await conn.execute(`UPDATE dashboard_statistics SET total_orders=total_orders+1,total_revenue=total_revenue+?,today_orders=today_orders+1,today_revenue=today_revenue+?,week_orders=week_orders+1,week_revenue=week_revenue+?,month_orders=month_orders+1,month_revenue=month_revenue+?,today_date=?,updated_at=CURRENT_TIMESTAMP WHERE id=1`,[total,total,total,total,t]);
        await conn.execute(`INSERT INTO dashboard_daily_stats (stat_date,generation,orders,revenue) VALUES (?,?,1,?) ON DUPLICATE KEY UPDATE orders=orders+1,revenue=revenue+VALUES(revenue)`,[t,gen,total]);
        await conn.commit();
      }catch(e){ try{await conn.rollback();}catch{} throw e; } finally{ conn.release(); }
      return {counted:true};
    }
    return await new Promise((resolve,reject)=>{
      sqliteDb.serialize(()=>{
        sqliteDb.run('BEGIN IMMEDIATE');
        sqliteDb.run('INSERT OR IGNORE INTO dashboard_stats_counted (order_key,generation,counted_at,event) VALUES (?,?,CURRENT_TIMESTAMP,?)',[key,gen,'accepted'], function(err){
          if(err){ sqliteDb.run('ROLLBACK'); return reject(err); }
          if(!this.changes){ sqliteDb.run('ROLLBACK'); return resolve({counted:false,reason:'duplicate'}); }
          sqliteDb.run(`UPDATE dashboard_statistics SET total_orders=total_orders+1,total_revenue=total_revenue+?,today_orders=today_orders+1,today_revenue=today_revenue+?,week_orders=week_orders+1,week_revenue=week_revenue+?,month_orders=month_orders+1,month_revenue=month_revenue+?,today_date=?,updated_at=CURRENT_TIMESTAMP WHERE id=1`,[total,total,total,total,t], (e2)=>{
            if(e2){ sqliteDb.run('ROLLBACK'); return reject(e2); }
            const dailySql1 = `INSERT INTO dashboard_daily_stats (stat_date,generation,orders,revenue) VALUES (?,?,1,?) ON CONFLICT(stat_date,generation) DO UPDATE SET orders=orders+1,revenue=revenue+excluded.revenue`;
            const dailySql2 = `INSERT INTO dashboard_daily_stats (stat_date,generation,orders,revenue) VALUES (?,?,1,?) ON CONFLICT(stat_date) DO UPDATE SET orders=orders+1,revenue=revenue+excluded.revenue, generation=excluded.generation`;
            const tryDaily = (sql,next)=>sqliteDb.run(sql,[t,gen,total],(e3)=>{ if(e3 && /ON CONFLICT|PRIMARY KEY|UNIQUE/i.test(e3.message||'') && next) return next(); if(e3){sqliteDb.run('ROLLBACK');return reject(e3);} sqliteDb.run('COMMIT',(e4)=>e4?reject(e4):resolve({counted:true})); });
            tryDaily(dailySql1, ()=>tryDaily(dailySql2,null));
          });
        });
      });
    });
  } catch(e){ console.error('Dashboard stats acceptance record error', e.message); return {counted:false,error:e.message}; }
}
// Backward-compatible name if referenced elsewhere
async function recordOrderInDashboardStats(order){ return {counted:false,reason:'deprecated_pending_not_counted'}; }
async function getPersistentDashboardSummary(){
  // Source of truth = dashboard_statistics store. NEVER queries Orders for counts/revenue.
  const row = await rollDashboardStatsPeriods();
  return {
    total_orders: Number(row.total_orders||0),
    total_revenue: normalizeMoney(row.total_revenue),
    total_sales: normalizeMoney(row.total_revenue), // kept for compatibility
    today_orders: Number(row.today_orders||0),
    today_revenue: normalizeMoney(row.today_revenue),
    week_orders: Number(row.week_orders||0),
    week_revenue: normalizeMoney(row.week_revenue),
    month_orders: Number(row.month_orders||0),
    month_revenue: normalizeMoney(row.month_revenue),
    completed_orders: 0, pending_orders: 0, cancelled_rejected_orders: 0,
    revenue_rule: 'Dashboard overview statistics are stored permanently and independently. Deleting orders does not change them. Manual reset only via Clear Statistics (admin).',
    generation: Number(row.generation||1),
  };
}
async function resetDashboardStatistics(adminUser){
  // Manual admin reset only. Does NOT touch orders/products/customers/revenue ledger records except stats store.
  const now=new Date(); const t=statsTodayKey(now), w=statsWeekStartKey(now), m=statsMonthKey(now);
  if(mongoDb){
    const cur=await getDashboardStatsRow(); const nextGen=Number(cur.generation||1)+1;
    await mongoDb.collection('dashboard_statistics').updateOne({_id:'main'},{$set:{generation:nextGen,total_orders:0,total_revenue:0,today_orders:0,today_revenue:0,week_orders:0,week_revenue:0,month_orders:0,month_revenue:0,today_date:t,week_start:w,month_key:m,updated_at:new Date()}},{upsert:true});
    await mongoDb.collection('dashboard_stats_counted').updateMany({},{$set:{generation:nextGen,reset:true}}); // invalidate old idempotency for pre-reset? better keep but new gen means old shouldn't apply; counted records tied to old gen ignored by insert conflict? we use unique order_key — so same order can't be counted again anyway (good). Just audit.
    await mongoDb.collection('dashboard_stats_audit').insertOne({action:'reset',admin_user:String(adminUser||'admin'),at_time:new Date(),details:'Overview statistics reset to zero'});
    return nextGen;
  }
  if(useMysql && mysqlPool){
    const conn=await mysqlPool.getConnection();
    try{ await conn.beginTransaction();
      await conn.execute('UPDATE dashboard_statistics SET generation=generation+1,total_orders=0,total_revenue=0,today_orders=0,today_revenue=0,week_orders=0,week_revenue=0,month_orders=0,month_revenue=0,today_date=?,week_start=?,month_key=?,updated_at=CURRENT_TIMESTAMP WHERE id=1',[t,w,m]);
      await conn.execute('INSERT INTO dashboard_stats_audit (action,admin_user,details) VALUES (?,?,?)',['reset',String(adminUser||'admin'),'Overview statistics reset to zero']);
      await conn.commit();
    }catch(e){ try{await conn.rollback();}catch{} throw e; } finally{ conn.release(); }
    const r=await getDashboardStatsRow(); return Number(r.generation||1);
  }
  return await new Promise((resolve,reject)=>{
    sqliteDb.serialize(()=>{
      sqliteDb.run('BEGIN IMMEDIATE');
      sqliteDb.run('UPDATE dashboard_statistics SET generation=generation+1,total_orders=0,total_revenue=0,today_orders=0,today_revenue=0,week_orders=0,week_revenue=0,month_orders=0,month_revenue=0,today_date=?,week_start=?,month_key=?,updated_at=CURRENT_TIMESTAMP WHERE id=1',[t,w,m],(err)=>{
        if(err){ sqliteDb.run('ROLLBACK'); return reject(err); }
        sqliteDb.run('INSERT INTO dashboard_stats_audit (action,admin_user,at_time,details) VALUES (?,?,CURRENT_TIMESTAMP,?)',['reset',String(adminUser||'admin'),'Overview statistics reset to zero'],(e2)=>{
          if(e2){ sqliteDb.run('ROLLBACK'); return reject(e2); }
          sqliteDb.get('SELECT generation FROM dashboard_statistics WHERE id=1',(e3,row)=>{ if(e3){ sqliteDb.run('ROLLBACK'); return reject(e3);} sqliteDb.run('COMMIT',(e4)=>e4?reject(e4):resolve(Number(row?.generation||1))); });
        });
      });
    });
  });
}
// ===== end persistent stats =====

async function insertOrder(orderData) {
  const o = (orderData && orderData._trusted === true) ? orderData : await buildTrustedOrder(orderData);
  if (o.idempotencyKey) { const existing = await findOrderByIdempotencyKey(o.idempotencyKey); if (existing) return { insertId: existing.id, order: existing, duplicate: true }; }
  const now = new Date(); const createdAtIso = now.toISOString();
  const payload = {
    customer_name: o.customerName, phone: o.phone, email: o.email || '', address: o.deliveryAddress || o.address || '', delivery_address: o.deliveryAddress || o.address || '',
    note: o.note || '', items: o.items, subtotal: normalizeMoney(o.subtotal), delivery_charge: 0, // delivery charge removed; column retained for compatibility
    discount: 0, total: normalizeMoney(o.total),
    payment_method: o.paymentMethod || 'Cash on Delivery', payment_status: o.paymentStatus || 'Pending', status: o.status || 'pending',
    customer: o.customer || { name: o.customerName, phone: o.phone, email: o.email || '', address: o.deliveryAddress || '' },
    totals: o.totals || { subtotal: o.subtotal, deliveryCharge: 0, discount: 0, total: o.total },
    idempotency_key: o.idempotencyKey || null,
  };

  if (mongoDb) {
    try {
      const result = await mongoDb.collection('orders').insertOne({ ...payload, created_at: now });
      const order = normalizeOrder({ ...payload, id: result.insertedId.toString(), created_at: now });
      await upsertFinancialLedger(order);
      return { insertId: order.id, order };
    } catch (err) { if (err && err.code === 11000 && o.idempotencyKey) { const existing = await findOrderByIdempotencyKey(o.idempotencyKey); if (existing) return { insertId: existing.id, order: existing, duplicate: true }; } throw err; }
  }
  if (useMysql && mysqlPool) {
    try {
      const [result] = await mysqlPool.execute(`INSERT INTO orders (customer_name, phone, email, address, delivery_address, note, items, subtotal, delivery_charge, discount, total, payment_method, payment_status, status, customer, totals, idempotency_key) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [payload.customer_name, payload.phone, payload.email, payload.address, payload.delivery_address, payload.note, JSON.stringify(payload.items), payload.subtotal, payload.delivery_charge, payload.discount, payload.total, payload.payment_method, payload.payment_status, payload.status, JSON.stringify(payload.customer), JSON.stringify(payload.totals), payload.idempotency_key]);
      const order = normalizeOrder({ ...payload, id: result.insertId, created_at: createdAtIso });
      await upsertFinancialLedger(order);
      return { insertId: String(order.id), order };
    } catch (err) { if (err && (err.code === 'ER_DUP_ENTRY' || err.errno === 1062) && o.idempotencyKey) { const existing = await findOrderByIdempotencyKey(o.idempotencyKey); if (existing) return { insertId: existing.id, order: existing, duplicate: true }; } throw err; }
  }
  return new Promise((resolve, reject) => {
    sqliteDb.run(`INSERT INTO orders (customer_name, phone, email, address, delivery_address, note, items, subtotal, delivery_charge, discount, total, payment_method, payment_status, status, customer, totals, idempotency_key) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [payload.customer_name, payload.phone, payload.email, payload.address, payload.delivery_address, payload.note, JSON.stringify(payload.items), payload.subtotal, payload.delivery_charge, payload.discount, payload.total, payload.payment_method, payload.payment_status, payload.status, JSON.stringify(payload.customer), JSON.stringify(payload.totals), payload.idempotency_key],
      async function (err) {
        if (err) { if (String(err.message || '').includes('UNIQUE') && o.idempotencyKey) { try { const existing = await findOrderByIdempotencyKey(o.idempotencyKey); if (existing) return resolve({ insertId: existing.id, order: existing, duplicate: true }); } catch {} } return reject(err); }
        const order = normalizeOrder({ ...payload, id: this.lastID, created_at: createdAtIso });
        try { await upsertFinancialLedger(order); } catch(e){ console.error('Ledger insert error',e.message); }
        resolve({ insertId: String(order.id), order });
      });
  });
}

async function getAllOrdersRaw() {
  if (mongoDb) {
    const rows = await mongoDb.collection('orders').find({}).sort({ created_at: -1 }).toArray();
    return rows.map((row) => normalizeOrder({ ...row, id: row._id.toString(), _id: undefined }));
  }

  if (useMysql && mysqlPool) {
    const [rows] = await mysqlPool.query(`SELECT * FROM orders ORDER BY created_at DESC`);
    return rows.map((row) => normalizeOrder(row));
  }

  return new Promise((resolve, reject) => {
    sqliteDb.all(`SELECT * FROM orders ORDER BY created_at DESC`, (err, rows) => {
      if (err) return reject(err);
      resolve(rows.map((row) => ({ ...row, items: parseOrderItems(row.items) })));
    });
  });
}

async function getAllOrders() { return getAllOrdersRaw(); }

async function getDashboardSummary() {
  const orders = await getAllOrdersRaw(); // active management list only
  let stats = { total_orders:0,total_revenue:0,total_sales:0,today_orders:0,today_revenue:0,week_orders:0,week_revenue:0,month_orders:0,month_revenue:0 };
  try { stats = await getPersistentDashboardSummary(); } catch(e){ console.error('Persistent dashboard stats error', e.message); }
  return {
    ...stats,
    // Permanent overview stats come from dashboard_statistics store (independent). Never recalculated from Orders/ledger.
    completed_orders: Number(stats.completed_orders||0),
    pending_orders: Number(stats.pending_orders||0),
    cancelled_rejected_orders: Number(stats.cancelled_rejected_orders||0),
    revenue_rule: 'Dashboard overview statistics are stored permanently and independently. New orders increment stored stats (idempotent). Deleting active orders never decreases them. Reset only via explicit admin Clear Statistics.',
    db_path: mongoDb ? maskMongoUri(MONGODB_URI) : (useMysql && mysqlPool ? (MYSQL_CONFIG.database || 'MySQL database') : DB_PATH),
    db_connected: mongoDb ? true : (useMysql && mysqlPool ? true : fs.existsSync(DB_PATH)),
    db_type: mongoDb ? 'MongoDB Atlas' : (useMysql && mysqlPool ? 'MySQL' : 'SQLite'),
    orders, // active management list (pending/accepted/rejected workflow)
  };
}

async function clearOrders() {
  // Clears active order management records only. Financial ledger/history is NEVER deleted.
  try { const all = await getAllOrdersRaw(); for (const o of all) await upsertFinancialLedger(o,{activeDeleted:true}); } catch(e){ console.error('Ledger preserve before clear error',e.message); }
  if (mongoDb) { await mongoDb.collection('orders').deleteMany({}); return; }
  if (useMysql && mysqlPool) { await mysqlPool.execute(`DELETE FROM orders`); return; }
  return new Promise((resolve, reject) => { sqliteDb.run(`DELETE FROM orders`, (err) => err?reject(err):resolve()); });
}

const dbType = initializeDatabase();

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

app.use(session({
  secret: SESSION_SECRET || 'insecure-local-dev-only-set-SESSION_SECRET',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 1000 * 60 * 60 * 8,
  },
}));

app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    message: 'Mahashree Namkeen API is running.',
    database: databaseMode,
  });
});

app.post('/api/admin/login', (req, res) => {
  const { password } = req.body || {};

  if (password === ADMIN_PASSWORD) {
    req.session.admin = true;
    return res.json({ success: true, message: 'Login successful.' });
  }

  return res.status(401).json({ success: false, message: 'Invalid admin password.' });
});

app.post('/api/admin/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({ success: true, message: 'Logged out.' });
  });
});

app.get('/api/admin/session', (req, res) => {
  res.json({ authenticated: !!req.session.admin });
});

function requireAdmin(req, res, next) {
  if (!req.session || !req.session.admin) {
    return res.status(401).json({ success: false, message: 'Admin access required.' });
  }
  return next();
}

app.get('/api/products', async (req, res) => {
  try {
    const products = await getAllProducts();
    return res.json({ success: true, products });
  } catch (error) {
    console.error('Product fetch error:', error.message);
    return res.status(500).json({ success: false, message: 'Unable to load products.' });
  }
});

app.post('/api/admin/dashboard/refresh-stats', requireAdmin, async (req, res) => {
  try {
    // Explicit admin-only reset of stored dashboard overview statistics. NEVER deletes orders/products/customers/auth/ledger business records.
    const generation = await resetDashboardStatistics(req.session?.admin ? 'admin' : 'admin');
    const dashboard = await getDashboardSummary();
    return res.json({ success: true, message: 'Dashboard statistics cleared. No business records were deleted.', generation, dashboard });
  } catch (error) {
    console.error('Dashboard stats reset error:', error.message);
    return res.status(500).json({ success: false, message: 'Unable to clear dashboard statistics.' });
  }
});

app.get('/api/admin/dashboard', requireAdmin, async (req, res) => {
  try {
    const dashboard = await getDashboardSummary();
    const products = await getAllProducts();
    return res.json({ success: true, dashboard, products, orders: dashboard.orders || [] });
  } catch (error) {
    console.error('Dashboard summary error:', error.message);
    return res.status(500).json({ success: false, message: 'Unable to load admin dashboard.' });
  }
});

app.patch('/api/admin/products/:id', requireAdmin, async (req, res) => {
  try {
    const product = await updateProductById(req.params.id, req.body || {});
    return res.json({ success: true, message: 'Product updated successfully.', product });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message || 'Unable to update product.' });
  }
});

app.post('/api/admin/products', requireAdmin, async (req, res) => {
  try {
    const product = await insertProduct(req.body || {});
    return res.status(201).json({ success: true, message: 'Product added successfully.', product });
  } catch (error) {
    console.error('Product insert error:', error.message);
    return res.status(400).json({ success: false, message: error.message || 'Unable to add product.' });
  }
});

app.delete('/api/admin/products/:id', requireAdmin, async (req, res) => {
  try {
    await deleteProductById(req.params.id);
    return res.json({ success: true, message: 'Product deleted successfully.' });
  } catch (error) {
    console.error('Product delete error:', error.message);
    return res.status(400).json({ success: false, message: error.message || 'Unable to delete product.' });
  }
});

app.post('/api/admin/orders/reset', requireAdmin, async (req, res) => {
  try {
    await clearOrders();
    return res.json({ success: true, message: 'All orders were deleted successfully.' });
  } catch (error) {
    console.error('Reset orders error:', error.message);
    return res.status(500).json({ success: false, message: 'Unable to clear orders.' });
  }
});

app.get('/api/orders/status', async (req, res) => {
  try {
    const ids = String(req.query.ids || '').split(',').map((x) => x.trim()).filter(Boolean).slice(0, 20);
    const phone = String(req.query.phone || '').trim();
    if (!ids.length || !phone) return res.status(400).json({ success: false, message: 'Order IDs and phone are required.' });
    const orders = await getAllOrders();
    const matched = orders.filter((o) => ids.includes(String(o.id)) && String(o.phone || '') === phone)
      .map((o) => ({ id: String(o.id), status: o.status || 'pending', payment_status: o.payment_status || 'Pending', total: o.total, created_at: o.created_at, items: o.items, totals: o.totals || null, payment_method: o.payment_method || null, delivery_address: o.delivery_address || o.address || '' }));
    return res.json({ success: true, orders: matched });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Unable to load order status.' });
  }
});

app.post('/api/orders', async (req, res) => {
  const body = req.body || {};
  const customerName = String(body.customerName || body.customer?.name || '').trim();
  const phone = String(body.phone || body.customer?.phone || '').trim();
  const address = String(body.deliveryAddress || body.address || body.customer?.address || '').trim();
  const items = Array.isArray(body.items) ? body.items : [];
  if (!customerName || !phone || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ success: false, message: 'Customer name, phone, and at least one selected product are required.' });
  }
  if (!address) return res.status(400).json({ success: false, message: 'Delivery address is required.' });
  try {
    const result = await insertOrder(body);
    return res.status(result.duplicate ? 200 : 201).json({ success: true, duplicate: !!result.duplicate, message: result.duplicate ? 'Order already received.' : 'Order placed successfully.', orderId: result.insertId, order: result.order || null });
  } catch (error) {
    console.error('Order insert error:', error.message);
    const status = /required|unavailable|no valid price|review your cart/i.test(error.message || '') ? 400 : 500;
    return res.status(status).json({ success: false, message: status === 400 ? error.message : 'Unable to save order.', url: req.originalUrl, method: req.method });
  }
});

app.get('/api/orders', requireAdmin, async (req, res) => {
  try {
    const orders = await getAllOrders();
    return res.json({ success: true, orders });
  } catch (error) {
    console.error('Order fetch error:', error.message);
    return res.status(500).json({ success: false, message: 'Unable to load orders.' });
  }
});

app.get('/api/categories', async (req, res) => {
  try {
    const products = await getAllProducts();
    const counts = new Map();
    let uncategorized = 0;
    products.forEach((p) => { if (p.category === 'uncategorized') uncategorized++; else counts.set(p.category, (counts.get(p.category) || 0) + 1); });
    const categories = PRODUCT_CATEGORIES.map((c) => ({ ...c, count: c.slug === 'all-products' ? products.length : (counts.get(c.slug) || 0), system: c.slug === 'all-products' }));
    if (uncategorized > 0) categories.push({ slug: 'uncategorized', label: 'Uncategorized', icon: '📦', count: uncategorized, system: true });
    return res.json({ success: true, categories, totalProducts: products.length });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Unable to load categories.' });
  }
});


async function updateOrderStatusById(orderId, status) {
  const allowed = new Set(['pending','preparing','confirmed','accepted','dispatched','delivered','completed','cancelled','rejected','failed','refunded']);
  const cleanStatus = String(status || '').trim().toLowerCase();
  if (!allowed.has(cleanStatus)) throw new Error('Invalid order status.');
  const existing = await findOrderById(String(orderId));
  if (!existing) throw new Error('Order not found.');
  const previousStatus = String(existing.status || 'pending').trim().toLowerCase();
  // Atomic-ish guard for acceptance transition recording uses dashboard_stats_counted uniqueness; status update remains idempotent.
  let ok=false;
  if (mongoDb) {
    const _id = new ObjectId(String(orderId));
    const r = await mongoDb.collection('orders').updateOne({ _id }, { $set: { status: cleanStatus } });
    if (!r.matchedCount) throw new Error('Order not found.'); ok=true;
  } else if (useMysql && mysqlPool) {
    const [r] = await mysqlPool.execute(`UPDATE orders SET status = ? WHERE id = ?`, [cleanStatus, orderId]);
    if (!r.affectedRows) throw new Error('Order not found.'); ok=true;
  } else {
    ok = await new Promise((resolve, reject) => {
      sqliteDb.run(`UPDATE orders SET status = ? WHERE id = ?`, [cleanStatus, orderId], function (err) {
        if (err) return reject(err);
        if (!this.changes) return reject(new Error('Order not found.'));
        resolve(true);
      });
    });
  }
  const row = await findOrderById(String(orderId));
  let statsRecorded = { counted:false };
  try {
    if (row && cleanStatus === 'accepted') {
      statsRecorded = await recordAcceptedOrderInDashboardStats(row, previousStatus);
    }
  } catch(e){ console.error('Acceptance stats record error',e.message); statsRecorded = { counted:false, error:e.message }; }
  try { if (row) await upsertFinancialLedger(row); } catch(e){ console.error('Ledger status sync error',e.message); }
  return { success: true, id: String(orderId), status: cleanStatus, previousStatus, statsRecorded };
}

async function findOrderById(orderId) {
  const cleanId = String(orderId == null ? '' : orderId).trim();
  if (!cleanId) return null;
  if (mongoDb) {
    try {
      if (!ObjectId.isValid(cleanId)) return null;
      const row = await mongoDb.collection('orders').findOne({ _id: new ObjectId(cleanId) });
      return row ? normalizeOrder({ ...row, id: row._id.toString(), _id: undefined }) : null;
    } catch (e) { console.error('findOrderById mongo error', e.message); return null; }
  }
  if (useMysql && mysqlPool) {
    const [rows] = await mysqlPool.execute('SELECT * FROM orders WHERE id = ? LIMIT 1', [cleanId]);
    return rows && rows[0] ? normalizeOrder(rows[0]) : null;
  }
  return new Promise((resolve, reject) => {
    sqliteDb.get('SELECT * FROM orders WHERE id = ? LIMIT 1', [cleanId], (err, row) => {
      if (err) return reject(err);
      resolve(row ? normalizeOrder(row) : null);
    });
  });
}

async function deleteOrderById(orderId) {
  // Remove from active admin list ONLY. Permanent financial/ledger history is preserved and never deleted here.
  const existing = await findOrderById(orderId);
  if (!existing) throw new Error('Order not found.');
  await upsertFinancialLedger(existing, { activeDeleted: true });
  await markLedgerActiveDeleted(orderId);
  if (mongoDb) {
    const r = await mongoDb.collection('orders').deleteOne({ _id: new ObjectId(String(orderId)) });
    if (!r.deletedCount) throw new Error('Order not found.');
    return { success: true, preserved_in_ledger: true };
  }
  if (useMysql && mysqlPool) {
    const [r] = await mysqlPool.execute(`DELETE FROM orders WHERE id = ?`, [orderId]);
    if (!r.affectedRows) throw new Error('Order not found.');
    return { success: true, preserved_in_ledger: true };
  }
  return new Promise((resolve, reject) => {
    sqliteDb.run(`DELETE FROM orders WHERE id = ?`, [orderId], function (err) {
      if (err) return reject(err);
      if (!this.changes) return reject(new Error('Order not found.'));
      resolve({ success: true, preserved_in_ledger: true });
    });
  });
}

app.patch('/api/admin/orders/:id', requireAdmin, async (req, res) => {
  try {
    const result = await updateOrderStatusById(req.params.id, req.body?.status);
    let dashboard = null; try { dashboard = await getDashboardSummary(); } catch {}
    return res.json({ ...result, dashboard });
  } catch (error) {
    console.error('Admin order update error:', error.message);
    return res.status(400).json({ success: false, message: error.message || 'Unable to update order.', url: req.originalUrl, method: req.method });
  }
});

app.delete('/api/admin/orders/:id', requireAdmin, async (req, res) => {
  try {
    await deleteOrderById(req.params.id);
    return res.json({ success: true, message: 'Order deleted successfully.' });
  } catch (error) {
    console.error('Admin order delete error:', error.message);
    return res.status(400).json({ success: false, message: error.message || 'Unable to delete order.', url: req.originalUrl, method: req.method });
  }
});

app.get('/admin.html', (req, res) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  if (req.session && req.session.admin) return res.sendFile(path.join(__dirname, 'public', 'admin.html'));
  return res.redirect('/admin');
});
app.get('/admin', (req, res) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  if (req.session && req.session.admin) {
    return res.sendFile(path.join(__dirname, 'public', 'admin.html'));
  }

  return res.sendFile(path.join(__dirname, 'public', 'admin-login.html'));
});

function csvEscape(v){ const s=String(v??''); return /[",\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s; }
function orderExportRows(order){
  const o = normalizeOrder(order) || order;
  const items = Array.isArray(o.items)?o.items:[];
  const base = { orderId:o.id, customerName:o.customer_name||o.customer?.name||'', phone:o.phone||'', email:o.email||'', address:o.delivery_address||o.address||'', orderDate:o.created_at||o.placed_at||'', paymentMethod:o.payment_method||'', paymentStatus:o.payment_status||'', status:o.status||'', subtotal:normalizeMoney(o.subtotal??o.total), delivery:0, discount:normalizeMoney(o.discount??0), total:normalizeMoney(o.total), instructions:o.note||'' };
  if(!items.length) return [{...base, productName:'', quantity:'', unitPrice:'', lineTotal:''}];
  return items.map(it=>({ ...base, productName:it.name||'', quantity:it.quantity||0, unitPrice:normalizeMoney(it.price??it.unit_price??0), lineTotal:normalizeMoney(it.lineTotal ?? ((Number(it.price)||0)*(Number(it.quantity)||0))) }));
}
async function getExportOrders({scope,from,to,orderId,statusFilter}){
  let rows = [];
  try { rows = await getFinancialLedgerRows(); rows = rows.map(r=>{ try{ const snap=r.order_snapshot?JSON.parse(r.order_snapshot):null; return normalizeOrder(snap||{...r, created_at:r.placed_at, items: typeof r.items==='string'?JSON.parse(r.items||'[]'):r.items}); }catch{ return normalizeOrder({...r,created_at:r.placed_at,items:[]}); } }); }
  catch(e){ rows = await getAllOrdersRaw(); }
  const now=Date.now(); const today=new Date().toDateString();
  const inRange = (d)=>{ const t=new Date(d||0).getTime(); if(!Number.isFinite(t)) return false; if(from && t < new Date(from+'T00:00:00').getTime()) return false; if(to && t > new Date(to+'T23:59:59.999').getTime()) return false; return true; };
  if(orderId) rows = rows.filter(o=>String(o.id)===String(orderId));
  if(scope==='selected' && orderId) {/* already filtered */}
  else if(scope==='today') rows = rows.filter(o=>new Date(o.created_at||0).toDateString()===today);
  else if(scope==='range') rows = rows.filter(o=>inRange(o.created_at));
  else if(scope==='pending') rows = rows.filter(o=>String(o.status||'pending').toLowerCase()==='pending');
  else if(scope==='accepted') rows = rows.filter(o=>String(o.status||'').toLowerCase()==='accepted');
  else if(scope==='completed') rows = rows.filter(o=>['completed','delivered'].includes(String(o.status||'').toLowerCase()));
  else if(scope==='cancelled_rejected') rows = rows.filter(o=>['cancelled','rejected','failed','refunded'].includes(String(o.status||'').toLowerCase()));
  // dedupe by id preserving latest
  const seen=new Set(); rows = rows.filter(o=>{const k=String(o.id); if(seen.has(k)) return false; seen.add(k); return true;});
  return rows.sort((a,b)=>new Date(b.created_at||0)-new Date(a.created_at||0));
}

app.get('/api/admin/orders/export', requireAdmin, async (req,res)=>{
  try {
    const format = String(req.query.format||'csv').toLowerCase();
    const scope = String(req.query.scope||'all');
    const from = String(req.query.from||''); const to = String(req.query.to||'');
    const orderId = String(req.query.orderId||'').trim();
    const orders = await getExportOrders({scope,from,to,orderId});
    const flat = orders.flatMap(orderExportRows);
    const totalValue = normalizeMoney(orders.reduce((s,o)=>s+normalizeMoney(o.total),0));
    const stamp = new Date().toISOString().slice(0,10);
    if(format==='csv'){
      const cols=['orderId','customerName','phone','email','address','orderDate','productName','quantity','unitPrice','lineTotal','subtotal','delivery','discount','total','paymentMethod','paymentStatus','status','instructions'];
      const head = cols.join(',');
      const body = flat.map(r=>cols.map(c=>csvEscape(r[c])).join(',')).join('\n');
      res.setHeader('Content-Type','text/csv; charset=utf-8');
      res.setHeader('Content-Disposition',`attachment; filename="orders-${scope}-${stamp}.csv"`);
      return res.send('\ufeff'+head+'\n'+body);
    }
    if(format==='xlsx'){
      let ExcelJS; try { ExcelJS = require('exceljs'); } catch(e){ return res.status(500).json({success:false,message:'Excel export dependency (exceljs) not available.'}); }
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('Orders');
      ws.columns = [
        {header:'Order ID',key:'orderId',width:12},{header:'Customer Name',key:'customerName',width:22},{header:'Phone',key:'phone',width:16},{header:'Email',key:'email',width:24},{header:'Address',key:'address',width:28},
        {header:'Order Date',key:'orderDate',width:20},{header:'Product',key:'productName',width:26},{header:'Qty',key:'quantity',width:8},{header:'Unit Price',key:'unitPrice',width:12,numFmt:'"NPR "#,##0.00'},
        {header:'Line Total',key:'lineTotal',width:12,numFmt:'"NPR "#,##0.00'},{header:'Subtotal',key:'subtotal',width:12,numFmt:'"NPR "#,##0.00'},{header:'Delivery',key:'delivery',width:10,numFmt:'"NPR "#,##0.00'},
        {header:'Discount',key:'discount',width:10,numFmt:'"NPR "#,##0.00'},{header:'Grand Total',key:'total',width:12,numFmt:'"NPR "#,##0.00'},{header:'Payment Method',key:'paymentMethod',width:16},
        {header:'Payment Status',key:'paymentStatus',width:14},{header:'Order Status',key:'status',width:14},{header:'Instructions',key:'instructions',width:24}
      ];
      ws.getRow(1).font={bold:true};
      flat.forEach(r=>ws.addRow(r));
      const sum = wb.addWorksheet('Summary');
      sum.addRow(['Mahashree Namkeen - Order Export Summary']); sum.addRow(['Export Date', new Date().toLocaleString()]); sum.addRow(['Scope', scope]); sum.addRow(['Date Range', from&&to?`${from} to ${to}`:from||to||'All']); sum.addRow(['Total Orders', orders.length]); sum.addRow(['Total Order Value', totalValue]);
      sum.getColumn(1).width=24; sum.getColumn(2).width=28; sum.getCell('B6').numFmt='"NPR "#,##0.00';
      res.setHeader('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition',`attachment; filename="orders-${scope}-${stamp}.xlsx"`);
      await wb.xlsx.write(res); return res.end();
    }
    if(format==='pdf'){
      let PDFDocument; try { PDFDocument = require('pdfkit'); } catch(e){ return res.status(500).json({success:false,message:'PDF export dependency (pdfkit) not available.'}); }
      res.setHeader('Content-Type','application/pdf');
      res.setHeader('Content-Disposition',`attachment; filename="orders-${scope}-${stamp}.pdf"`);
      const doc = new PDFDocument({margin:36, size:'A4'});
      doc.pipe(res);
      doc.fontSize(18).text('Mahashree Namkeen', {align:'left'});
      doc.fontSize(12).text('Order Report', {continued:false}); doc.moveDown(0.3);
      doc.fontSize(9).fillColor('#444').text(`Export date: ${new Date().toLocaleString()} | Scope: ${scope}${from||to?` | Range: ${from||'-'} to ${to||'-'}`:''}`);
      doc.text(`Total orders: ${orders.length} | Total order value: NPR ${totalValue.toFixed(2)}`);
      doc.moveDown(0.6); doc.fillColor('#000');
      orders.slice(0,300).forEach((o,idx)=>{
        if(doc.y > 740) { doc.addPage(); }
        doc.fontSize(10).font('Helvetica-Bold').text(`Order #${o.id} — ${o.customer_name||''} (${o.phone||''})  |  NPR ${normalizeMoney(o.total).toFixed(2)}  |  ${o.status||''}`);
        doc.font('Helvetica').fontSize(8).fillColor('#333').text(`Date: ${o.created_at||''} | Payment: ${o.payment_method||''}/${o.payment_status||''} | Address: ${(o.delivery_address||o.address||'').replace(/\n/g,' ')}`);
        (o.items||[]).forEach(it=> doc.text(` • ${it.name||'Item'} x${it.quantity||0} @ NPR ${normalizeMoney(it.price).toFixed(2)} = NPR ${normalizeMoney(it.lineTotal ?? (Number(it.price||0)*Number(it.quantity||0))).toFixed(2)}`));
        doc.moveDown(0.4); doc.fillColor('#000');
      });
      if(orders.length>300) doc.fontSize(8).text(`(Showing first 300 orders of ${orders.length} in PDF; use CSV/XLSX for full export.)`);
      const range = doc.bufferedPageRange(); for(let i=0;i<range.count;i++){ doc.switchToPage(i); doc.fontSize(8).fillColor('#666').text(`Page ${i+1} of ${range.count}`, 36, doc.page.height-24, {align:'right'}); }
      doc.end(); return;
    }
    if(format==='print'){
      const esc=s=>String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;');
      const body=orders.map(o=>`<section style="border:1px solid #ddd;padding:12px;margin:10px 0;border-radius:8px"><h3>Order #${esc(o.id)} — NPR ${normalizeMoney(o.total).toFixed(2)} (${esc(o.status)})</h3><p><b>Customer:</b> ${esc(o.customer_name)} | ${esc(o.phone)} | ${esc(o.email)}<br/><b>Address:</b> ${esc(o.delivery_address||o.address)}<br/><b>Date:</b> ${esc(o.created_at)} | <b>Payment:</b> ${esc(o.payment_method)} / ${esc(o.payment_status)}</p><table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;width:100%"><tr><th>Product</th><th>Qty</th><th>Unit Price</th><th>Line Total</th></tr>${(o.items||[]).map(it=>`<tr><td>${esc(it.name)}</td><td>${it.quantity||0}</td><td>NPR ${normalizeMoney(it.price).toFixed(2)}</td><td>NPR ${normalizeMoney(it.lineTotal??(Number(it.price||0)*Number(it.quantity||0))).toFixed(2)}</td></tr>`).join('')}</table></section>`).join('');
      return res.send(`<!doctype html><html><head><meta charset="utf-8"><title>Mahashree Namkeen Order Report</title></head><body style="font-family:Arial,sans-serif;padding:20px"><h1>Mahashree Namkeen — Order Report</h1><p>Export date: ${esc(new Date().toLocaleString())} | Scope: ${esc(scope)} ${from||to?`| Range: ${esc(from)} to ${esc(to)}`:''}<br/><b>Total orders:</b> ${orders.length} <b>Total value:</b> NPR ${totalValue.toFixed(2)}</p>${body||'<p>No orders matched.</p>'}</body></html>`);
    }
    return res.status(400).json({success:false,message:'Unsupported export format.'});
  } catch(err){ console.error('Export error',err); return res.status(500).json({success:false,message:'Unable to export orders.'}); }
});

app.use((req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ success: false, message: `Endpoint not found: ${req.method} ${req.originalUrl}`, url: req.originalUrl, method: req.method, status: 404 });
  }

  return res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

async function startServer() {
  await dbType;
  app.listen(PORT, () => {
    console.log(`Mahashree Namkeen server running at http://localhost:${PORT}`);
    console.log(`Database mode: ${databaseMode}`);
  });
}


startServer().catch((error) => {
  console.error('Server startup error:', error.message);
  process.exit(1);
});
