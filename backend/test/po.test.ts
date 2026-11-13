import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import ExcelJS from 'exceljs';
import { createApp } from '../src/app';
import { prisma } from '../src/lib/prisma';
import { login, resetDb } from './helpers';

process.env.NODE_ENV = 'test';
const app = createApp();

let jkt: number, plb: number, vendorA: number, vendorB: number, p1: number, p2: number, pB: number;
const PASS = 'Rahasia123';

before(async () => {
  await resetDb();
  const hash = await bcrypt.hash(PASS, 4);
  const area = await prisma.area.create({ data: { kodeArea: 'JAWA', namaArea: 'Jawa' } });
  jkt = (await prisma.branch.create({ data: { kodeCabang: 'CBG-JKT', namaCabang: 'Jakarta', areaId: area.id } })).id;
  plb = (await prisma.branch.create({ data: { kodeCabang: 'CBG-PLB', namaCabang: 'Palembang', areaId: area.id } })).id;
  vendorA = (await prisma.vendor.create({ data: { kodeVendor: 'VND-A', namaVendor: 'Vendor A' } })).id;
  vendorB = (await prisma.vendor.create({ data: { kodeVendor: 'VND-B', namaVendor: 'Vendor B' } })).id;
  const fees = { feeVendorPerPcs: '3000', feeKabengPerPcs: '2000', feePerusahaanPerPcs: '1000' };
  p1 = (await prisma.product.create({ data: { kodeProduk: 'P1', namaProduk: 'Produk 1', vendorId: vendorA, isiPerDus: 24, hargaBeli: '10000.50', ...fees } })).id;
  p2 = (await prisma.product.create({ data: { kodeProduk: 'P2', namaProduk: 'Produk 2', vendorId: vendorA, isiPerDus: 36, hargaBeli: '5000', ...fees } })).id;
  pB = (await prisma.product.create({ data: { kodeProduk: 'PB', namaProduk: 'Produk B', vendorId: vendorB, isiPerDus: 24, hargaBeli: '1000', ...fees } })).id;
  await prisma.user.createMany({
    data: [
      { nama: 'SA', email: 'sa@t.local', role: 'SUPER_ADMIN', passwordHash: hash },
      { nama: 'Adm JKT', email: 'jkt@t.local', role: 'ADMIN', branchId: jkt, passwordHash: hash },
      { nama: 'Adm PLB', email: 'plb@t.local', role: 'ADMIN', branchId: plb, passwordHash: hash },
    ],
  });
});
after(async () => prisma.$disconnect());

const single = (over: Record<string, unknown> = {}) => ({
  tanggalPo: '2026-11-13',
  vendorId: vendorA,
  isMulti: false,
  branchId: jkt,
  items: [
    { productId: p1, qtyDus: 2 },
    { productId: p2, qtyDus: 1, harga: 4500 },
  ],
  ...over,
});

test('Admin membuat PO single: nomor otomatis & total dihitung server (DECIMAL)', async () => {
  const a = await login(app, 'jkt@t.local', PASS);
  const r = await a.post('/api/po').send({ ...single(), grandTotal: 1 /* diabaikan server */ });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(r.body.poNumber, 'PO/CBG-JKT/202611/0001');
  assert.equal(r.body.status, 'DRAFT');
  assert.equal(r.body.totalDus, 3);
  assert.equal(r.body.totalPcs, 48 + 36);
  // 48 × 10000.50 + 36 × 4500 = 480024 + 162000
  assert.equal(r.body.grandTotal, '642024');
  const r2 = await a.post('/api/po').send(single());
  assert.equal(r2.body.poNumber, 'PO/CBG-JKT/202611/0002');
});

test('validasi: produk vendor lain, cabang lain, multi oleh admin, item duplikat', async () => {
  const a = await login(app, 'jkt@t.local', PASS);
  assert.equal((await a.post('/api/po').send(single({ items: [{ productId: pB, qtyDus: 1 }] }))).status, 400);
  assert.equal((await a.post('/api/po').send(single({ branchId: plb }))).status, 403);
  assert.equal((await a.post('/api/po').send(single({ isMulti: true, branchId: null, items: [{ productId: p1, qtyDus: 1, branchId: jkt }] }))).status, 403);
  assert.equal((await a.post('/api/po').send(single({ items: [{ productId: p1, qtyDus: 1 }, { productId: p1, qtyDus: 2 }] }))).status, 400);
  assert.equal((await a.post('/api/po').send(single({ items: [] }))).status, 400);
});

test('nomor PO tetap unik saat dibuat bersamaan', async () => {
  const a = await login(app, 'sa@t.local', PASS);
  const rs = await Promise.all(Array.from({ length: 8 }, () => a.post('/api/po').send(single({ tanggalPo: '2026-12-01' }))));
  rs.forEach((r) => assert.equal(r.status, 201, JSON.stringify(r.body)));
  const nums = new Set(rs.map((r) => r.body.poNumber));
  assert.equal(nums.size, 8);
});

