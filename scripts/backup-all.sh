#!/usr/bin/env bash
# Backup harian lengkap (D1 + users) — dipanggil penjadwalan launchd tiap 05.00.
set -euo pipefail
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$PATH"

cd "$(dirname "$0")/.." || exit 1
mkdir -p logs

LOG="logs/backup.log"
echo "" >> "$LOG"
echo "[$(date '+%Y-%m-%d %H:%M:%S')] ===== Backup harian dimulai =====" >> "$LOG"

if bash scripts/backup-d1.sh >> "$LOG" 2>&1; then
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] D1 backup OK" >> "$LOG"
else
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] D1 backup GAGAL" >> "$LOG"
fi

if bash scripts/backup-users.sh >> "$LOG" 2>&1; then
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] Users backup OK" >> "$LOG"
else
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] Users backup GAGAL" >> "$LOG"
fi
