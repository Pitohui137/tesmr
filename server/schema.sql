-- Skema database D1 untuk Salad Yook
-- Jalankan: wrangler d1 execute salad-yook-db --local --file=server/schema.sql (lokal)
--           wrangler d1 execute salad-yook-db --file=server/schema.sql (remote)

CREATE TABLE IF NOT EXISTS settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  name TEXT NOT NULL DEFAULT 'Salad Yook',
  address TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  qris_merchant_name TEXT NOT NULL DEFAULT '',
  qris_code_text TEXT NOT NULL DEFAULT '',
  qris_image_url TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  email TEXT NOT NULL DEFAULT '',
  password TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS menu (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  price REAL NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  image_url TEXT NOT NULL DEFAULT '',
  is_available INTEGER NOT NULL DEFAULT 1,
  variants TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  customer_name TEXT NOT NULL,
  table_number TEXT NOT NULL,
  items TEXT NOT NULL,
  total_price REAL NOT NULL,
  payment_method TEXT NOT NULL,
  status TEXT NOT NULL,
  additional_amount INTEGER NOT NULL DEFAULT 0,
  archived_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS daily_stats (
  date TEXT PRIMARY KEY,
  requests INTEGER NOT NULL DEFAULT 0,
  unique_ips TEXT NOT NULL DEFAULT '[]',
  orders INTEGER NOT NULL DEFAULT 0,
  mobile INTEGER NOT NULL DEFAULT 0,
  desktop INTEGER NOT NULL DEFAULT 0,
  tablet INTEGER NOT NULL DEFAULT 0,
  bot INTEGER NOT NULL DEFAULT 0,
  devices TEXT NOT NULL DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS app_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  level TEXT NOT NULL,
  message TEXT NOT NULL,
  meta TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);
