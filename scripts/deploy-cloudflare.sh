#!/usr/bin/env bash
# Deploy Salad Yook ke Cloudflare Workers + D1.
#   - Membuat D1 jika belum ada + mengisi database_id di wrangler.toml
#   - Menjalankan schema + migrasi ke D1 REMOTE (aman untuk DB lama & baru)
#   - Memasang JWT_SECRET acak (kalau belum ada) via wrangler secret put
#   - Build + wrangler deploy
# Pemakaian: bash scripts/deploy-cloudflare.sh
set -euo pipefail

DB_NAME="salad-yook-db"
TOML="wrangler.toml"

echo "=== 1/6 Cek login wrangler ==="
if ! npx wrangler whoami 2>/dev/null | grep -qi "logged in"; then
  echo "Belum login. Jalankan: npx wrangler login"
  exit 1
fi

echo "=== 2/6 Build frontend + server ==="
npm run build

echo "=== 3/6 Pastikan D1 '${DB_NAME}' ada ==="
DB_ID=""
if npx wrangler d1 list --json 2>/dev/null | python3 -c "import sys,json; json.load(sys.stdin)" >/dev/null 2>&1; then
  DB_ID=$(npx wrangler d1 list --json 2>/dev/null | python3 -c "
import sys, json
try:
    dbs = json.load(sys.stdin)
    name = '$DB_NAME'
    for d in dbs:
        if d.get('name') == name:
            print(d.get('uuid') or d.get('database_id') or '')
            break
except Exception:
    pass
")
fi
if [ -z "$DB_ID" ]; then
  echo "  Membuat D1 baru..."
  OUT=$(npx wrangler d1 create "$DB_NAME")
  DB_ID=$(echo "$OUT" | sed -n 's/.*database_id = "\([^"]*\)".*/\1/p' | head -1)
fi
if [ -z "$DB_ID" ]; then
  echo "GAGAL mendapatkan database_id D1. Cek output wrangler d1 create."
  exit 1
fi
echo "  database_id = $DB_ID"

echo "=== 4/6 Set database_id di ${TOML} ==="
sed -i '' "s/^database_id = .*/database_id = \"${DB_ID}\"/" "$TOML"

echo "=== 5/6 Schema + migrasi ke D1 REMOTE ==="
npx wrangler d1 execute "$DB_NAME" --remote --file=server/schema.sql
HAS_COL=$(npx wrangler d1 execute "$DB_NAME" --remote --json --command "SELECT COUNT(*) AS n FROM pragma_table_info('orders') WHERE name='additional_amount';" 2>/dev/null \
  | python3 -c "import sys,json; print(json.load(sys.stdin)[0]['results'][0]['n'])" 2>/dev/null || echo "1")
if [ "$HAS_COL" = "0" ]; then
  echo "  Menambahkan kolom additional_amount..."
  npx wrangler d1 execute "$DB_NAME" --remote --command "ALTER TABLE orders ADD COLUMN additional_amount INTEGER NOT NULL DEFAULT 0;"
fi
npx wrangler d1 execute "$DB_NAME" --remote --command "UPDATE orders SET status='siap_diambil' WHERE status='siap_diantar';"

# Kolom orders.archived_at (soft-reset / arsip pesanan) - tambah jika belum ada
HAS_COL=$(npx wrangler d1 execute "$DB_NAME" --remote --json --command "SELECT COUNT(*) AS n FROM pragma_table_info('orders') WHERE name='archived_at';" 2>/dev/null \
  | python3 -c "import sys,json; print(json.load(sys.stdin)[0]['results'][0]['n'])" 2>/dev/null || echo "1")
if [ "$HAS_COL" = "0" ]; then
  echo "  Menambahkan kolom orders.archived_at..."
  npx wrangler d1 execute "$DB_NAME" --remote --command "ALTER TABLE orders ADD COLUMN archived_at TEXT;"
fi

# Tabel monthly_totals (cadangan rekap bulanan saat reset --hard) - buat jika belum ada
npx wrangler d1 execute "$DB_NAME" --remote --command "CREATE TABLE IF NOT EXISTS monthly_totals (month TEXT PRIMARY KEY, revenue REAL NOT NULL DEFAULT 0, order_count INTEGER NOT NULL DEFAULT 0, qris_revenue REAL NOT NULL DEFAULT 0, cash_revenue REAL NOT NULL DEFAULT 0);" >/dev/null 2>&1 || true

# Kolom menu.variants (varian harga Ice/Hot) - tambah jika belum ada
HAS_COL=$(npx wrangler d1 execute "$DB_NAME" --remote --json --command "SELECT COUNT(*) AS n FROM pragma_table_info('menu') WHERE name='variants';" 2>/dev/null \
  | python3 -c "import sys,json; print(json.load(sys.stdin)[0]['results'][0]['n'])" 2>/dev/null || echo "1")
if [ "$HAS_COL" = "0" ]; then
  echo "  Menambahkan kolom menu.variants..."
  npx wrangler d1 execute "$DB_NAME" --remote --command "ALTER TABLE menu ADD COLUMN variants TEXT NOT NULL DEFAULT '';"
fi

# Kolom statistik akses (mobile/desktop/tablet/bot) - tambah jika belum ada
for COL in mobile desktop tablet bot; do
  HAS_COL=$(npx wrangler d1 execute "$DB_NAME" --remote --json --command "SELECT COUNT(*) AS n FROM pragma_table_info('daily_stats') WHERE name='$COL';" 2>/dev/null \
    | python3 -c "import sys,json; print(json.load(sys.stdin)[0]['results'][0]['n'])" 2>/dev/null || echo "1")
  if [ "$HAS_COL" = "0" ]; then
    echo "  Menambahkan kolom daily_stats.$COL..."
    npx wrangler d1 execute "$DB_NAME" --remote --command "ALTER TABLE daily_stats ADD COLUMN $COL INTEGER NOT NULL DEFAULT 0;"
  fi
done

# Kolom daily_stats.devices (label perangkat per IP) - tambah jika belum ada
HAS_COL=$(npx wrangler d1 execute "$DB_NAME" --remote --json --command "SELECT COUNT(*) AS n FROM pragma_table_info('daily_stats') WHERE name='devices';" 2>/dev/null \
  | python3 -c "import sys,json; print(json.load(sys.stdin)[0]['results'][0]['n'])" 2>/dev/null || echo "1")
if [ "$HAS_COL" = "0" ]; then
  echo "  Menambahkan kolom daily_stats.devices..."
  npx wrangler d1 execute "$DB_NAME" --remote --command "ALTER TABLE daily_stats ADD COLUMN devices TEXT NOT NULL DEFAULT '[]';"
fi

# Pastikan akun admin monitoring ada (role admin, lihat Log & Aktivitas)
# Sandi awal acak - nilai asli di file lokal .credentials.local (TIDAK di repo)
npx wrangler d1 execute "$DB_NAME" --remote --command "INSERT OR IGNORE INTO users (id, username, name, role, email, password, created_at) VALUES ('user-admin','admin','Admin (Monitoring)','admin','','pbkdf2:100000:2055f2fa44348564e891faef437b63bf:2c428efa23c625194667669c5c12a12a2d3e08cfb693ed26ba2a24b4c7610283', datetime('now'));" >/dev/null 2>&1 || true

# Seed akun awal (owner/kasir) - INSERT OR IGNORE, aman dijalankan ulang
npx wrangler d1 execute "$DB_NAME" --remote --file=server/seed.sql

# Nama tampilan default akun owner/kasir (idempotent, untuk DB yang sudah ada)
npx wrangler d1 execute "$DB_NAME" --remote --command "UPDATE users SET name='owner' WHERE id='user-owner'; UPDATE users SET name='kasir' WHERE id='user-kasir-1';" >/dev/null 2>&1 || true

echo "=== 6/6 Deploy ==="
npx wrangler deploy

echo "=== 7/7 JWT_SECRET (secret produksi) ==="
if ! npx wrangler secret list --json 2>/dev/null | grep -q '"JWT_SECRET"'; then
  SECRET=$(openssl rand -base64 32)
  printf '{"JWT_SECRET":"%s"}\n' "$SECRET" > /tmp/salad-secret.json
  echo "  Memasang JWT_SECRET acak..."
  npx wrangler secret bulk /tmp/salad-secret.json
  rm -f /tmp/salad-secret.json
else
  echo "  JWT_SECRET sudah terpasang."
fi

echo ""
echo "=================================================="
echo "✅ Deploy selesai."
echo "   URL sementara (gratis, tanpa domain):"
echo "   https://salad-yook.<subdomain>.workers.dev"
echo "   (cek output wrangler deploy untuk URL persisnya)"
echo ""
echo "   LANGKAH BERIKUTNYA (WAJIB):"
echo "   1. Buka file lokal .credentials.local untuk sandi awal"
echo "      (owner, kasir, admin) - file ini TIDAK ikut di repo."
echo "   2. Login admin (username: admin) di portal /godmode,"
echo "      lalu GANTI sandi admin via Pengaturan Cafe. Akun admin bisa"
echo "      melihat Log & Aktivitas untuk pemantauan error jarak jauh."
echo "   3. Ganti sandi owner/kasir via dashboard."
echo "   4. Beli domain nanti? Tambahkan ke Cloudflare ->"
echo "      Worker -> Settings -> Domains & Routes. TANPA ubah kode."
echo "=================================================="
