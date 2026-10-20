-- Migrasi: stok harian per menu (NULL = tidak terbatas)
-- Jalankan (lokal):  npx wrangler d1 execute mepetrumah-db --local --file=server/migrate-daily-stock.sql
-- Jalankan (remote): npx wrangler d1 execute mepetrumah-db --remote --file=server/migrate-daily-stock.sql
-- Jalankan SEKALI pada database yang sudah ada, SEBELUM deploy kode baru.
-- Jika muncul "duplicate column name: daily_stock", artinya sudah pernah dijalankan (aman diabaikan).

ALTER TABLE menu ADD COLUMN daily_stock INTEGER;
