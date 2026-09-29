#!/usr/bin/env bash
# Backup database D1 REMOTE ke folder backups/ (format SQL).
# Retensi: 14 file terbaru (sama seperti backup lokal).
# Pemakaian: bash scripts/backup-d1.sh
set -euo pipefail

DB_NAME="salad-yook-db"
BACKUP_DIR="backups"
MAX_BACKUPS=14

mkdir -p "$BACKUP_DIR"

STAMP=$(date -u +%Y-%m-%dT%H-%M-%S)
OUT="$BACKUP_DIR/d1-$STAMP.sql"

echo "Exporting D1 '$DB_NAME' -> $OUT"
npx wrangler d1 export "$DB_NAME" --remote --no-schema --output "$OUT" >/dev/null
echo "Backup selesai: $(du -h "$OUT" | cut -f1)"

# Hapus backup lama, sisakan MAX_BACKUPS terbaru
COUNT=$(ls -1 "$BACKUP_DIR"/d1-*.sql 2>/dev/null | wc -l | tr -d ' ')
if [ "$COUNT" -gt "$MAX_BACKUPS" ]; then
  ls -1t "$BACKUP_DIR"/d1-*.sql | tail -n $((COUNT - MAX_BACKUPS)) | xargs rm -f
  echo "Pembersihan: sisa $MAX_BACKUPS backup."
fi
