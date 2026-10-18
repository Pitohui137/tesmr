-- Migrasi: fitur upload bukti bayar QRIS
-- Jalankan (lokal):  npx wrangler d1 execute mepetrumah-db --local --file=server/migrate-payment-proof.sql
-- Jalankan (remote): npx wrangler d1 execute mepetrumah-db --remote --file=server/migrate-payment-proof.sql
-- Jalankan SEKALI pada database yang sudah ada (database baru sudah memakai schema.sql terbaru).
-- Jika muncul "duplicate column name: has_payment_proof", artinya sudah pernah dijalankan (aman diabaikan).

ALTER TABLE orders ADD COLUMN has_payment_proof INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS order_proofs (
  order_id TEXT PRIMARY KEY,
  image TEXT NOT NULL,
  created_at TEXT NOT NULL
);
