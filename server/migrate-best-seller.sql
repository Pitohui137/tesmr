-- Migrasi: kolom penanda Best Seller pada tabel menu
-- Jalankan (lokal):  npx wrangler d1 execute mepetrumah-db --local --file=server/migrate-best-seller.sql
-- Jalankan (remote): npx wrangler d1 execute mepetrumah-db --remote --file=server/migrate-best-seller.sql
-- Hanya dijalankan SEKALI pada database yang sudah ada (database baru sudah memakai schema.sql terbaru).

ALTER TABLE menu ADD COLUMN is_best_seller INTEGER NOT NULL DEFAULT 0;
