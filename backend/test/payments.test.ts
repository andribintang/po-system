import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import { createApp } from '../src/app';
import { prisma } from '../src/lib/prisma';
import { login, resetDb } from './helpers';

process.env.NODE_ENV = 'test';
const app = createApp();
const PASS = 'Rahasia123';

let jkt: number, plb: number, kbJkt: number, kbPlb: number, receiptId: number;
let dJ1: number, dJ2: number, dP1: number;

before(async () => {
  await resetDb();
  const hash = await bcrypt.hash(PASS, 4);
  const area = await prisma.area.create({ data: { kodeArea: 'JAWA', namaArea: 'Jawa' } });
  jkt = (await prisma.branch.create({ data: { kodeCabang: 'CBG-JKT', namaCabang: 'Jakarta', areaId: area.id } })).id;
  plb = (await prisma.branch.create({ data: { kodeCabang: 'CBG-PLB', namaCabang: 'Palembang', areaId: area.id } })).id;
  const v = await prisma.vendor.create({ data: { kodeVendor: 'V', namaVendor: 'Vendor' } });
  const p = await prisma.product.create({
    data: { kodeProduk: 'P1', namaProduk: 'Produk', vendorId: v.id, isiPerDus: 24, hargaBeli: '1', feeVendorPerPcs: '3', feeKabengPerPcs: '2', feePerusahaanPerPcs: '1' },
  });
  kbJkt = (await prisma.employee.create({ data: { nama: 'KB Jakarta', branchId: jkt, jabatan: 'KEPALA_BENGKEL', bank: 'BCA', nomorRekening: '111', namaRekening: 'KB J' } })).id;
  kbPlb = (await prisma.employee.create({ data: { nama: 'KB Palembang', branchId: plb, jabatan: 'KEPALA_BENGKEL' } })).id; // tanpa rekening
  await prisma.user.createMany({
    data: [
      { nama: 'SA', email: 'sa@t.local', role: 'SUPER_ADMIN', passwordHash: hash },
      { nama: 'Adm', email: 'adm@t.local', role: 'ADMIN', branchId: jkt, passwordHash: hash },
      { nama: 'KBJ', email: 'kbj@t.local', role: 'KEPALA_BENGKEL', branchId: jkt, employeeId: kbJkt, passwordHash: hash },
      { nama: 'KBP', email: 'kbp@t.local', role: 'KEPALA_BENGKEL', branchId: plb, employeeId: kbPlb, passwordHash: hash },
    ],
  });
  const sa = await prisma.user.findUniqueOrThrow({ where: { email: 'sa@t.local' } });
  const po = await prisma.purchaseOrder.create({
    data: {
      poNumber: 'PO-1', tanggalPo: new Date('2026-11-01'), vendorId: v.id, isMulti: true, status: 'APPROVED', createdById: sa.id,
      details: { create: [
        { productId: p.id, branchId: jkt, namaProduk: 'x', qtyDus: 1, isiPerDus: 24, totalPcs: 24, harga: '1', subtotal: '24' },
        { productId: p.id, branchId: plb, namaProduk: 'x', qtyDus: 1, isiPerDus: 24, totalPcs: 24, harga: '1', subtotal: '24' },
      ] },
    },
  });
  await prisma.purchaseOrder.create({
    data: { poNumber: 'PO-DRAFT', tanggalPo: new Date('2026-11-01'), vendorId: v.id, branchId: jkt, status: 'DRAFT', createdById: sa.id,
      details: { create: [{ productId: p.id, branchId: jkt, namaProduk: 'x', qtyDus: 1, isiPerDus: 24, totalPcs: 24, harga: '1', subtotal: '24' }] } },
  });
  const r = await prisma.cashbackReceipt.create({
    data: {
      receiptNo: 'CB-1', vendorId: v.id, periode: '2026-11', tanggal: new Date('2026-11-20'), metodePengiriman: 'TRANSFER', totalCashback: '200', createdById: sa.id,
      pos: { create: [{ poId: po.id, branchId: jkt }, { poId: po.id, branchId: plb }] },
    },
  });
  receiptId = r.id;
  const mk = async (branchId: number, kabeng: string, periode = '2026-11') =>
    (await prisma.cashbackDistribution.create({
      data: { periode, receiptId, poId: po.id, branchId, productId: p.id, qtyPcs: 24, feeKabengPerPcs: '2', totalFeeKabeng: kabeng, feePerusahaanPerPcs: '1', totalFeePerusahaan: '24' },
    })).id;
  dJ1 = await mk(jkt, '48');
  dJ2 = await mk(jkt, '100.50');
  dP1 = await mk(plb, '48');
  await mk(jkt, '10', '2026-10');
});
after(async () => prisma.$disconnect());

