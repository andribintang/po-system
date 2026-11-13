import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import { createApp } from '../src/app';
import { prisma } from '../src/lib/prisma';
import { login, resetDb } from './helpers';

process.env.NODE_ENV = 'test';
const app = createApp();
const PASS = 'Rahasia123';

let jkt: number, plb: number, vendorA: number, vendorB: number, p1: number, p2: number;
let poSingle: number, poMulti: number, poDraft: number, poOtherVendor: number;

before(async () => {
  await resetDb();
  const hash = await bcrypt.hash(PASS, 4);
  const jawa = await prisma.area.create({ data: { kodeArea: 'JAWA', namaArea: 'Jawa' } });
  const sks = await prisma.area.create({ data: { kodeArea: 'SKS', namaArea: 'SKS' } });
  jkt = (await prisma.branch.create({ data: { kodeCabang: 'CBG-JKT', namaCabang: 'Jakarta', areaId: jawa.id } })).id;
  plb = (await prisma.branch.create({ data: { kodeCabang: 'CBG-PLB', namaCabang: 'Palembang', areaId: sks.id } })).id;
  vendorA = (await prisma.vendor.create({ data: { kodeVendor: 'VND-A', namaVendor: 'Vendor A' } })).id;
  vendorB = (await prisma.vendor.create({ data: { kodeVendor: 'VND-B', namaVendor: 'Vendor B' } })).id;
  // P1: default 3000/2000/1000, area SKS 3500/2500/1000
  p1 = (
    await prisma.product.create({
      data: {
        kodeProduk: 'P1', namaProduk: 'Produk 1', vendorId: vendorA, isiPerDus: 24, hargaBeli: '10000',
        feeVendorPerPcs: '3000', feeKabengPerPcs: '2000', feePerusahaanPerPcs: '1000',
        areaFees: { create: [{ areaId: sks.id, feeVendorPerPcs: '3500', feeKabengPerPcs: '2500', feePerusahaanPerPcs: '1000' }] },
      },
    })
  ).id;
  p2 = (
    await prisma.product.create({
      data: { kodeProduk: 'P2', namaProduk: 'Produk 2', vendorId: vendorA, isiPerDus: 36, hargaBeli: '5000', feeVendorPerPcs: '1500.50', feeKabengPerPcs: '1000.25', feePerusahaanPerPcs: '500.25' },
    })
  ).id;
  const pB = (
    await prisma.product.create({
      data: { kodeProduk: 'PB', namaProduk: 'Produk B', vendorId: vendorB, isiPerDus: 24, hargaBeli: '1', feeVendorPerPcs: '1', feeKabengPerPcs: '1', feePerusahaanPerPcs: '0' },
    })
  ).id;
  const kb = await prisma.employee.create({ data: { nama: 'KB Jkt', branchId: jkt, jabatan: 'KEPALA_BENGKEL' } });
  await prisma.user.createMany({
    data: [
      { nama: 'SA', email: 'sa@t.local', role: 'SUPER_ADMIN', passwordHash: hash },
      { nama: 'Adm JKT', email: 'jkt@t.local', role: 'ADMIN', branchId: jkt, passwordHash: hash },
      { nama: 'Adm PLB', email: 'plb@t.local', role: 'ADMIN', branchId: plb, passwordHash: hash },
      { nama: 'KB JKT', email: 'kb@t.local', role: 'KEPALA_BENGKEL', branchId: jkt, employeeId: kb.id, passwordHash: hash },
    ],
  });
  const sa = await prisma.user.findUniqueOrThrow({ where: { email: 'sa@t.local' } });
  const mk = async (status: 'APPROVED' | 'DRAFT', vendorId: number, isMulti: boolean, lines: [number, number, number][], no: string) =>
    (
      await prisma.purchaseOrder.create({
        data: {
          poNumber: no, tanggalPo: new Date('2026-11-01'), vendorId, isMulti, branchId: isMulti ? null : lines[0][1], status, createdById: sa.id,
          details: {
            create: lines.map(([productId, branchId, dus]) => ({
              productId, branchId, namaProduk: 'x', qtyDus: dus, isiPerDus: productId === p2 ? 36 : 24, totalPcs: dus * (productId === p2 ? 36 : 24), harga: '1', subtotal: '1',
            })),
          },
        },
      })
    ).id;
  poSingle = await mk('APPROVED', vendorA, false, [[p1, jkt, 2], [p2, jkt, 1]], 'PO-S');
  poMulti = await mk('APPROVED', vendorA, true, [[p1, jkt, 1], [p1, plb, 2]], 'PO-M');
  poDraft = await mk('DRAFT', vendorA, false, [[p1, jkt, 1]], 'PO-D');
  poOtherVendor = await mk('APPROVED', vendorB, false, [[pB, jkt, 1]], 'PO-B');
});
after(async () => prisma.$disconnect());

