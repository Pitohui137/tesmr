-- Skema database D1 untuk Mepet-Rumah
-- Jalankan: wrangler d1 execute mepetrumah-db --local --file=server/schema.sql (lokal)
--           wrangler d1 execute mepetrumah-db --file=server/schema.sql (remote)

CREATE TABLE IF NOT EXISTS settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  name TEXT NOT NULL DEFAULT 'Mepet-Rumah',
  address TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  qris_merchant_name TEXT NOT NULL DEFAULT '',
  qris_code_text TEXT NOT NULL DEFAULT '',
  qris_image_url TEXT NOT NULL DEFAULT '',
  best_seller_auto INTEGER NOT NULL DEFAULT 0,
  loyalty_enabled INTEGER NOT NULL DEFAULT 1,
  loyalty_every INTEGER NOT NULL DEFAULT 5,
  loyalty_percent INTEGER NOT NULL DEFAULT 10,
  loyalty_max_discount INTEGER NOT NULL DEFAULT 25000
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
  is_best_seller INTEGER NOT NULL DEFAULT 0,
  daily_stock INTEGER,
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
  has_payment_proof INTEGER NOT NULL DEFAULT 0,
  processed_at TEXT,
  archived_at TEXT,
  created_at TEXT NOT NULL,
  customer_phone TEXT NOT NULL DEFAULT '',
  discount_amount INTEGER NOT NULL DEFAULT 0,
  voucher_id TEXT,
  voucher_percent INTEGER NOT NULL DEFAULT 0,
  voucher_max INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_orders_phone ON orders (customer_phone);

-- Voucher diskon per nomor HP (didapat tiap N pesanan selesai, otomatis terpasang di pesanan berikutnya)
CREATE TABLE IF NOT EXISTS vouchers (
  id TEXT PRIMARY KEY,
  phone TEXT NOT NULL,
  percent INTEGER NOT NULL,
  max_discount INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'aktif',
  source_order_id TEXT NOT NULL UNIQUE,
  used_order_id TEXT,
  created_at TEXT NOT NULL,
  used_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_vouchers_phone ON vouchers (phone, status);

-- Bukti bayar QRIS (screenshot, data URL). Dipisah dari tabel orders agar
-- daftar pesanan yang di-poll kasir tetap ringan.
CREATE TABLE IF NOT EXISTS order_proofs (
  order_id TEXT PRIMARY KEY,
  image TEXT NOT NULL,
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