const pay = (over: Record<string, unknown>) => ({
  periode: '2026-11', tanggalBayar: '2026-11-25', metode: 'TRANSFER_MANUAL', status: 'PENDING', referensi: 'TRX-001', ...over,
});

test('antrean outstanding per periode & cabang dengan peringatan rekening', async () => {
  const sa = await login(app, 'sa@t.local', PASS);
  const r = await sa.get('/api/payments/outstanding?periode=2026-11');
  assert.equal(r.status, 200);
  const g = Object.fromEntries(r.body.groups.map((x: { branch: { id: number } }) => [x.branch.id, x]));
  assert.equal(g[jkt].total, '148.5');
  assert.equal(g[jkt].warning, null);
  assert.match(g[plb].warning, /Rekening/);
  // Kepala Bengkel hanya melihat cabangnya; Admin cabang tidak punya akses
  const kb = await login(app, 'kbj@t.local', PASS);
  const r2 = await kb.get('/api/payments/outstanding');
  assert.ok(r2.body.groups.every((x: { branch: { id: number } }) => x.branch.id === jkt));
  const adm = await login(app, 'adm@t.local', PASS);
  assert.equal((await adm.get('/api/payments/outstanding')).status, 403);
});

test('validasi bayar: periode beda, transfer tanpa rekening, hanya Super Admin', async () => {
  const sa = await login(app, 'sa@t.local', PASS);
  const oct = await prisma.cashbackDistribution.findFirstOrThrow({ where: { periode: '2026-10' } });
  assert.equal((await sa.post('/api/payments').send(pay({ distributionIds: [dJ1, oct.id] }))).status, 400);
  const noRek = await sa.post('/api/payments').send(pay({ distributionIds: [dP1] }));
  assert.equal(noRek.status, 400);
  assert.match(noRek.body.error, /Rekening/);
  const kb = await login(app, 'kbj@t.local', PASS);
  assert.equal((await kb.post('/api/payments').send(pay({ distributionIds: [dJ1] }))).status, 403);
});

