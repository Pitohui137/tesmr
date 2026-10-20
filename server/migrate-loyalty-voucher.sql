-- Migrasi: voucher loyalitas berdasarkan nomor HP pelanggan
-- Jalankan (lokal):  npx wrangler d1 execute mepetrumah-db --local --file=server/migrate-loyalty-voucher.sql
-- Jalankan (remote): npx wrangler d1 execute mepetrumah-db --remote --file=server/migrate-loyalty-voucher.sql
-- Jalankan SEKALI pada database yang sudah ada, SEBELUM deploy kode baru
-- (database baru sudah memakai schema.sql terbaru).
-- Jika muncul "duplicate column name: ...", artinya sudah pernah dijalankan (aman diabaikan).

ALTER TABLE settings ADD COLUMN loyalty_enabled INTEGER NOT NULL DEFAULT 1;
ALTER TABLE settings ADD COLUMN loyalty_every INTEGER NOT NULL DEFAULT 5;
ALTER TABLE settings ADD COLUMN loyalty_percent INTEGER NOT NULL DEFAULT 10;
ALTER TABLE settings ADD COLUMN loyalty_max_discount INTEGER NOT NULL DEFAULT 25000;

ALTER TABLE orders ADD COLUMN customer_phone TEXT NOT NULL DEFAULT '';
ALTER TABLE orders ADD COLUMN discount_amount INTEGER NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN voucher_id TEXT;
ALTER TABLE orders ADD COLUMN voucher_percent INTEGER NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN voucher_max INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_orders_phone ON orders (customer_phone);

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
