import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import { createApp } from '../src/app';
import { prisma } from '../src/lib/prisma';
import { login, resetDb } from './helpers';
import { lastPeriods } from '../src/routes/dashboard';
import { toCsv } from '../src/lib/tabular';

process.env.NODE_ENV = 'test';
const app = createApp();
const PASS = 'Rahasia123';
let jkt: number, plb: number;

before(async () => {
  await resetDb();
  const hash = await bcrypt.hash(PASS, 4);
  const area = await prisma.area.create({ data: { kodeArea: 'JAWA', namaArea: 'Jawa' } });
  jkt = (await prisma.branch.create({ data: { kodeCabang: 'CBG-JKT', namaCabang: 'Jakarta', areaId: area.id } })).id;
  plb = (await prisma.branch.create({ data: { kodeCabang: 'CBG-PLB', namaCabang: 'Palembang', areaId: area.id } })).id;
  const v = await prisma.vendor.create({ data: { kodeVendor: 'V1', namaVendor: 'Vendor Satu' } });
  const v2 = await prisma.vendor.create({ data: { kodeVendor: 'V2', namaVendor: 'Vendor Dua' } });
  const p = await prisma.product.create({
    data: { kodeProduk: 'P1', namaProduk: 'Oli Mesin', vendorId: v.id, isiPerDus: 24, hargaBeli: '10', feeVendorPerPcs: '3', feeKabengPerPcs: '2', feePerusahaanPerPcs: '1' },
  });
  const kb = await prisma.employee.create({ data: { nama: 'KB Jakarta', branchId: jkt, jabatan: 'KEPALA_BENGKEL', bank: 'BCA', nomorRekening: '111', namaRekening: 'KB J' } });
  await prisma.user.createMany({
    data: [
      { nama: 'SA', email: 'sa@t.local', role: 'SUPER_ADMIN', passwordHash: hash },
      { nama: 'Adm', email: 'adm@t.local', role: 'ADMIN', branchId: jkt, passwordHash: hash },
      { nama: 'KBJ', email: 'kbj@t.local', role: 'KEPALA_BENGKEL', branchId: jkt, employeeId: kb.id, passwordHash: hash },
    ],
  });
  const sa = await prisma.user.findUniqueOrThrow({ where: { email: 'sa@t.local' } });
  const det = (branchId: number, qtyDus: number) => ({ productId: p.id, branchId, namaProduk: 'Oli Mesin', qtyDus, isiPerDus: 24, totalPcs: qtyDus * 24, harga: '10', subtotal: String(qtyDus * 240) });
  const po = await prisma.purchaseOrder.create({
    data: { poNumber: 'PO-1', tanggalPo: new Date('2026-11-01'), vendorId: v.id, isMulti: true, status: 'APPROVED', createdById: sa.id, grandTotal: '720', details: { create: [det(jkt, 2), det(plb, 1)] } },
  });
  await prisma.purchaseOrder.create({
    data: { poNumber: 'PO-2', tanggalPo: new Date('2026-10-05'), vendorId: v2.id, branchId: plb, status: 'SELESAI', createdById: sa.id, grandTotal: '2400', details: { create: [det(plb, 10)] } },
  });
  await prisma.purchaseOrder.create({
    data: { poNumber: 'PO-DRAFT', tanggalPo: new Date('2026-11-02'), vendorId: v.id, branchId: jkt, status: 'DRAFT', createdById: sa.id, grandTotal: '240', details: { create: [det(jkt, 1)] } },
  });
  const r = await prisma.cashbackReceipt.create({
    data: { receiptNo: 'CB/202611/0001', vendorId: v.id, periode: '2026-11', tanggal: new Date('2026-11-20'), metodePengiriman: 'TRANSFER', totalCashback: '216', createdById: sa.id, pos: { create: [{ poId: po.id, branchId: jkt }, { poId: po.id, branchId: plb }] } },
  });
  const mk = (branchId: number, pcs: number, status: 'PAID' | 'UNPAID') =>
    prisma.cashbackDistribution.create({
      data: { periode: '2026-11', receiptId: r.id, poId: po.id, branchId, productId: p.id, qtyPcs: pcs, feeKabengPerPcs: '2', totalFeeKabeng: String(pcs * 2), feePerusahaanPerPcs: '1', totalFeePerusahaan: String(pcs), status },
    });
  const dj = await mk(jkt, 48, 'PAID');
  await mk(plb, 24, 'UNPAID');
  await prisma.cashbackPayment.create({
    data: {
      paymentNo: 'PAY-CB/202611/01', periode: '2026-11', tanggalBayar: new Date('2026-11-25'), metode: 'TRANSFER_MANUAL', totalBayar: '96', status: 'SUCCESS', createdById: sa.id,
      details: { create: [{ employeeId: kb.id, branchId: jkt, bank: 'BCA', rekening: '111', namaRekening: 'KB J', nominal: '96', status: 'SUCCESS', referensiPembayaran: 'TRX-9', items: { create: [{ distributionId: dj.id, nominal: '96' }] } }] },
    },
  });
  await prisma.auditLog.create({ data: { userId: sa.id, namaUser: 'SA', aksi: 'LOGIN', modul: 'AUTH', dataBaru: { note: 'koma, "kutip"' } } });
});
after(async () => prisma.$disconnect());