test('PENDING mengunci item, FAILED melepas, SUCCESS → PAID + notifikasi + slip', async () => {
  const sa = await login(app, 'sa@t.local', PASS);
  const p1 = await sa.post('/api/payments').send(pay({ distributionIds: [dJ1, dJ2] }));
  assert.equal(p1.status, 201, JSON.stringify(p1.body));
  assert.equal(p1.body.paymentNo, 'PAY-CB/202611/01');
  assert.equal(p1.body.totalBayar, '148.5');
  assert.equal((await prisma.cashbackDistribution.findUniqueOrThrow({ where: { id: dJ1 } })).status, 'UNPAID');

  // Item yang sedang PENDING tidak bisa dibayar lagi
  assert.equal((await sa.post('/api/payments').send(pay({ distributionIds: [dJ1] }))).status, 409);
  const out = await sa.get('/api/payments/outstanding?periode=2026-11');
  const gj = out.body.groups.find((x: { branch: { id: number } }) => x.branch.id === jkt);
  assert.equal(gj.reservedTotal, '148.5');

  // Diagnostik PO menunjukkan sedang diproses
  const el = await sa.get('/api/payments/eligibility?poNumber=PO-1');
  const ej = el.body.branches.find((b: { branch: { id: number } }) => b.branch.id === jkt);
  assert.match(ej.reasons[0], /PAY-CB\/202611\/01/);

  // Gagal → item bebas lagi
  assert.equal((await sa.post(`/api/payments/${p1.body.id}/confirm`).send({ status: 'FAILED', catatan: 'rekening salah' })).status, 200);
  assert.equal((await sa.post(`/api/payments/${p1.body.id}/confirm`).send({ status: 'SUCCESS' })).status, 400);

  // Bayar ulang PENDING lalu konfirmasi lunas
  const p2 = await sa.post('/api/payments').send(pay({ distributionIds: [dJ1, dJ2] }));
  assert.equal(p2.status, 201);
  assert.equal(p2.body.paymentNo, 'PAY-CB/202611/02');
  assert.equal((await sa.post(`/api/payments/${p2.body.id}/confirm`).send({ status: 'SUCCESS' })).status, 200);
  const dist = await prisma.cashbackDistribution.findMany({ where: { id: { in: [dJ1, dJ2] } } });
  assert.ok(dist.every((x) => x.status === 'PAID'));

  const kb = await login(app, 'kbj@t.local', PASS);
  const n = await kb.get('/api/notifications');
  assert.ok(n.body.items.some((x: { type: string }) => x.type === 'CASHBACK_PAID'));
  const slip = await kb.get(`/api/payments/${p2.body.id}/slip.txt`);
  assert.equal(slip.status, 200);
  assert.match(slip.text, /SLIP PEMBAYARAN/);
  assert.match(slip.text, /BCA 111/);
  // KB Palembang tidak bisa melihat pembayaran Jakarta
  const kbp = await login(app, 'kbp@t.local', PASS);
  assert.equal((await kbp.get(`/api/payments/${p2.body.id}`)).status, 404);
});

test('SUCCESS langsung (tunai) + diagnostik PO draft & sudah lunas', async () => {
  const sa = await login(app, 'sa@t.local', PASS);
  const r = await sa.post('/api/payments').send(pay({ distributionIds: [dP1], metode: 'CASH', status: 'SUCCESS', referensi: '' }));
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(r.body.status, 'SUCCESS');
  assert.equal((await prisma.cashbackDistribution.findUniqueOrThrow({ where: { id: dP1 } })).status, 'PAID');
  assert.equal((await sa.post('/api/payments').send(pay({ distributionIds: [dP1], metode: 'CASH' }))).status, 409);

  const el = await sa.get('/api/payments/eligibility?poNumber=PO-1');
  const ep = el.body.branches.find((b: { branch: { id: number } }) => b.branch.id === plb);
  assert.match(ep.reasons[0], /Sudah dibayar lunas/);
  // Cabang Jakarta masih punya item periode Oktober yang belum dibayar
  const ej = el.body.branches.find((b: { branch: { id: number } }) => b.branch.id === jkt);
  assert.equal(ej.ok, true);
  assert.equal(ej.unpaidKabeng, '10');
  const dr = await sa.get('/api/payments/eligibility?poNumber=PO-DRAFT');
  assert.match(dr.body.branches[0].reasons[0], /Draft/);
  // Klaim yang sudah dibayar tidak bisa dibatalkan
  assert.equal((await sa.delete(`/api/cashback/${receiptId}`)).status, 400);
});

test('pembayaran bersamaan untuk item yang sama: hanya satu berhasil', async () => {
  const sa = await login(app, 'sa@t.local', PASS);
  const oct = await prisma.cashbackDistribution.findFirstOrThrow({ where: { periode: '2026-10' } });
  const body = pay({ periode: '2026-10', distributionIds: [oct.id] });
  const rs = await Promise.all([sa.post('/api/payments').send(body), sa.post('/api/payments').send(body), sa.post('/api/payments').send(body)]);
  assert.deepEqual(rs.map((r) => r.status).sort(), [201, 409, 409]);
});
