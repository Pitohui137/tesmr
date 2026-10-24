-- Migrasi: stok darurat khusus hari ini (hangus otomatis saat pergantian hari)
-- Jalankan (lokal):  npx wrangler d1 execute mepetrumah-db --local --file=server/migrate-stock-bonus.sql
-- Jalankan (remote): npx wrangler d1 execute mepetrumah-db --remote --file=server/migrate-stock-bonus.sql
-- Jalankan SEKALI pada database yang sudah ada, SEBELUM deploy kode baru.
-- Jika berhenti dengan "duplicate column name: ...", hapus baris ALTER yang sudah pernah dijalankan
-- (mis. stock_bonus dan stock_bonus_date) lalu jalankan ulang sisanya.

ALTER TABLE menu ADD COLUMN stock_bonus INTEGER NOT NULL DEFAULT 0;
ALTER TABLE menu ADD COLUMN stock_bonus_date TEXT;
ALTER TABLE menu ADD COLUMN stock_bonus_base INTEGER NOT NULL DEFAULT 0;
