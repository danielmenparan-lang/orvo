const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');

const DB_PATH = path.join(__dirname, '..', 'data', 'mono.db');
const PRODUCTS_PATH = path.join(__dirname, '..', 'data', 'products.json');

function initDb() {
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      slug TEXT UNIQUE NOT NULL,
      name_he TEXT NOT NULL,
      name_en TEXT NOT NULL,
      category TEXT NOT NULL,
      category_he TEXT NOT NULL,
      tagline_he TEXT,
      description_he TEXT,
      material_he TEXT,
      cost_usd REAL NOT NULL,
      price_ils INTEGER NOT NULL,
      compare_at_ils INTEGER,
      margin_pct INTEGER,
      stock INTEGER NOT NULL DEFAULT 0,
      limited_left INTEGER,
      sold_month INTEGER DEFAULT 0,
      rating REAL DEFAULT 4.8,
      reviews_count INTEGER DEFAULT 0,
      featured INTEGER NOT NULL DEFAULT 0,
      badge_he TEXT,
      aliexpress_url TEXT NOT NULL,
      aliexpress_search TEXT,
      image TEXT,
      accent TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      order_number TEXT UNIQUE NOT NULL,
      customer_name TEXT NOT NULL,
      customer_email TEXT NOT NULL,
      customer_phone TEXT,
      city TEXT,
      address TEXT,
      notes TEXT,
      status TEXT NOT NULL DEFAULT 'new',
      subtotal_ils INTEGER NOT NULL,
      shipping_ils INTEGER NOT NULL DEFAULT 0,
      total_ils INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      product_id TEXT NOT NULL,
      product_name TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      unit_price_ils INTEGER NOT NULL,
      line_total_ils INTEGER NOT NULL,
      aliexpress_url TEXT,
      cost_usd REAL
    );

    CREATE TABLE IF NOT EXISTS admins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  // migrate older DBs
  const cols = db.prepare('PRAGMA table_info(products)').all().map((c) => c.name);
  const add = (name, type) => {
    if (!cols.includes(name)) db.exec(`ALTER TABLE products ADD COLUMN ${name} ${type}`);
  };
  add('material_he', 'TEXT');
  add('limited_left', 'INTEGER');
  add('sold_month', 'INTEGER DEFAULT 0');
  add('rating', 'REAL DEFAULT 4.8');
  add('reviews_count', 'INTEGER DEFAULT 0');

  seedProducts(db);
  seedAdmin(db);
  seedSettings(db);
  return db;
}

function seedProducts(db) {
  const products = JSON.parse(fs.readFileSync(PRODUCTS_PATH, 'utf8'));
  // deactivate old catalog items not in new file
  const ids = products.map((p) => p.id);
  db.prepare('UPDATE products SET active = 0').run();
  const upsert = db.prepare(`
    INSERT INTO products (
      id, slug, name_he, name_en, category, category_he, tagline_he, description_he, material_he,
      cost_usd, price_ils, compare_at_ils, margin_pct, stock, limited_left, sold_month, rating, reviews_count,
      featured, badge_he, aliexpress_url, aliexpress_search, image, accent, active
    ) VALUES (
      @id, @slug, @name_he, @name_en, @category, @category_he, @tagline_he, @description_he, @material_he,
      @cost_usd, @price_ils, @compare_at_ils, @margin_pct, @stock, @limited_left, @sold_month, @rating, @reviews_count,
      @featured, @badge_he, @aliexpress_url, @aliexpress_search, @image, @accent, 1
    )
    ON CONFLICT(id) DO UPDATE SET
      slug=excluded.slug,
      name_he=excluded.name_he,
      name_en=excluded.name_en,
      category=excluded.category,
      category_he=excluded.category_he,
      tagline_he=excluded.tagline_he,
      description_he=excluded.description_he,
      material_he=excluded.material_he,
      cost_usd=excluded.cost_usd,
      price_ils=excluded.price_ils,
      compare_at_ils=excluded.compare_at_ils,
      margin_pct=excluded.margin_pct,
      stock=excluded.stock,
      limited_left=excluded.limited_left,
      sold_month=excluded.sold_month,
      rating=excluded.rating,
      reviews_count=excluded.reviews_count,
      featured=excluded.featured,
      badge_he=excluded.badge_he,
      aliexpress_url=excluded.aliexpress_url,
      aliexpress_search=excluded.aliexpress_search,
      image=excluded.image,
      accent=excluded.accent,
      active=1,
      updated_at=datetime('now')
  `);

  const tx = db.transaction((rows) => {
    for (const p of rows) {
      upsert.run({
        ...p,
        featured: p.featured ? 1 : 0,
        material_he: p.material_he || '',
        limited_left: p.limited_left ?? p.stock,
        sold_month: p.sold_month || 0,
        rating: p.rating || 4.8,
        reviews_count: p.reviews_count || 0,
      });
    }
  });
  tx(products);
  console.log(`[mono] seeded ${products.length} luxury products (inactive others: kept)`);
  return ids;
}

function seedAdmin(db) {
  const existing = db.prepare('SELECT id FROM admins LIMIT 1').get();
  if (existing) return;
  const hash = bcrypt.hashSync('monoadmin123', 10);
  db.prepare(
    'INSERT INTO admins (email, password_hash, name) VALUES (?, ?, ?)'
  ).run('admin@mono.store', hash, 'MONO Admin');
  console.log('[mono] admin: admin@mono.store / monoadmin123');
}

function seedSettings(db) {
  const defaults = {
    store_name: 'MONO',
    shipping_ils: '39',
    free_shipping_over: '590',
    currency: 'ILS',
    contact_email: 'hello@mono.store',
    edition_ends_at: '',
  };
  const stmt = db.prepare(
    'INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)'
  );
  for (const [k, v] of Object.entries(defaults)) stmt.run(k, v);
  // refresh shipping thresholds for luxury
  db.prepare("UPDATE settings SET value = '39' WHERE key = 'shipping_ils'").run();
  db.prepare("UPDATE settings SET value = '590' WHERE key = 'free_shipping_over'").run();
}

module.exports = { initDb, DB_PATH };
