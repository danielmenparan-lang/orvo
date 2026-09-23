require('dotenv').config();
const express = require('express');
const path = require('path');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { initDb } = require('./db');

const app = express();
const db = initDb();
const PORT = process.env.PORT || 4173;
const JWT_SECRET = process.env.JWT_SECRET || 'mono-dev-secret-change-me';
const ROOT = path.join(__dirname, '..');

app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(ROOT, 'public')));

function publicProduct(row, { admin = false } = {}) {
  if (!row) return null;
  const savePct =
    row.compare_at_ils && row.compare_at_ils > row.price_ils
      ? Math.round((1 - row.price_ils / row.compare_at_ils) * 100)
      : 0;
  const base = {
    id: row.id,
    slug: row.slug,
    name_he: row.name_he,
    name_en: row.name_en,
    category: row.category,
    category_he: row.category_he,
    tagline_he: row.tagline_he,
    description_he: row.description_he,
    material_he: row.material_he || '',
    price_ils: row.price_ils,
    compare_at_ils: row.compare_at_ils,
    save_pct: savePct,
    stock: row.stock,
    limited_left: row.limited_left ?? row.stock,
    sold_month: row.sold_month || 0,
    rating: row.rating || 4.8,
    reviews_count: row.reviews_count || 0,
    featured: !!row.featured,
    badge_he: row.badge_he,
    image: row.image,
    accent: row.accent,
    active: !!row.active,
  };
  if (admin) {
    base.cost_usd = row.cost_usd;
    base.margin_pct = row.margin_pct;
    base.aliexpress_url = row.aliexpress_url;
    base.aliexpress_search = row.aliexpress_search;
    base.est_profit_ils = Math.round(row.price_ils - row.cost_usd * 3.3);
  }
  return base;
}

function editionEndsAt() {
  // Psychological urgency: countdown resets every Sunday 23:59 Israel-ish (UTC+3 approx)
  const now = new Date();
  const end = new Date(now);
  const day = end.getUTCDay();
  const add = day === 0 ? 0 : 7 - day;
  end.setUTCDate(end.getUTCDate() + add);
  end.setUTCHours(20, 59, 0, 0); // ~23:59 IDT
  if (end <= now) end.setUTCDate(end.getUTCDate() + 7);
  return end.toISOString();
}

function auth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'unauthorized' });
  try {
    req.admin = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'invalid_token' });
  }
}

function orderNumber() {
  const n = Date.now().toString().slice(-8);
  return `MN-${n}`;
}

function getSetting(key, fallback = null) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : fallback;
}

/* ---------- Storefront API ---------- */

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, store: 'MONO' });
});

app.get('/api/products', (req, res) => {
  const { category, featured, q } = req.query;
  let sql = 'SELECT * FROM products WHERE active = 1';
  const params = [];
  if (category && category !== 'all') {
    sql += ' AND category = ?';
    params.push(category);
  }
  if (featured === '1') sql += ' AND featured = 1';
  if (q) {
    sql += ' AND (name_he LIKE ? OR name_en LIKE ? OR tagline_he LIKE ?)';
    const like = `%${q}%`;
    params.push(like, like, like);
  }
  sql += ' ORDER BY featured DESC, price_ils DESC';
  const rows = db.prepare(sql).all(...params);
  res.json({
    products: rows.map((r) => publicProduct(r)),
    shipping_ils: Number(getSetting('shipping_ils', 39)),
    free_shipping_over: Number(getSetting('free_shipping_over', 590)),
    edition_ends_at: editionEndsAt(),
    social_proof: {
      cities: ['תל אביב', 'הרצליה', 'חיפה', 'ירושלים', 'רעננה', 'גבעתיים'],
      verbs: ['רכש/ה', 'שמר/ה', 'הוסיף/ה לעגלה'],
    },
  });
});

app.get('/api/products/:slug', (req, res) => {
  const row = db
    .prepare('SELECT * FROM products WHERE slug = ? AND active = 1')
    .get(req.params.slug);
  if (!row) return res.status(404).json({ error: 'not_found' });
  res.json({ product: publicProduct(row) });
});

