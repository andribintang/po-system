# Panduan Deploy ke VPS (Ubuntu 24.04)

Susunan di server:

```
Internet ──HTTPS──> Nginx (443)
                     ├── /           → file statis frontend/dist (React)
                     └── /api/...    → Node.js API di 127.0.0.1:4000 (PM2)
                                          └── MySQL 8 di 127.0.0.1:3306
```

Spesifikasi minimum: 1 vCPU, 2 GB RAM, 20 GB disk. Siapkan domain (misalnya `po.perusahaan.co.id`) yang record A-nya sudah mengarah ke IP VPS.

Semua perintah di bawah dijalankan sebagai user dengan `sudo`. Ganti `po.contoh.co.id` dan password contoh dengan milik Anda.

## 1. Paket dasar & firewall

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y nginx mysql-server git curl ufw
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
sudo npm install -g pm2

sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable
```

MySQL hanya mendengarkan di `127.0.0.1` (bawaan Ubuntu). Port 3306 dan 4000 tidak perlu dibuka.

## 2. Database MySQL

```bash
sudo mysql_secure_installation
sudo mysql
```

```sql
CREATE DATABASE po_system CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'po_app'@'localhost' IDENTIFIED BY 'GANTI_PASSWORD_KUAT';
GRANT ALL PRIVILEGES ON po_system.* TO 'po_app'@'localhost';
-- user khusus backup (hanya baca)
CREATE USER 'po_backup'@'localhost' IDENTIFIED BY 'GANTI_PASSWORD_BACKUP';
GRANT SELECT, SHOW VIEW, TRIGGER, LOCK TABLES, EVENT ON po_system.* TO 'po_backup'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```

## 3. Ambil kode & konfigurasi

```bash
sudo mkdir -p /var/www/po-system /var/log/po-system
sudo chown -R $USER:$USER /var/www/po-system /var/log/po-system
git clone https://github.com/andribintang/po-system.git /var/www/po-system
cd /var/www/po-system/backend
cp .env.example .env
nano .env
```

Isi `.env` produksi:

```env
DATABASE_URL="mysql://po_app:GANTI_PASSWORD_KUAT@127.0.0.1:3306/po_system"
JWT_SECRET="(hasil: openssl rand -hex 32)"
JWT_EXPIRES_IN="8h"
PORT=4000
HOST=127.0.0.1
NODE_ENV=production
CORS_ORIGIN=
UPLOAD_DIR="/var/www/po-system/backend/storage/uploads"
SEED_ADMIN_EMAIL="admin@perusahaan.co.id"
SEED_ADMIN_PASSWORD="PasswordAwalYangKuat!"
```

```bash
chmod 600 .env
```

## 4. Build, migrasi, dan akun Super Admin pertama

```bash
cd /var/www/po-system/backend
npm ci
npx prisma migrate deploy
npm run db:seed          # membuat Super Admin dari SEED_ADMIN_*
npm run build

cd ../frontend
npm ci
npm run build            # hasil di frontend/dist
```

Setelah login pertama, segera ganti password Super Admin dari menu **Ganti Password**. Setelah itu hapus `SEED_ADMIN_PASSWORD` dari `.env`.

## 5. Jalankan API dengan PM2

```bash
cd /var/www/po-system
pm2 start deploy/ecosystem.config.cjs
pm2 save
pm2 startup systemd      # jalankan perintah yang ditampilkan agar otomatis hidup saat reboot
curl -s http://127.0.0.1:4000/api/health
```

## 6. Nginx & HTTPS (Let's Encrypt)

```bash
sudo cp deploy/nginx/po-system.conf /etc/nginx/sites-available/po-system
sudo sed -i 's/po.contoh.co.id/po.perusahaan.co.id/' /etc/nginx/sites-available/po-system
sudo ln -s /etc/nginx/sites-available/po-system /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx

sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d po.perusahaan.co.id --redirect -m email-admin@perusahaan.co.id --agree-tos
```

Certbot memasang sertifikat, mengalihkan HTTP ke HTTPS, dan memperpanjang otomatis. Cek dengan `sudo certbot renew --dry-run`.

Cookie login otomatis memakai flag `Secure` saat `NODE_ENV=production`, jadi aplikasi harus diakses lewat HTTPS.

## 7. Backup harian

```bash
sudo mkdir -p /etc/po-system /var/backups/po-system
sudo tee /etc/po-system/backup.cnf >/dev/null <<'EOF'
[client]
user=po_backup
password=GANTI_PASSWORD_BACKUP
EOF
sudo chmod 600 /etc/po-system/backup.cnf
chmod +x /var/www/po-system/deploy/backup.sh /var/www/po-system/deploy/update.sh

# coba sekali
sudo /var/www/po-system/deploy/backup.sh
ls -lh /var/backups/po-system

# jadwalkan jam 01:30 setiap hari
( sudo crontab -l 2>/dev/null; echo "30 1 * * * /var/www/po-system/deploy/backup.sh >> /var/log/po-system/backup.log 2>&1" ) | sudo crontab -
```

Backup menyimpan dump database (`db-*.sql.gz`) dan folder upload (`uploads-*.tar.gz`) selama 14 hari. Sebaiknya salin juga ke luar VPS secara berkala, misalnya dengan `rclone` ke Google Drive atau object storage, supaya data aman bila VPS rusak.

### Restore

```bash
gunzip -c /var/backups/po-system/db-po_system-YYYYMMDD-HHMMSS.sql.gz | mysql -u po_app -p po_system
tar -xzf /var/backups/po-system/uploads-YYYYMMDD-HHMMSS.tar.gz -C /var/www/po-system/backend/storage/
pm2 restart po-system-api
```

## 8. Update versi berikutnya

```bash
bash /var/www/po-system/deploy/update.sh
```

Skrip ini menarik `main`, menjalankan migrasi, build backend dan frontend, lalu `pm2 reload` tanpa downtime. Jalankan backup manual dulu sebelum update besar.

## Pemantauan

| Kebutuhan | Perintah |
| --- | --- |
| Status API | `pm2 status`, `curl -s http://127.0.0.1:4000/api/health` |
| Log API | `pm2 logs po-system-api` atau `/var/log/po-system/api.*.log` |
| Log Nginx | `/var/log/nginx/access.log`, `/var/log/nginx/error.log` |
| Log backup | `/var/log/po-system/backup.log` |
| Pemakaian disk | `df -h`, `du -sh /var/backups/po-system` |
