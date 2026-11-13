import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { ah } from '../lib/errors';
import { branchScope, requireRole } from '../middleware/auth';
import { PO_STATUS_LABEL } from '../lib/poRules';
import { sendTable, type Cell } from '../lib/tabular';

/**
 * Laporan manajemen: Rekap PO, Cashback Vendor Diterima, Pembayaran Manual & Tunai.
 * Super Admin nasional, Admin hanya cabangnya. `format=csv|xlsx` untuk unduhan.
 */
const router = Router();
router.use(requireRole('SUPER_ADMIN', 'ADMIN'));

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Tanggal harus YYYY-MM-DD');
const filters = z.object({
  from: date.optional(),
  to: date.optional(),
  vendorId: z.coerce.number().int().positive().optional(),
  branchId: z.coerce.number().int().positive().optional(),
  status: z.string().trim().optional(),
  format: z.enum(['json', 'csv', 'xlsx']).default('json'),
});
type Filters = z.infer<typeof filters>;

function parse(req: Request): Filters & { b: number | null } {
  const f = filters.parse(req.query);
  return { ...f, b: branchScope(req.user!) ?? f.branchId ?? null };
}
function range(f: Filters) {
  if (!f.from && !f.to) return undefined;
  return { ...(f.from ? { gte: new Date(f.from) } : {}), ...(f.to ? { lte: new Date(f.to) } : {}) };
}
const D = (v: Prisma.Decimal | null | undefined) => new Prisma.Decimal(v ?? 0);
const sum = (xs: Prisma.Decimal[]) => xs.reduce((a, x) => a.add(x), new Prisma.Decimal(0));
const ymd = (d: Date) => d.toISOString().slice(0, 10);
const stamp = () => new Date().toISOString().slice(0, 10).replace(/-/g, '');

interface Col<T> { h: string; v: (r: T) => Cell }
async function respond<T>(res: Response, f: Filters, title: string, file: string, cols: Col<T>[], rows: T[], totals: Record<string, unknown>) {
  if (f.format === 'json') return res.json({ title, items: rows, totals });
  await sendTable(res, { title, filename: `${file}-${stamp()}`, headers: cols.map((c) => c.h), rows: rows.map((r) => cols.map((c) => c.v(r))) }, f.format);
}

// ---------------------------------------------------------------- Rekap PO
router.get(
  '/po',
  ah(async (req, res) => {
    const f = parse(req);
    const pos = await prisma.purchaseOrder.findMany({
      where: {
        deletedAt: null,
        ...(range(f) ? { tanggalPo: range(f) } : {}),
        ...(f.vendorId ? { vendorId: f.vendorId } : {}),
        ...(f.status && f.status !== 'ALL' ? { status: f.status as never } : {}),
        ...(f.b ? { details: { some: { branchId: f.b } } } : {}),
      },
      orderBy: [{ tanggalPo: 'asc' }, { id: 'asc' }],
      include: {
        vendor: { select: { namaVendor: true } },
        branch: { select: { namaCabang: true } },
        details: { select: { branchId: true, qtyDus: true, totalPcs: true, subtotal: true } },
        createdBy: { select: { nama: true } },
      },
    });
    const rows = pos.map((p) => {
      const ds = f.b ? p.details.filter((d) => d.branchId === f.b) : p.details;
      return {
        id: p.id,
        poNumber: p.poNumber,
        tanggalPo: ymd(p.tanggalPo),
        vendor: p.vendor.namaVendor,
        cabang: p.isMulti ? (f.b ? 'Multi (porsi cabang)' : 'Multi Cabang') : p.branch?.namaCabang ?? '-',
        status: p.status,
        statusLabel: PO_STATUS_LABEL[p.status],
        totalDus: ds.reduce((a, d) => a + d.qtyDus, 0),
        totalPcs: ds.reduce((a, d) => a + d.totalPcs, 0),
        nilai: sum(ds.map((d) => d.subtotal)).toString(),
        dibuatOleh: p.createdBy.nama,
      };
    });
    const valid = rows.filter((r) => r.status !== 'CANCEL');
    const totals = {
      jumlahPo: rows.length,
      totalDus: valid.reduce((a, r) => a + r.totalDus, 0),
      totalPcs: valid.reduce((a, r) => a + r.totalPcs, 0),
      nilai: sum(valid.map((r) => new Prisma.Decimal(r.nilai))).toString(),
    };
    await respond(res, f, 'Rekap Purchase Order', 'rekap-po', [
      { h: 'No PO', v: (r) => r.poNumber },
      { h: 'Tanggal', v: (r) => r.tanggalPo },
      { h: 'Vendor', v: (r) => r.vendor },
      { h: 'Cabang', v: (r) => r.cabang },
      { h: 'Status', v: (r) => r.statusLabel },
      { h: 'Total Dus', v: (r) => r.totalDus },
      { h: 'Total Pcs', v: (r) => r.totalPcs },
      { h: 'Nilai PO', v: (r) => Number(r.nilai) },
      { h: 'Dibuat Oleh', v: (r) => r.dibuatOleh },
    ], rows, totals);
  }),
);