test('PO multi cabang oleh Super Admin + visibilitas admin cabang', async () => {
  const sa = await login(app, 'sa@t.local', PASS);
  const r = await sa.post('/api/po').send({
    tanggalPo: '2026-11-14', vendorId: vendorA, isMulti: true,
    items: [{ productId: p1, qtyDus: 1, branchId: jkt }, { productId: p1, qtyDus: 2, branchId: plb }],
  });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(r.body.poNumber, 'PO/MULTI/202611/0001');
  assert.equal(r.body.branchId, null);

  const plbAdmin = await login(app, 'plb@t.local', PASS);
  const list = await plbAdmin.get('/api/po');
  const nums = list.body.items.map((p: { poNumber: string }) => p.poNumber);
  assert.deepEqual(nums, ['PO/MULTI/202611/0001']); // tidak melihat PO single Jakarta
  const det = await plbAdmin.get(`/api/po/${r.body.id}`);
  assert.equal(det.status, 200);
  assert.deepEqual(det.body.allowedTransitions, []); // hanya baca
  assert.equal((await plbAdmin.post(`/api/po/${r.body.id}/status`).send({ to: 'MENUNGGU_APPROVAL' })).status, 403);
});

test('alur status: admin ajukan, admin tidak bisa approve, SA approve, lanjut sampai selesai', async () => {
  const adm = await login(app, 'jkt@t.local', PASS);
  const sa = await login(app, 'sa@t.local', PASS);
  const po = (await adm.post('/api/po').send(single())).body;
  const st = (agent: typeof adm, to: string) => agent.post(`/api/po/${po.id}/status`).send({ to });

  assert.equal((await st(adm, 'APPROVED')).status, 400); // lompat status
  assert.equal((await st(adm, 'MENUNGGU_APPROVAL')).status, 200);
  // Tidak bisa diedit setelah diajukan
  assert.equal((await adm.put(`/api/po/${po.id}`).send(single())).status, 400);
  assert.equal((await st(adm, 'APPROVED')).status, 400); // admin tidak boleh approve
  const ap = await st(sa, 'APPROVED');
  assert.equal(ap.status, 200);
  assert.ok(ap.body.approvedAt);
  assert.equal((await st(adm, 'DRAFT')).status, 400); // APPROVED tidak bisa kembali ke DRAFT
  for (const to of ['DIKIRIM_VENDOR', 'DIKIRIM', 'DITERIMA', 'SELESAI']) assert.equal((await st(adm, to)).status, 200, to);
  assert.equal((await st(sa, 'CANCEL')).status, 400);

  const det = await adm.get(`/api/po/${po.id}`);
  assert.deepEqual(det.body.statusHistories.map((h: { toStatus: string }) => h.toStatus),
    ['DRAFT', 'MENUNGGU_APPROVAL', 'APPROVED', 'DIKIRIM_VENDOR', 'DIKIRIM', 'DITERIMA', 'SELESAI']);
  assert.equal(det.body.canDelete, false);

  const notif = await adm.get('/api/notifications');
  const types = notif.body.items.map((n: { type: string }) => n.type);
  assert.ok(types.includes('PO_APPROVED') && types.includes('GOODS_RECEIVED'));
  assert.ok(notif.body.unread > 0);
  await adm.post('/api/notifications/read-all');
  assert.equal((await adm.get('/api/notifications')).body.unread, 0);
});

test('edit draft, hapus draft (soft delete), bulk status & bulk delete', async () => {
  const adm = await login(app, 'jkt@t.local', PASS);
  const sa = await login(app, 'sa@t.local', PASS);
  const po = (await adm.post('/api/po').send(single())).body;
  const ed = await adm.put(`/api/po/${po.id}`).send(single({ items: [{ productId: p1, qtyDus: 10 }] }));
  assert.equal(ed.status, 200, JSON.stringify(ed.body));
  assert.equal(ed.body.totalPcs, 240);

  const a = (await adm.post('/api/po').send(single({ submit: true }))).body;
  const b = (await adm.post('/api/po').send(single({ submit: true }))).body;
  assert.equal(a.status, 'MENUNGGU_APPROVAL');
  assert.equal((await adm.post('/api/po/bulk-status').send({ ids: [a.id], to: 'APPROVED' })).status, 403);
  const bulk = await sa.post('/api/po/bulk-status').send({ ids: [a.id, b.id, po.id], to: 'APPROVED' });
  assert.equal(bulk.body.success, 2);
  assert.equal(bulk.body.failed, 1); // po masih DRAFT

  const del = await sa.post('/api/po/bulk-delete').send({ ids: [po.id, a.id] });
  assert.equal(del.body.deleted, 1);
  assert.equal(del.body.skipped[0].id, a.id);
  assert.equal((await adm.get(`/api/po/${po.id}`)).status, 404);
  const row = await prisma.purchaseOrder.findUnique({ where: { id: po.id } });
  assert.ok(row?.deletedAt);
});

