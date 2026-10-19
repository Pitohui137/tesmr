-- Migrasi: pengaturan Best Seller otomatis (berdasarkan penjualan 30 hari terakhir)
-- Jalankan (lokal):  npx wrangler d1 execute mepetrumah-db --local --file=server/migrate-auto-bestseller.sql
-- Jalankan (remote): npx wrangler d1 execute mepetrumah-db --remote --file=server/migrate-auto-bestseller.sql
-- Jalankan SEKALI pada database yang sudah ada, SEBELUM deploy kode baru.
-- Jika muncul "duplicate column name: best_seller_auto", artinya sudah pernah dijalankan (aman diabaikan).

ALTER TABLE settings ADD COLUMN best_seller_auto INTEGER NOT NULL DEFAULT 0;