const claim = (over: Record<string, unknown>) => ({
  vendorId: vendorA, periode: '2026-11', tanggal: '2026-11-20', metodePengiriman: 'TRANSFER', ...over,
});

test('daftar PO layak klaim: hanya Approved ke atas, dipecah per cabang, sesuai scope admin', async () => {
  const sa = await login(app, 'sa@t.local', PASS);
  const r = await sa.get(`/api/cashback/eligible?vendorId=${vendorA}`);
  const keys = r.body.items.map((i: { poNumber: string; branchId: number }) => `${i.poNumber}@${i.branchId}`).sort();
  assert.deepEqual(keys, [`PO-M@${jkt}`, `PO-M@${plb}`, `PO-S@${jkt}`].sort());
  const plbAdm = await login(app, 'plb@t.local', PASS);
  const r2 = await plbAdm.get(`/api/cashback/eligible?vendorId=${vendorA}`);
  assert.deepEqual(r2.body.items.map((i: { poNumber: string }) => i.poNumber), ['PO-M']);
});

test('pratinjau: tarif area (SKS) vs default (Jawa), Decimal tepat', async () => {
  const sa = await login(app, 'sa@t.local', PASS);
  const r = await sa.post('/api/cashback/preview').send({ vendorId: vendorA, poBranches: [{ poId: poMulti, branchId: jkt }, { poId: poMulti, branchId: plb }, { poId: poSingle, branchId: jkt }] });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const plbLine = r.body.lines.find((l: { branchId: number }) => l.branchId === plb);
  assert.equal(plbLine.feeSource, 'AREA');
  assert.equal(plbLine.totalVendor, '168000'); // 48 × 3500
  assert.equal(plbLine.totalKabeng, '120000');
  const p2Line = r.body.lines.find((l: { productId: number }) => l.productId === p2);
  assert.equal(p2Line.totalKabeng, '36009'); // 36 × 1000.25
  // Vendor: 24×3000 (multi jkt) + 48×3500 + 48×3000 + 36×1500.50
  assert.equal(r.body.totals.vendor, String(72000 + 168000 + 144000 + 54018));
});

test('validasi: PO draft, vendor beda, admin cabang lain, produk vendor lain di baris manual', async () => {
  const sa = await login(app, 'sa@t.local', PASS);
  assert.equal((await sa.post('/api/cashback').send(claim({ poBranches: [{ poId: poDraft, branchId: jkt }] }))).status, 400);
  assert.equal((await sa.post('/api/cashback').send(claim({ poBranches: [{ poId: poOtherVendor, branchId: jkt }] }))).status, 400);
  assert.equal((await sa.post('/api/cashback').send(claim({ poBranches: [] }))).status, 400);
  const plbAdm = await login(app, 'plb@t.local', PASS);
  assert.equal((await plbAdm.post('/api/cashback').send(claim({ poBranches: [{ poId: poSingle, branchId: jkt }] }))).status, 403);
  const pB = (await prisma.product.findUniqueOrThrow({ where: { kodeProduk: 'PB' } })).id;
  assert.equal((await sa.post('/api/cashback').send(claim({ manualLines: [{ branchId: jkt, productId: pB, qtyPcs: 10 }] }))).status, 400);
  const kb = await login(app, 'kb@t.local', PASS);
  assert.equal((await kb.post('/api/cashback').send(claim({ poBranches: [{ poId: poSingle, branchId: jkt }] }))).status, 403);
});

