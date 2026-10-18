-- Migrasi: estimasi waktu penyiapan (mencatat kapan pesanan mulai diproses)
-- Jalankan (lokal):  npx wrangler d1 execute mepetrumah-db --local --file=server/migrate-estimate.sql
-- Jalankan (remote): npx wrangler d1 execute mepetrumah-db --remote --file=server/migrate-estimate.sql
-- Jalankan SEKALI pada database yang sudah ada, SEBELUM deploy kode baru.
-- Jika muncul "duplicate column name: processed_at", artinya sudah pernah dijalankan (aman diabaikan).

ALTER TABLE orders ADD COLUMN processed_at TEXT;