app.post('/api/orders', (req, res) => {
  const {
    customer_name,
    customer_email,
    customer_phone,
    city,
    address,
    notes,
    items,
  } = req.body || {};

  if (!customer_name || !customer_email || !Array.isArray(items) || !items.length) {
    return res.status(400).json({ error: 'missing_fields' });
  }

  const getProduct = db.prepare('SELECT * FROM products WHERE id = ? AND active = 1');
  const lines = [];
  let subtotal = 0;

  for (const item of items) {
    const product = getProduct.get(item.product_id);
    if (!product) return res.status(400).json({ error: 'invalid_product', id: item.product_id });
    const qty = Math.max(1, Math.min(10, Number(item.quantity) || 1));
    if (product.stock < qty) {
      return res.status(400).json({ error: 'out_of_stock', id: product.id });
    }
    const lineTotal = product.price_ils * qty;
    subtotal += lineTotal;
    lines.push({ product, qty, lineTotal });
  }

  const freeOver = Number(getSetting('free_shipping_over', 249));
  const baseShip = Number(getSetting('shipping_ils', 29));
  const shipping = subtotal >= freeOver ? 0 : baseShip;
  const total = subtotal + shipping;
  const id = uuidv4();
  const number = orderNumber();

  const insertOrder = db.prepare(`
    INSERT INTO orders (
      id, order_number, customer_name, customer_email, customer_phone,
      city, address, notes, status, subtotal_ils, shipping_ils, total_ils
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'new', ?, ?, ?)
  `);
  const insertItem = db.prepare(`
    INSERT INTO order_items (
      order_id, product_id, product_name, quantity, unit_price_ils,
      line_total_ils, aliexpress_url, cost_usd
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const decStock = db.prepare('UPDATE products SET stock = stock - ? WHERE id = ?');

  const tx = db.transaction(() => {
    insertOrder.run(
      id,
      number,
      customer_name.trim(),
      customer_email.trim().toLowerCase(),
      (customer_phone || '').trim(),
      (city || '').trim(),
      (address || '').trim(),
      (notes || '').trim(),
      subtotal,
      shipping,
      total
    );
    for (const line of lines) {
      insertItem.run(
        id,
        line.product.id,
        line.product.name_he,
        line.qty,
        line.product.price_ils,
        line.lineTotal,
        line.product.aliexpress_url,
        line.product.cost_usd
      );
      decStock.run(line.qty, line.product.id);
    }
  });

  try {
    tx();
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'order_failed' });
  }

  res.status(201).json({
    order: {
      id,
      order_number: number,
      total_ils: total,
      shipping_ils: shipping,
      subtotal_ils: subtotal,
      status: 'new',
    },
  });
});

/* ---------- Admin API ---------- */

app.post('/api/admin/login', (req, res) => {
  const { email, password } = req.body || {};
  const admin = db.prepare('SELECT * FROM admins WHERE email = ?').get((email || '').toLowerCase());
  if (!admin || !bcrypt.compareSync(password || '', admin.password_hash)) {
    return res.status(401).json({ error: 'bad_credentials' });
  }
  const token = jwt.sign({ id: admin.id, email: admin.email, name: admin.name }, JWT_SECRET, {
    expiresIn: '7d',
  });
  res.json({ token, admin: { email: admin.email, name: admin.name } });
});

app.get('/api/admin/me', auth, (req, res) => {
  res.json({ admin: req.admin });
});

app.get('/api/admin/dashboard', auth, (_req, res) => {
  const products = db.prepare('SELECT COUNT(*) AS c FROM products WHERE active = 1').get().c;
  const orders = db.prepare('SELECT COUNT(*) AS c FROM orders').get().c;
  const revenue = db.prepare("SELECT COALESCE(SUM(total_ils),0) AS s FROM orders WHERE status != 'cancelled'").get().s;
  const newOrders = db.prepare("SELECT COUNT(*) AS c FROM orders WHERE status = 'new'").get().c;
  const lowStock = db.prepare('SELECT COUNT(*) AS c FROM products WHERE stock < 15 AND active = 1').get().c;
  const profitRows = db.prepare(`
    SELECT oi.quantity, oi.unit_price_ils, oi.cost_usd
    FROM order_items oi
    JOIN orders o ON o.id = oi.order_id
    WHERE o.status != 'cancelled'
  `).all();
  const estProfit = profitRows.reduce((sum, r) => {
    return sum + (r.unit_price_ils - Math.round(r.cost_usd * 3.3)) * r.quantity;
  }, 0);

  res.json({
    stats: {
      products,
      orders,
      revenue_ils: revenue,
      new_orders: newOrders,
      low_stock: lowStock,
      est_profit_ils: estProfit,
    },
  });
});

app.get('/api/admin/products', auth, (_req, res) => {
  const rows = db.prepare('SELECT * FROM products ORDER BY featured DESC, name_he').all();
  res.json({ products: rows.map((r) => publicProduct(r, { admin: true })) });
});

app.patch('/api/admin/products/:id', auth, (req, res) => {
  const allowed = [
    'price_ils',
    'compare_at_ils',
    'stock',
    'featured',
    'active',
    'badge_he',
    'tagline_he',
    'description_he',
    'name_he',
    'cost_usd',
    'aliexpress_url',
  ];
  const updates = [];
  const values = [];
  for (const key of allowed) {
    if (req.body[key] !== undefined) {
      updates.push(`${key} = ?`);
      let val = req.body[key];
      if (key === 'featured' || key === 'active') val = val ? 1 : 0;
      values.push(val);
    }
  }
  if (!updates.length) return res.status(400).json({ error: 'nothing_to_update' });
  updates.push("updated_at = datetime('now')");
  values.push(req.params.id);
  const info = db
    .prepare(`UPDATE products SET ${updates.join(', ')} WHERE id = ?`)
    .run(...values);
  if (!info.changes) return res.status(404).json({ error: 'not_found' });
  const row = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  res.json({ product: publicProduct(row, { admin: true }) });
});

app.get('/api/admin/orders', auth, (req, res) => {
  const status = req.query.status;
  let sql = 'SELECT * FROM orders';
  const params = [];
  if (status && status !== 'all') {
    sql += ' WHERE status = ?';
    params.push(status);
  }
  sql += ' ORDER BY created_at DESC LIMIT 200';
  const orders = db.prepare(sql).all(...params);
  const itemsStmt = db.prepare('SELECT * FROM order_items WHERE order_id = ?');
  res.json({
    orders: orders.map((o) => ({
      ...o,
      items: itemsStmt.all(o.id),
    })),
  });
});

app.patch('/api/admin/orders/:id', auth, (req, res) => {
  const { status } = req.body || {};
  const allowed = ['new', 'processing', 'ordered_supplier', 'shipped', 'completed', 'cancelled'];
  if (!allowed.includes(status)) return res.status(400).json({ error: 'bad_status' });
  const info = db
    .prepare("UPDATE orders SET status = ?, updated_at = datetime('now') WHERE id = ?")
    .run(status, req.params.id);
  if (!info.changes) return res.status(404).json({ error: 'not_found' });
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
  const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(req.params.id);
  res.json({ order: { ...order, items } });
});

/* ---------- Pages ---------- */

app.get('/admin', (_req, res) => {
  res.sendFile(path.join(ROOT, 'admin', 'index.html'));
});

app.get('/product/:slug', (_req, res) => {
  res.sendFile(path.join(ROOT, 'public', 'product.html'));
});

app.get('/checkout', (_req, res) => {
  res.sendFile(path.join(ROOT, 'public', 'checkout.html'));
});

app.use((req, res, next) => {
  if (req.path.startsWith('/api')) return next();
  if (req.method !== 'GET' && req.method !== 'HEAD') return next();
  res.sendFile(path.join(ROOT, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`MONO store running at http://localhost:${PORT}`);
  console.log(`Admin: http://localhost:${PORT}/admin`);
});