test('simpan klaim → distribusi UNPAID per cabang & produk, notifikasi, dan PO tidak bisa diklaim dobel', async () => {
  const adm = await login(app, 'jkt@t.local', PASS);
  const r = await adm.post('/api/cashback').send(claim({ poBranches: [{ poId: poSingle, branchId: jkt }], catatan: 'transfer vendor' }));
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(r.body.receiptNo, 'CB/202611/0001');
  assert.equal(r.body.totalCashback, String(144000 + 54018));

  const dist = await prisma.cashbackDistribution.findMany({ where: { receiptId: r.body.id }, orderBy: { productId: 'asc' } });
  assert.equal(dist.length, 2);
  assert.ok(dist.every((d) => d.status === 'UNPAID' && d.branchId === jkt && d.poId === poSingle));
  assert.equal(dist[0].totalFeeKabeng.toString(), '96000');

  // Klaim ulang ditolak
  const again = await adm.post('/api/cashback').send(claim({ poBranches: [{ poId: poSingle, branchId: jkt }] }));
  assert.equal(again.status, 409);
  // Badge PO: sudah diklaim
  const po = await adm.get(`/api/po/${poSingle}`);
  assert.equal(po.body.cashbackClaimed, true);

  // Kepala Bengkel melihat notifikasi cashback & distribusi cabangnya
  const kb = await login(app, 'kb@t.local', PASS);
  const n = await kb.get('/api/notifications');
  assert.ok(n.body.items.some((x: { type: string }) => x.type === 'CASHBACK_RECEIVED'));
  const d = await kb.get('/api/cashback/distributions');
  assert.equal(d.body.total, 2);
  assert.equal(d.body.summary.UNPAID.kabeng, '132009');
});

test('klaim bersamaan untuk PO yang sama: hanya satu yang berhasil', async () => {
  const sa = await login(app, 'sa@t.local', PASS);
  const body = claim({ poBranches: [{ poId: poMulti, branchId: plb }] });
  const rs = await Promise.all([sa.post('/api/cashback').send(body), sa.post('/api/cashback').send(body), sa.post('/api/cashback').send(body)]);
  const codes = rs.map((r) => r.status).sort();
  assert.deepEqual(codes, [201, 409, 409]);
});

test('klaim PO multi per cabang + baris manual; admin PLB hanya melihat bagiannya', async () => {
  const sa = await login(app, 'sa@t.local', PASS);
  const r = await sa.post('/api/cashback').send(claim({
    poBranches: [{ poId: poMulti, branchId: jkt }],
    manualLines: [{ branchId: plb, productId: p2, qtyPcs: 10 }],
    metodePengiriman: 'CASH',
  }));
  assert.equal(r.status, 201, JSON.stringify(r.body));
  const plbAdm = await login(app, 'plb@t.local', PASS);
  const det = await plbAdm.get(`/api/cashback/${r.body.id}`);
  assert.equal(det.status, 200);
  assert.ok(det.body.distributions.every((d: { branchId: number }) => d.branchId === plb));
  assert.equal(det.body.distributions[0].poId, null);
  // Semua cabang PO multi sudah diklaim → tidak ada lagi di daftar layak
  const el = await sa.get(`/api/cashback/eligible?vendorId=${vendorA}`);
  assert.equal(el.body.items.length, 0);
});

test('batalkan klaim (Super Admin) melepas PO agar bisa diklaim ulang; ditolak bila sudah dibayar', async () => {
  const sa = await login(app, 'sa@t.local', PASS);
  const list = await sa.get('/api/cashback?q=CB/202611/0001');
  const id = list.body.items[0].id;
  const adm = await login(app, 'jkt@t.local', PASS);
  assert.equal((await adm.delete(`/api/cashback/${id}`)).status, 403);
  assert.equal((await sa.delete(`/api/cashback/${id}`)).status, 200);
  const el = await sa.get(`/api/cashback/eligible?vendorId=${vendorA}`);
  assert.equal(el.body.items.length, 1);
  const r = await sa.post('/api/cashback').send(claim({ poBranches: [{ poId: poSingle, branchId: jkt }] }));
  assert.equal(r.status, 201);
  await prisma.cashbackDistribution.updateMany({ where: { receiptId: r.body.id }, data: { status: 'PAID' } });
  assert.equal((await sa.delete(`/api/cashback/${r.body.id}`)).status, 400);
  // PO yang sudah diklaim tidak bisa di-cancel
  assert.equal((await sa.post(`/api/po/${poSingle}/status`).send({ to: 'CANCEL' })).status, 400);
});
