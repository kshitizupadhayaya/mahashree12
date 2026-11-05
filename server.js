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
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
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

const DEFAULT_PRODUCTS = [
  {
    name: 'Phurandana & Majedar Mix',
    category: 'best-seller',
    price: 225,
    description: 'Selected chewra, puffed grains, lentils, peanuts, and a rich spice blend.',
    image: 'https://images.unsplash.com/photo-1604908553252-8d5d7f8e34f0?auto=format&fit=crop&w=800&q=80',
  },
  {
    name: 'Majedar Mix',
    category: 'savory',
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
    category: 'savory',
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
    await ordersCollection.createIndex({ created_at: -1 });
    await productsCollection.createIndex({ created_at: -1 });

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
  const cleanCategory = String(category || '').trim();
  const cleanImage = String(image || '').trim();

  if (!cleanName || !cleanCategory || !Number(price) || !cleanImage) {
    throw new Error('Product name, category, price, and image are required.');
  }

  if (mongoDb) {
    const result = await mongoDb.collection('products').insertOne({
      name: cleanName,
      category: cleanCategory,
      price: Number(price),
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
      [cleanName, cleanCategory, Number(price), description || '', cleanImage]
    );
    return { id: result.insertId, name: cleanName, category: cleanCategory, price: Number(price), description: description || '', image: cleanImage };
  }

  return new Promise((resolve, reject) => {
    sqliteDb.run(
      `INSERT INTO products (name, category, price, description, image)
       VALUES (?, ?, ?, ?, ?)`,
      [cleanName, cleanCategory, Number(price), description || '', cleanImage],
      function (err) {
        if (err) return reject(err);
        resolve({
          id: this.lastID,
          name: cleanName,
          category: cleanCategory,
          price: Number(price),
          description: description || '',
          image: cleanImage,
        });
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
      price: Number(row.price || 0),
    }));
  }

  if (useMysql && mysqlPool) {
    const [rows] = await mysqlPool.query(`SELECT * FROM products ORDER BY created_at DESC`);
    return rows.map((row) => ({
      ...row,
      price: Number(row.price || 0),
    }));
  }

  return new Promise((resolve, reject) => {
    sqliteDb.all(`SELECT * FROM products ORDER BY created_at DESC`, (err, rows) => {
      if (err) return reject(err);
      resolve(rows.map((row) => ({
        ...row,
        price: Number(row.price || 0),
      })));
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

async function insertOrder(orderData) {
  const { customerName, phone, email, address, note, items, total } = orderData;

  if (mongoDb) {
    const result = await mongoDb.collection('orders').insertOne({
      customer_name: customerName,
      phone,
      email: email || '',
      address: address || '',
      note: note || '',
      items: Array.isArray(items) ? items : [],
      total: Number(total) || 0,
      created_at: new Date(),
    });

    return { insertId: result.insertedId.toString() };
  }

  if (useMysql && mysqlPool) {
    const [result] = await mysqlPool.execute(
      `INSERT INTO orders (customer_name, phone, email, address, note, items, total)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [customerName, phone, email || '', address || '', note || '', JSON.stringify(items), Number(total) || 0]
    );
    return { insertId: result.insertId };
  }

  return new Promise((resolve, reject) => {
    sqliteDb.run(
      `INSERT INTO orders (customer_name, phone, email, address, note, items, total)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [customerName, phone, email || '', address || '', note || '', JSON.stringify(items), Number(total) || 0],
      function (err) {
        if (err) return reject(err);
        resolve({ insertId: this.lastID });
      }
    );
  });
}

async function getAllOrders() {
  if (mongoDb) {
    const rows = await mongoDb.collection('orders').find({}).sort({ created_at: -1 }).toArray();
    return rows.map((row) => ({
      ...row,
      id: row._id.toString(),
      _id: undefined,
      items: parseOrderItems(row.items),
    }));
  }

  if (useMysql && mysqlPool) {
    const [rows] = await mysqlPool.query(`SELECT * FROM orders ORDER BY created_at DESC`);
    return rows.map((row) => ({ ...row, items: parseOrderItems(row.items) }));
  }

  return new Promise((resolve, reject) => {
    sqliteDb.all(`SELECT * FROM orders ORDER BY created_at DESC`, (err, rows) => {
      if (err) return reject(err);
      resolve(rows.map((row) => ({ ...row, items: parseOrderItems(row.items) })));
    });
  });
}

async function getDashboardSummary() {
  if (mongoDb) {
    const ordersCollection = mongoDb.collection('orders');
    const totals = await ordersCollection.aggregate([
      { $group: { _id: null, total_orders: { $sum: 1 }, total_revenue: { $sum: '$total' } } }
    ]).toArray();
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayOrders = await ordersCollection.countDocuments({ created_at: { $gte: todayStart } });
    const orders = await getAllOrders();

    return {
      total_orders: Number(totals[0]?.total_orders || 0),
      total_revenue: Number(totals[0]?.total_revenue || 0),
      today_orders: Number(todayOrders || 0),
      db_path: maskMongoUri(MONGODB_URI),
      db_connected: true,
      db_type: 'MongoDB Atlas',
      orders,
    };
  }

  if (useMysql && mysqlPool) {
    const [summaryRows] = await mysqlPool.query(`
      SELECT COUNT(*) AS total_orders, COALESCE(SUM(total), 0) AS total_revenue
      FROM orders
    `);
    const [todayRows] = await mysqlPool.query(`
      SELECT COUNT(*) AS today_orders
      FROM orders
      WHERE DATE(created_at) = CURDATE()
    `);

    const orders = await getAllOrders();

    return {
      total_orders: Number(summaryRows[0]?.total_orders || 0),
      total_revenue: Number(summaryRows[0]?.total_revenue || 0),
      today_orders: Number(todayRows[0]?.today_orders || 0),
      db_path: MYSQL_CONFIG.database || 'MySQL database',
      db_connected: true,
      db_type: 'MySQL',
      orders,
    };
  }

  return new Promise((resolve, reject) => {
    sqliteDb.get(`SELECT COUNT(*) AS total_orders, COALESCE(SUM(total), 0) AS total_revenue FROM orders`, (summaryErr, summary) => {
      if (summaryErr) return reject(summaryErr);

      sqliteDb.get(`SELECT COUNT(*) AS today_orders FROM orders WHERE date(created_at) = date('now')`, (todayErr, todayRow) => {
        if (todayErr) return reject(todayErr);

        sqliteDb.all(`SELECT * FROM orders ORDER BY created_at DESC`, (ordersErr, rows) => {
          if (ordersErr) return reject(ordersErr);

          resolve({
            total_orders: Number(summary?.total_orders || 0),
            total_revenue: Number(summary?.total_revenue || 0),
            today_orders: Number(todayRow?.today_orders || 0),
            db_path: DB_PATH,
            db_connected: fs.existsSync(DB_PATH),
            db_type: 'SQLite',
            orders: rows.map((row) => ({ ...row, items: parseOrderItems(row.items) })),
          });
        });
      });
    });
  });
}

async function clearOrders() {
  if (mongoDb) {
    await mongoDb.collection('orders').deleteMany({});
    return;
  }

  if (useMysql && mysqlPool) {
    await mysqlPool.execute(`DELETE FROM orders`);
    return;
  }

  return new Promise((resolve, reject) => {
    sqliteDb.run(`DELETE FROM orders`, (err) => {
      if (err) return reject(err);
      resolve();
    });
  });
}

const dbType = initializeDatabase();

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

app.use(session({
  secret: process.env.SESSION_SECRET || 'maha-spices-secret-key',
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

app.post('/api/orders', async (req, res) => {
  const { customerName, phone, email, address, note, items, total } = req.body || {};

  if (!customerName || !phone || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ success: false, message: 'Customer name, phone, and at least one product are required.' });
  }

  try {
    const result = await insertOrder({ customerName, phone, email, address, note, items, total });
    return res.status(201).json({
      success: true,
      message: 'Order placed successfully.',
      orderId: result.insertId,
    });
  } catch (error) {
    console.error('Order insert error:', error.message);
    return res.status(500).json({ success: false, message: 'Unable to save order.' });
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

app.get('/admin', (req, res) => {
  if (req.session && req.session.admin) {
    return res.sendFile(path.join(__dirname, 'public', 'admin.html'));
  }

  return res.sendFile(path.join(__dirname, 'public', 'admin-login.html'));
});

app.use((req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ success: false, message: 'Endpoint not found.' });
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
