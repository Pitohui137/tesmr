#!/usr/bin/env bash
# Backup khusus tabel users (akun staf: owner/kasir/admin/tambahan) dari D1 REMOTE.
# Pemakaian: bash scripts/backup-users.sh
# RESTORE: npx wrangler d1 execute salad-yook-db --remote --file="backups/users-XXXX.sql"
set -euo pipefail

DB_NAME="salad-yook-db"
BACKUP_DIR="backups"
mkdir -p "$BACKUP_DIR"

STAMP=$(date -u +%Y-%m-%dT%H-%M-%S)
OUT="$BACKUP_DIR/users-$STAMP.sql"

echo "Export akun (users) -> $OUT"
JSON_TMP=$(mktemp)
npx wrangler d1 execute "$DB_NAME" --remote --json --command "SELECT id, username, name, role, email, password, created_at FROM users;" > "$JSON_TMP"
python3 - "$JSON_TMP" "$OUT" <<'PY'
import sys, json
rows = json.load(open(sys.argv[1]))[0]['results']
out = sys.argv[2]
cols = ['id','username','name','role','email','password','created_at']
with open(out, 'w') as f:
    f.write("-- Backup akun (users) Salad Yook\n")
    f.write("-- RESTORE: npx wrangler d1 execute salad-yook-db --remote --file=\"" + out + "\"\n\n")
    for r in rows:
        vals = ", ".join("'" + str(r[c] or '').replace("'", "''") + "'" for c in cols)
        f.write(f"INSERT OR REPLACE INTO users ({', '.join(cols)}) VALUES ({vals});\n")
    f.write(f"\n-- {len(rows)} akun\n")
PY
rm -f "$JSON_TMP"
echo "Selesai: $(du -h "$OUT" | cut -f1) ($(grep -c 'INSERT OR REPLACE INTO users' "$OUT" || true) akun)"

# Retention: sisakan 14 file users-*.sql terbaru
MAX_BACKUPS=14
COUNT=$(ls -1 "$BACKUP_DIR"/users-*.sql 2>/dev/null | wc -l | tr -d ' ')
if [ "$COUNT" -gt "$MAX_BACKUPS" ]; then
  ls -1t "$BACKUP_DIR"/users-*.sql | tail -n $((COUNT - MAX_BACKUPS)) | xargs rm -f
  echo "Pembersihan: sisa $MAX_BACKUPS backup users."
fi

echo ""
echo "CONTOH RESTORE AKUN:"
echo "  npx wrangler d1 execute $DB_NAME --remote --file=\"$OUT\""