test('lastPeriods & CSV escaping', () => {
  assert.deepEqual(lastPeriods(new Date('2026-02-15T00:00:00Z'), 3), ['2025-12', '2026-01', '2026-02']);
  assert.equal(toCsv({ headers: ['a', 'b'], rows: [['x,y', 'he said "hi"']] }), '﻿a,b\r\n"x,y","he said ""hi"""\r\n');
});

test('dashboard nasional untuk Super Admin', async () => {
  const sa = await login(app, 'sa@t.local', PASS);
  const r = await sa.get('/api/dashboard');
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const k = r.body.kpi;
  assert.equal(k.totalPo, 3);
  assert.equal(k.nilaiPo, '3120'); // PO-1 720 + PO-2 2400 (draft tidak dihitung)
  assert.equal(k.vendorAktif, 2);
  assert.equal(k.totalCabang, 2);
  assert.equal(k.cashbackDiterima, '216');
  assert.equal(k.cashbackDibayar, '96');
  assert.equal(k.outstanding, '48');
  assert.equal(r.body.topVendors[0].vendor.namaVendor, 'Vendor Dua');
  assert.equal(r.body.topProducts[0].totalPcs, 13 * 24);
  assert.equal(r.body.topBranches[0].branch.id, jkt);
  assert.equal(r.body.topBranches[0].hakPerusahaan, '48');
  assert.equal(r.body.trend.length, 12);
  assert.equal(r.body.recentPOs.length, 3);
});

test('dashboard cabang: Admin & Kepala Bengkel hanya cabangnya', async () => {
  const adm = await login(app, 'adm@t.local', PASS);
  const a = (await adm.get(`/api/dashboard?branchId=${plb}`)).body; // branchId diabaikan untuk Admin
  assert.equal(a.scope.branchId, jkt);
  assert.equal(a.kpi.totalPo, 2); // PO-1 (multi) + PO-DRAFT
  assert.equal(a.kpi.nilaiPo, '480');
  assert.equal(a.kpi.cashbackDiterima, '144'); // 96 KB + 48 perusahaan
  assert.equal(a.kpi.outstanding, '0');
  assert.ok(a.topBranches.every((x: { branch: { id: number } }) => x.branch.id === jkt));

  const kb = await login(app, 'kbj@t.local', PASS);
  const k = (await kb.get('/api/dashboard')).body;
  assert.equal(k.kpi.cashbackDiterima, '96'); // hanya hak KB
  assert.equal(k.topBranches[0].hakPerusahaan, null);
});