// ---------------------------------------------------------------- Cashback diterima
router.get(
  '/cashback',
  ah(async (req, res) => {
    const f = parse(req);
    const receipts = await prisma.cashbackReceipt.findMany({
      where: {
        deletedAt: null,
        ...(range(f) ? { tanggal: range(f) } : {}),
        ...(f.vendorId ? { vendorId: f.vendorId } : {}),
        ...(f.b ? { distributions: { some: { branchId: f.b } } } : {}),
      },
      orderBy: [{ tanggal: 'asc' }, { id: 'asc' }],
      include: {
        vendor: { select: { namaVendor: true } },
        pos: { select: { branchId: true } },
        distributions: { select: { branchId: true, status: true, totalFeeKabeng: true, totalFeePerusahaan: true } },
      },
    });
    const rows = receipts.map((r) => {
      const ds = f.b ? r.distributions.filter((d) => d.branchId === f.b) : r.distributions;
      const kb = sum(ds.map((d) => d.totalFeeKabeng));
      const pr = sum(ds.map((d) => d.totalFeePerusahaan));
      return {
        id: r.id,
        receiptNo: r.receiptNo,
        tanggal: ymd(r.tanggal),
        periode: r.periode,
        vendor: r.vendor.namaVendor,
        metode: r.metodePengiriman,
        jumlahPo: (f.b ? r.pos.filter((p) => p.branchId === f.b) : r.pos).length,
        totalCashback: (f.b ? kb.add(pr) : D(r.totalCashback)).toString(),
        hakKabeng: kb.toString(),
        hakPerusahaan: pr.toString(),
        dibayar: sum(ds.filter((d) => d.status === 'PAID').map((d) => d.totalFeeKabeng)).toString(),
        outstanding: sum(ds.filter((d) => d.status === 'UNPAID').map((d) => d.totalFeeKabeng)).toString(),
      };
    });
    const t = (k: 'totalCashback' | 'hakKabeng' | 'hakPerusahaan' | 'dibayar' | 'outstanding') => sum(rows.map((r) => new Prisma.Decimal(r[k]))).toString();
    const totals = { jumlah: rows.length, totalCashback: t('totalCashback'), hakKabeng: t('hakKabeng'), hakPerusahaan: t('hakPerusahaan'), dibayar: t('dibayar'), outstanding: t('outstanding') };
    await respond(res, f, 'Cashback Vendor Diterima', 'cashback-diterima', [
      { h: 'No Klaim', v: (r) => r.receiptNo },
      { h: 'Tanggal', v: (r) => r.tanggal },
      { h: 'Periode', v: (r) => r.periode },
      { h: 'Vendor', v: (r) => r.vendor },
      { h: 'Metode', v: (r) => r.metode },
      { h: 'Jumlah PO', v: (r) => r.jumlahPo },
      { h: 'Total Cashback', v: (r) => Number(r.totalCashback) },
      { h: 'Hak Kepala Bengkel', v: (r) => Number(r.hakKabeng) },
      { h: 'Hak Perusahaan', v: (r) => Number(r.hakPerusahaan) },
      { h: 'Sudah Dibayar', v: (r) => Number(r.dibayar) },
      { h: 'Outstanding', v: (r) => Number(r.outstanding) },
    ], rows, totals);
  }),
);

// ---------------------------------------------------------------- Pembayaran
router.get(
  '/payments',
  ah(async (req, res) => {
    const f = parse(req);
    const metode = z.enum(['TRANSFER_MANUAL', 'CASH']).optional().parse(req.query.metode || undefined);
    const details = await prisma.paymentDetail.findMany({
      where: {
        ...(f.b ? { branchId: f.b } : {}),
        ...(f.status && f.status !== 'ALL' ? { status: f.status as never } : {}),
        payment: { ...(range(f) ? { tanggalBayar: range(f) } : {}), ...(metode ? { metode } : {}) },
      },
      orderBy: [{ payment: { tanggalBayar: 'asc' } }, { id: 'asc' }],
      include: {
        payment: { select: { id: true, paymentNo: true, tanggalBayar: true, periode: true, metode: true, status: true } },
        employee: { select: { nama: true } },
        branch: { select: { namaCabang: true } },
      },
    });
    const rows = details.map((d) => ({
      id: d.id,
      paymentId: d.payment.id,
      paymentNo: d.payment.paymentNo,
      tanggalBayar: ymd(d.payment.tanggalBayar),
      periode: d.payment.periode,
      cabang: d.branch.namaCabang,
      penerima: d.employee.nama,
      rekening: d.bank ? `${d.bank} ${d.rekening ?? ''} a.n. ${d.namaRekening ?? '-'}`.trim() : '-',
      metode: d.payment.metode,
      referensi: d.referensiPembayaran ?? '',
      status: d.status,
      nominal: d.nominal.toString(),
    }));
    const by = (s: string) => sum(rows.filter((r) => r.status === s).map((r) => new Prisma.Decimal(r.nominal))).toString();
    const totals = { jumlah: rows.length, lunas: by('SUCCESS'), pending: by('PENDING'), gagal: by('FAILED') };
    const SL = { PENDING: 'Menunggu Konfirmasi', SUCCESS: 'Lunas', FAILED: 'Gagal' } as Record<string, string>;
    await respond(res, f, 'Pembayaran Manual & Tunai', 'pembayaran-cashback', [
      { h: 'No Pembayaran', v: (r) => r.paymentNo },
      { h: 'Tanggal Bayar', v: (r) => r.tanggalBayar },
      { h: 'Periode', v: (r) => r.periode },
      { h: 'Cabang', v: (r) => r.cabang },
      { h: 'Penerima', v: (r) => r.penerima },
      { h: 'Rekening', v: (r) => r.rekening },
      { h: 'Metode', v: (r) => (r.metode === 'CASH' ? 'Tunai' : 'Transfer Manual') },
      { h: 'Referensi', v: (r) => r.referensi },
      { h: 'Status', v: (r) => SL[r.status] },
      { h: 'Nominal', v: (r) => Number(r.nominal) },
    ], rows, totals);
  }),
);

export default router;
