-- Migrasi 2026-08-02: status siap_diantar -> siap_diambil + kolom additional_amount
-- Jalankan: npx wrangler d1 execute salad-yook-db --local --file=server/migrate-2026-08-02.sql

ALTER TABLE orders ADD COLUMN additional_amount INTEGER NOT NULL DEFAULT 0;
UPDATE orders SET status = 'siap_diambil' WHERE status = 'siap_diantar';
