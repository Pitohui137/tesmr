#!/usr/bin/env bash
# ============================================================
# RESET AMAN PESANAN (soft reset = arsip).
#   - TIDAK PERNAH menyentuh users / settings / menu.
#   - Backup D1 + backup users DULU sebelum apa pun.
#   - Pesanan AKTIF (menunggu_verifikasi/diproses) tidak
#     diarsipkan kecuali --force.
#   - Laporan bulanan tetap aman: arsip masih dihitung di
#     laporan; hanya tidak tampil di daftar kasir.
# Pemakaian:
#   bash scripts/reset-orders.sh              # arsip pesanan (aman)
#   bash scripts/reset-orders.sh --force      # arsip walau ada order aktif
#   bash scripts/reset-orders.sh --hard       # arsip + hapus permanen (zero total, dengan backup)
# ============================================================
set -euo pipefail

DB_NAME="salad-yook-db"
FORCE=0
HARD=0
for a in "$@"; do
  case "$a" in
    --force) FORCE=1 ;;
    --hard) HARD=1 ;;
  esac
done

echo "=== 1/4 Backup dulu (wajib) ==="
bash scripts/backup-d1.sh
bash scripts/backup-users.sh

echo ""
echo "=== 2/4 Cek pesanan ==="
COUNT=$(npx wrangler d1 execute "$DB_NAME" --remote --json --command "SELECT COUNT(*) AS c FROM orders WHERE archived_at IS NULL;" 2>/dev/null | python3 -c "import sys,json;print(json.load(sys.stdin)[0]['results'][0]['c'])")
ACTIVE=$(npx wrangler d1 execute "$DB_NAME" --remote --json --command "SELECT COUNT(*) AS c FROM orders WHERE archived_at IS NULL AND status IN ('menunggu_verifikasi','diproses');" 2>/dev/null | python3 -c "import sys,json;print(json.load(sys.stdin)[0]['results'][0]['c'])")
echo "  Total belum diarsip : $COUNT"
echo "  Pesanan AKTIF        : $ACTIVE"

if [ "$ACTIVE" -gt 0 ] && [ "$FORCE" -eq 0 ]; then
  echo ""
  echo "ABORT: Ada $ACTIVE pesanan aktif (belum diproses)."
  echo "  Reset TIDAK menyentuh pesanan yang belum diproses."
  echo "  Selesaikan/batalkan dulu, atau jalankan dengan --force"
  exit 1
fi

echo ""
echo "=== 3/4 Proses ==="
if [ "$HARD" -eq 1 ]; then
  echo "  Mode --hard: arsip lalu HAPUS PERMANEN pesanan + nolkan rekap bulanan."
  npx wrangler d1 execute "$DB_NAME" --remote --command "UPDATE orders SET archived_at = datetime('now') WHERE archived_at IS NULL; DELETE FROM orders WHERE archived_at IS NOT NULL; DELETE FROM monthly_totals;" >/dev/null
else
  echo "  Mode soft: arsip pesanan (riwayat hilang dari daftar kasir, rekap bulanan tetap dihitung)."
  npx wrangler d1 execute "$DB_NAME" --remote --command "UPDATE orders SET archived_at = datetime('now') WHERE archived_at IS NULL;" >/dev/null
fi

AFTER=$(npx wrangler d1 execute "$DB_NAME" --remote --json --command "SELECT COUNT(*) AS c FROM orders WHERE archived_at IS NULL;" 2>/dev/null | python3 -c "import sys,json;print(json.load(sys.stdin)[0]['results'][0]['c'])")
echo ""
echo "=== 4/4 Selesai ==="
echo "  Pesanan aktif tersisa: $AFTER"
echo "  users / settings / menu TIDAK tersentuh."
