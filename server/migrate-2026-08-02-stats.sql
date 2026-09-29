-- Migrasi 2026-08-02 (akses): kolom perangkat & bot pada daily_stats
-- Jalankan: npx wrangler d1 execute salad-yook-db --local --file=server/migrate-2026-08-02-stats.sql

ALTER TABLE daily_stats ADD COLUMN mobile INTEGER NOT NULL DEFAULT 0;
ALTER TABLE daily_stats ADD COLUMN desktop INTEGER NOT NULL DEFAULT 0;
ALTER TABLE daily_stats ADD COLUMN tablet INTEGER NOT NULL DEFAULT 0;
ALTER TABLE daily_stats ADD COLUMN bot INTEGER NOT NULL DEFAULT 0;
