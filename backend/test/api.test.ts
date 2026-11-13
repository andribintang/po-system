/**
 * Tes integrasi API. Jalankan dengan database khusus tes:
 *   DATABASE_URL=mysql://.../po_system_test npx prisma migrate reset --force --skip-seed
 *   DATABASE_URL=mysql://.../po_system_test npm test
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import { Prisma } from '@prisma/client';
import { createApp } from '../src/app';
import { prisma } from '../src/lib/prisma';
import { resolveFee, splitCashback } from '../src/lib/fees';

process.env.NODE_ENV = 'test';
const app = createApp();
const D = (n: number | string) => new Prisma.Decimal(n);

async function login(email: string, password: string) {
  const agent = request.agent(app);
  const r = await agent.post('/api/auth/login').send({ email, password });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  return agent;
}

let areaId: number;
let branchId: number;

before(async () => {
  // Bersihkan tabel (urutan menghormati foreign key).
  await prisma.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=0');
  for (const t of ['audit_logs', 'product_area_fees', 'products', 'users', 'employees', 'branches', 'areas', 'vendors', 'file_uploads', 'company_settings']) {
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${t}`);
  }
  await prisma.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=1');
  const hash = await bcrypt.hash('Rahasia123', 4);
  const area = await prisma.area.create({ data: { kodeArea: 'JAWA', namaArea: 'Jawa' } });
  const branch = await prisma.branch.create({ data: { kodeCabang: 'C1', namaCabang: 'Cabang 1', areaId: area.id } });
  areaId = area.id;
  branchId = branch.id;
  await prisma.user.create({ data: { nama: 'SA', email: 'sa@test.local', role: 'SUPER_ADMIN', passwordHash: hash } });
  await prisma.user.create({ data: { nama: 'Adm', email: 'adm@test.local', role: 'ADMIN', branchId, passwordHash: hash } });
});

after(async () => prisma.$disconnect());

test('resolveFee memakai tarif area bila ada, default bila tidak', () => {
  const p = {
    feeVendorPerPcs: D(3000), feeKabengPerPcs: D(2000), feePerusahaanPerPcs: D(1000),
    areaFees: [{ areaId: 2, feeVendorPerPcs: D(3500), feeKabengPerPcs: D(2500), feePerusahaanPerPcs: D(1000) }],
  };
  assert.equal(resolveFee(p, 2).source, 'AREA');
  assert.equal(resolveFee(p, 2).feeKabengPerPcs.toString(), '2500');
  assert.equal(resolveFee(p, 1).source, 'DEFAULT');
  const s = splitCashback(resolveFee(p, 2), 48);
  assert.equal(s.totalVendor.toString(), '168000');
  assert.equal(s.totalKabeng.toString(), '120000');
});

test('login gagal dengan password salah dan akses tanpa login ditolak', async () => {
  const r = await request(app).post('/api/auth/login').send({ email: 'sa@test.local', password: 'salah' });
  assert.equal(r.status, 401);
  assert.equal((await request(app).get('/api/branches')).status, 401);
});

test('login berhasil, /me mengembalikan profil tanpa password', async () => {
  const a = await login('sa@test.local', 'Rahasia123');
  const r = await a.get('/api/auth/me');
  assert.equal(r.status, 200);
  assert.equal(r.body.user.role, 'SUPER_ADMIN');
  assert.equal(r.body.user.passwordHash, undefined);
});

test('ADMIN tidak boleh menulis master data maupun membuka user/audit', async () => {
  const a = await login('adm@test.local', 'Rahasia123');
  assert.equal((await a.get('/api/branches')).status, 200);
  assert.equal((await a.post('/api/vendors').send({ kodeVendor: 'X', namaVendor: 'X' })).status, 403);
  assert.equal((await a.get('/api/users')).status, 403);
  assert.equal((await a.get('/api/audit-logs')).status, 403);
});

test('SUPER_ADMIN membuat vendor + produk dengan fee area (DECIMAL)', async () => {
  const a = await login('sa@test.local', 'Rahasia123');
  const v = await a.post('/api/vendors').send({ kodeVendor: 'vnd-1', namaVendor: 'Vendor 1', email: '' });
  assert.equal(v.status, 201, JSON.stringify(v.body));
  assert.equal(v.body.kodeVendor, 'VND-1');
  const dup = await a.post('/api/vendors').send({ kodeVendor: 'VND-1', namaVendor: 'Lagi' });
  assert.equal(dup.status, 409);

  const p = await a.post('/api/products').send({
    kodeProduk: 'p1', namaProduk: 'Produk 1', vendorId: v.body.id, isiPerDus: 24, hargaBeli: 25000.5,
    feeVendorPerPcs: 3000, feeKabengPerPcs: 2000, feePerusahaanPerPcs: 1000,
    areaFees: [{ areaId, feeVendorPerPcs: 3500, feeKabengPerPcs: '2500', feePerusahaanPerPcs: 1000 }],
  });
  assert.equal(p.status, 201, JSON.stringify(p.body));
  assert.equal(p.body.hargaBeli, '25000.5');
  assert.equal(p.body.areaFees.length, 1);
  assert.equal(p.body.areaFees[0].area.kodeArea, 'JAWA');

  const dupArea = await a.put(`/api/products/${p.body.id}`).send({
    ...p.body, areaFees: [{ areaId, feeVendorPerPcs: 1, feeKabengPerPcs: 1, feePerusahaanPerPcs: 1 }, { areaId, feeVendorPerPcs: 1, feeKabengPerPcs: 1, feePerusahaanPerPcs: 1 }],
  });
  assert.equal(dupArea.status, 400);

  // Vendor dengan produk aktif tidak bisa dihapus.
  assert.equal((await a.delete(`/api/vendors/${v.body.id}`)).status, 409);
  const logs = await a.get('/api/audit-logs?modul=MASTER');
  assert.ok(logs.body.total >= 2);
});

test('aturan user: Kepala Bengkel wajib terhubung ke karyawan Kepala Bengkel di cabang yang sama', async () => {
  const a = await login('sa@test.local', 'Rahasia123');
  const base = { nama: 'KB', email: 'kb@test.local', password: 'Rahasia123', role: 'KEPALA_BENGKEL', branchId };
  assert.equal((await a.post('/api/users').send(base)).status, 400);
  const sa = await a.post('/api/employees').send({ nama: 'SA Emp', branchId, jabatan: 'SERVICE_ADVISOR' });
  assert.equal((await a.post('/api/users').send({ ...base, employeeId: sa.body.id })).status, 400);
  const kb = await a.post('/api/employees').send({ nama: 'KB Emp', branchId, jabatan: 'KEPALA_BENGKEL', bank: 'BCA' });
  const ok = await a.post('/api/users').send({ ...base, employeeId: kb.body.id });
  assert.equal(ok.status, 201, JSON.stringify(ok.body));
  assert.equal(ok.body.passwordHash, undefined);
  assert.equal((await a.post('/api/users').send({ ...base, password: 'pendek' })).status, 400);
});

test('ganti password membatalkan sesi lama', async () => {
  const old = await login('adm@test.local', 'Rahasia123');
  const fresh = await login('adm@test.local', 'Rahasia123');
  const r = await fresh.post('/api/auth/change-password').send({ currentPassword: 'Rahasia123', newPassword: 'BaruSekali99' });
  assert.equal(r.status, 200);
  assert.equal((await old.get('/api/auth/me')).status, 401);
  assert.equal((await fresh.get('/api/auth/me')).status, 200);
});

test('user nonaktif langsung kehilangan akses, soft delete user', async () => {
  const sa = await login('sa@test.local', 'Rahasia123');
  const u = await sa.post('/api/users').send({ nama: 'Tmp', email: 'tmp@test.local', password: 'Rahasia123', role: 'ADMIN', branchId });
  const tmp = await login('tmp@test.local', 'Rahasia123');
  await sa.put(`/api/users/${u.body.id}`).send({ ...u.body, status: 'INACTIVE', password: '' });
  assert.equal((await tmp.get('/api/auth/me')).status, 401);
  assert.equal((await sa.delete(`/api/users/${u.body.id}`)).status, 200);
  const row = await prisma.user.findUnique({ where: { id: u.body.id } });
  assert.ok(row?.deletedAt);
  // Email yang sama bisa dipakai lagi.
  const again = await sa.post('/api/users').send({ nama: 'Tmp2', email: 'tmp@test.local', password: 'Rahasia123', role: 'ADMIN', branchId });
  assert.equal(again.status, 201);
});

test('Content-Type selain JSON ditolak untuk request yang mengubah data', async () => {
  const a = await login('sa@test.local', 'Rahasia123');
  const r = await a.post('/api/vendors').set('Content-Type', 'application/x-www-form-urlencoded').send('kodeVendor=A&namaVendor=B');
  assert.equal(r.status, 415);
});
