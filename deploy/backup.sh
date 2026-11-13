#!/usr/bin/env bash
# Backup harian database MySQL + folder upload, simpan 14 hari terakhir.
# Kredensial dibaca dari /etc/po-system/backup.cnf (format [client] user=… password=…), bukan dari argumen.
# Cron (jam 01:30 setiap hari):
#   30 1 * * * /var/www/po-system/deploy/backup.sh >> /var/log/po-system/backup.log 2>&1
set -euo pipefail

DB_NAME="${DB_NAME:-po_system}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/po-system}"
UPLOAD_DIR="${UPLOAD_DIR:-/var/www/po-system/backend/storage/uploads}"
KEEP_DAYS="${KEEP_DAYS:-14}"
CNF="${CNF:-/etc/po-system/backup.cnf}"
STAMP="$(date +%Y%m%d-%H%M%S)"

umask 077
mkdir -p "$BACKUP_DIR"

mysqldump --defaults-extra-file="$CNF" --single-transaction --routines --triggers --no-tablespaces "$DB_NAME" \
  | gzip -9 > "$BACKUP_DIR/db-$DB_NAME-$STAMP.sql.gz"

if [ -d "$UPLOAD_DIR" ]; then
  tar -czf "$BACKUP_DIR/uploads-$STAMP.tar.gz" -C "$(dirname "$UPLOAD_DIR")" "$(basename "$UPLOAD_DIR")"
fi

# Pastikan file dump tidak rusak sebelum menghapus backup lama
gzip -t "$BACKUP_DIR/db-$DB_NAME-$STAMP.sql.gz"
find "$BACKUP_DIR" -type f \( -name 'db-*.sql.gz' -o -name 'uploads-*.tar.gz' \) -mtime +"$KEEP_DAYS" -delete

echo "$(date '+%F %T') backup OK: db-$DB_NAME-$STAMP.sql.gz"