test('laporan rekap PO: filter, scope admin, CSV & XLSX', async () => {
  const sa = await login(app, 'sa@t.local', PASS);
  const all = await sa.get('/api/reports/po');
  assert.equal(all.status, 200);
  assert.equal(all.body.items.length, 3);
  const nov = await sa.get('/api/reports/po?from=2026-11-01&to=2026-11-30&status=APPROVED');
  assert.deepEqual(nov.body.items.map((x: { poNumber: string }) => x.poNumber), ['PO-1']);
  assert.equal(nov.body.totals.nilai, '720');

  const adm = await login(app, 'adm@t.local', PASS);
  const a = await adm.get('/api/reports/po');
  assert.deepEqual(a.body.items.map((x: { poNumber: string }) => x.poNumber).sort(), ['PO-1', 'PO-DRAFT']);
  assert.equal(a.body.items.find((x: { poNumber: string }) => x.poNumber === 'PO-1').nilai, '480');

  const csv = await sa.get('/api/reports/po?format=csv');
  assert.equal(csv.status, 200);
  assert.match(csv.headers['content-type'], /text\/csv/);
  assert.match(csv.headers['content-disposition'], /rekap-po-\d{8}\.csv/);
  assert.match(csv.text, /No PO,Tanggal,Vendor/);
  assert.match(csv.text, /PO-2,2026-10-05,Vendor Dua,Palembang,Selesai,10,240,2400/);

  const x = await sa.get('/api/reports/po?format=xlsx').buffer(true);
  assert.equal(x.status, 200);
  assert.match(x.headers['content-type'], /spreadsheetml/);

  const kb = await login(app, 'kbj@t.local', PASS);
  assert.equal((await kb.get('/api/reports/po')).status, 403);
});

test('laporan cashback & pembayaran', async () => {
  const sa = await login(app, 'sa@t.local', PASS);
  const c = await sa.get('/api/reports/cashback');
  assert.equal(c.body.items.length, 1);
  assert.equal(c.body.totals.totalCashback, '216');
  assert.equal(c.body.totals.dibayar, '96');
  assert.equal(c.body.totals.outstanding, '48');
  const cp = await sa.get(`/api/reports/cashback?branchId=${plb}`);
  assert.equal(cp.body.items[0].totalCashback, '72');
  assert.equal(cp.body.items[0].jumlahPo, 1);

  const p = await sa.get('/api/reports/payments?status=SUCCESS');
  assert.equal(p.body.items.length, 1);
  assert.equal(p.body.items[0].rekening, 'BCA 111 a.n. KB J');
  assert.equal(p.body.totals.lunas, '96');
  const adm = await login(app, 'adm@t.local', PASS);
  assert.equal((await adm.get(`/api/reports/payments?branchId=${plb}`)).body.items.length, 1); // dipaksa ke cabang Jakarta
  assert.equal((await sa.get('/api/reports/payments?from=2026-12-01')).body.items.length, 0);
  assert.equal((await sa.get('/api/reports/payments?from=31-12-2026')).status, 400);
});

test('audit trail: filter tanggal & ekspor CSV', async () => {
  const sa = await login(app, 'sa@t.local', PASS);
  const today = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
  const r = await sa.get(`/api/audit-logs?from=${today}&to=${today}&modul=AUTH`);
  assert.ok(r.body.total >= 1);
  assert.equal((await sa.get('/api/audit-logs?to=2000-01-01')).body.total, 0);
  const csv = await sa.get('/api/audit-logs?format=csv&modul=AUTH');
  assert.match(csv.text, /Waktu \(WIB\),User,Modul,Aksi/);
  assert.match(csv.text, /"\{""note"":""koma, \\""kutip\\""""\}"/);
  const adm = await login(app, 'adm@t.local', PASS);
  assert.equal((await adm.get('/api/audit-logs?format=csv')).status, 403);
});
