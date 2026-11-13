# PO & Cashback System (versi VPS + MySQL)

Aplikasi Purchase Order dan manajemen cashback vendor, dibangun ulang dari blueprint
"PMS Premium" (sebelumnya Firebase) untuk berjalan di VPS sendiri dengan database MySQL.

## Struktur

```
backend/   API Node.js (Express + TypeScript + Prisma + MySQL 8)
frontend/  Aplikasi web React + TypeScript + Vite + Tailwind CSS
```

## Status pengerjaan

| Tahap | Isi | Status |
| --- | --- | --- |
| 1 | Skema MySQL, login & hak akses, master data, user, pengaturan perusahaan, audit trail | ✅ selesai |
| 2 | Purchase Order (single & multi cabang, approval, cetak, Excel) | ⏳ |
| 3 | Klaim cashback vendor & distribusi otomatis per area | ⏳ |
| 4 | Pembayaran cashback manual Kepala Bengkel | ⏳ |
| 5 | Dashboard KPI, laporan CSV/PDF, notifikasi, deploy | ⏳ |

Skema database (`backend/prisma/schema.prisma`) sudah mencakup tabel untuk tahap 2 sampai 5.

## Menjalankan di komputer lokal

Kebutuhan: Node.js 20+ dan MySQL 8 (bisa pakai `docker compose up -d`).

```bash
# 1. Backend
cd backend
cp .env.example .env          # lalu isi DATABASE_URL, JWT_SECRET, SEED_ADMIN_*
npm install
npx prisma migrate deploy     # membuat semua tabel
npm run db:seed               # membuat Super Admin + area JAWA & SKS
# opsional data contoh: SEED_DEMO=true npm run db:seed
npm run dev                   # API di http://localhost:4000

# 2. Frontend (terminal lain)
cd frontend
npm install
npm run dev                   # buka http://localhost:5173
```

Login memakai `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` dari `.env`.
Akun contoh (bila seed demo): `admin.jkt@example.com` dan `kabeng.jkt@example.com`, password `Demo12345`.

## Tes

```bash
cd backend
# pakai database terpisah khusus tes
DATABASE_URL="mysql://po_app:po_app_dev@127.0.0.1:3306/po_system_test" npx prisma migrate deploy
DATABASE_URL="mysql://po_app:po_app_dev@127.0.0.1:3306/po_system_test" npm test
```

## Keamanan (perbaikan dari versi Firebase)

- Semua cek hak akses dilakukan di server; frontend hanya menyembunyikan menu.
- Password di-hash dengan bcrypt (cost 12), tidak pernah dikirim ke frontend.
- Sesi memakai JWT di cookie `httpOnly` + `SameSite=Lax`; tidak ada login anonim.
- Token langsung batal bila password diganti, role/cabang diubah, atau akun dinonaktifkan.
- Batas percobaan login (20 kali / 15 menit per IP).
- Request yang mengubah data wajib `application/json` (perlindungan CSRF).
- File upload (bukti transfer, logo, TTD) disimpan di disk dengan nama acak, hanya bisa diunduh user yang login.
- Data master & user memakai soft delete; semua perubahan tercatat di audit trail (tanpa password).

## Hak akses (ringkas)

| Fitur | Super Admin | Admin Cabang | Kepala Bengkel |
| --- | :-: | :-: | :-: |
| Master data & user (tulis) | ✅ | ❌ | ❌ |
| Lihat cabang, area, produk | ✅ | ✅ | ✅ |
| Lihat vendor | ✅ | ✅ | ❌ |
| Lihat karyawan | ✅ semua | ✅ cabangnya | ❌ |
| Pengaturan perusahaan, audit trail | ✅ | ❌ | ❌ |

## Deploy ke VPS (ringkas, detail di tahap 5)

1. Pasang Node.js 20, MySQL 8, Nginx, PM2.
2. Backend: `npm ci && npm run build && npx prisma migrate deploy && pm2 start dist/server.js --name po-api`.
3. Frontend: `npm ci && npm run build`, sajikan folder `frontend/dist` lewat Nginx.
4. Nginx: `location /api { proxy_pass http://127.0.0.1:4000; }` dan `try_files $uri /index.html` untuk SPA.
5. SSL: `certbot --nginx`. Backup harian: `mysqldump` via cron + salin folder `storage/uploads`.
