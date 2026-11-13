#!/usr/bin/env bash
# Update aplikasi ke versi terbaru di branch main (jalankan sebagai user aplikasi di VPS).
#   bash /var/www/po-system/deploy/update.sh
set -euo pipefail
APP_DIR="${APP_DIR:-/var/www/po-system}"
cd "$APP_DIR"

echo "==> Ambil kode terbaru"
git pull --ff-only origin main

echo "==> Backend: install, migrasi database, build"
cd "$APP_DIR/backend"
npm ci
npx prisma generate
npx prisma migrate deploy
npm run build

echo "==> Frontend: build"
cd "$APP_DIR/frontend"
npm ci
npm run build

echo "==> Restart API tanpa downtime"
pm2 reload po-system-api --update-env || pm2 start "$APP_DIR/deploy/ecosystem.config.cjs"
pm2 save
echo "==> Selesai. Cek: curl -s http://127.0.0.1:4000/api/health"