async function xlsx(headers: string[], rows: (string | number)[][]) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('S');
  ws.addRow(headers);
  rows.forEach((r) => ws.addRow(r));
  return Buffer.from(await wb.xlsx.writeBuffer());
}

test('impor PO dari Excel: semua-atau-tidak sama sekali', async () => {
  const sa = await login(app, 'sa@t.local', PASS);
  const H = ['REF_PO', 'TANGGAL', 'KODE_VENDOR', 'KODE_CABANG', 'KODE_PRODUK', 'QTY_DUS', 'HARGA_PER_PCS', 'CATATAN'];
  const before = await prisma.purchaseOrder.count();
  const bad = await xlsx(H, [
    ['X', '2026-11-20', 'VND-A', 'CBG-JKT', 'P1', 3, '', ''],
    ['Y', '2026-11-20', 'VND-A', 'CBG-JKT', 'TIDAK-ADA', 3, '', ''],
  ]);
  const r1 = await sa.post('/api/po/import').attach('file', bad, 'po.xlsx');
  assert.equal(r1.status, 400);
  assert.equal(r1.body.details.rows[0].row, 3);
  assert.equal(await prisma.purchaseOrder.count(), before);

  const good = await xlsx(H, [
    ['X', '2026-11-20', 'VND-A', 'CBG-JKT', 'P1', 3, '', 'impor'],
    ['X', '2026-11-20', 'VND-A', 'CBG-JKT', 'P2', 1, 4000, ''],
    ['M', '2026-11-20', 'VND-A', 'CBG-JKT', 'P1', 1, '', ''],
    ['M', '2026-11-20', 'VND-A', 'CBG-PLB', 'P1', 1, '', ''],
  ]);
  const r2 = await sa.post('/api/po/import').attach('file', good, 'po.xlsx');
  assert.equal(r2.status, 201, JSON.stringify(r2.body));
  assert.equal(r2.body.created.length, 2);
  const m = await prisma.purchaseOrder.findUnique({ where: { id: r2.body.created[1].id } });
  assert.equal(m?.isMulti, true);

  // Admin tidak boleh impor PO multi cabang
  const adm = await login(app, 'jkt@t.local', PASS);
  const r3 = await adm.post('/api/po/import').attach('file', good, 'po.xlsx');
  assert.equal(r3.status, 400);

  const exp = await sa.get('/api/po/export.xlsx').buffer(true).parse((res, cb) => {
    const chunks: Buffer[] = [];
    res.on('data', (c: Buffer) => chunks.push(c));
    res.on('end', () => cb(null, Buffer.concat(chunks)));
  });
  assert.equal(exp.status, 200);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(exp.body);
  assert.deepEqual(wb.worksheets.map((w) => w.name), ['Summary', 'Details']);
});

test('impor master produk (upsert) + validasi per baris', async () => {
  const sa = await login(app, 'sa@t.local', PASS);
  const H = ['KODE_PRODUK', 'NAMA_PRODUK', 'MEREK', 'KODE_VENDOR', 'UNIT', 'ISI_PER_DUS', 'HARGA_BELI', 'FEE_VENDOR', 'FEE_KABENG', 'FEE_PERUSAHAAN', 'STATUS'];
  const bad = await xlsx(H, [['P9', 'Baru', '', 'VND-ZZZ', 'PCS', 24, 100, 1, 1, 1, '']]);
  assert.equal((await sa.post('/api/master-excel/produk/import').attach('file', bad, 'p.xlsx')).status, 400);
  const good = await xlsx(H, [
    ['p1', 'Produk 1 Ganti Nama', '', 'VND-A', 'PCS', 24, 11000, 3000, 2000, 1000, 'ACTIVE'],
    ['P9', 'Produk Baru', '', 'VND-B', 'PCS', 36, 100, 1, 1, 1, ''],
  ]);
  const r = await sa.post('/api/master-excel/produk/import').attach('file', good, 'p.xlsx');
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.deepEqual(r.body, { created: 1, updated: 1 });
  assert.equal((await prisma.product.findUnique({ where: { kodeProduk: 'P1' } }))?.namaProduk, 'Produk 1 Ganti Nama');
  const adm = await login(app, 'jkt@t.local', PASS);
  assert.equal((await adm.get('/api/master-excel/produk/export.xlsx')).status, 403);
});
