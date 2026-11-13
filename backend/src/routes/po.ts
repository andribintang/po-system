import { Router, type Request } from 'express';
import ExcelJS from 'exceljs';
import { z } from 'zod';
import { Prisma, type POStatus } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { ah, HttpError, notFound } from '../lib/errors';
import { audit } from '../lib/audit';
import { idParam, optStr } from '../lib/http';
import { requireRole, branchScope } from '../middleware/auth';
import { addSheet, excelUpload, ImportError, readRows, sendWorkbook } from '../lib/excel';
import { allowedTransitions, PO_STATUS_LABEL, PO_TRANSITIONS } from '../lib/poRules';
import { assertCanAct, buildPO, changeStatus, createPO, poSchema, type POInput } from '../lib/poService';

const router = Router();
router.use(requireRole('SUPER_ADMIN', 'ADMIN'));

const STATUSES = Object.keys(PO_TRANSITIONS) as [POStatus, ...POStatus[]];

const listSchema = z.object({
  q: z.string().trim().optional(),
  status: z.enum(STATUSES).optional(),
  vendorId: z.coerce.number().int().positive().optional(),
  branchId: z.coerce.number().int().positive().optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(20),
});

/** Admin cabang melihat PO cabangnya + PO multi cabang yang memuat cabangnya. */
function scopeWhere(req: Request): Prisma.PurchaseOrderWhereInput {
  const b = branchScope(req.user!);
  if (b === null) return {};
  return { OR: [{ branchId: b }, { isMulti: true, details: { some: { branchId: b } } }] };
}

function buildWhere(req: Request, q: z.infer<typeof listSchema>): Prisma.PurchaseOrderWhereInput {
  return {
    AND: [
      { deletedAt: null },
      scopeWhere(req),
      q.status ? { status: q.status } : {},
      q.vendorId ? { vendorId: q.vendorId } : {},
      q.branchId ? { OR: [{ branchId: q.branchId }, { details: { some: { branchId: q.branchId } } }] } : {},
      q.from || q.to
        ? {
            tanggalPo: {
              ...(q.from ? { gte: new Date(`${q.from}T00:00:00Z`) } : {}),
              ...(q.to ? { lte: new Date(`${q.to}T00:00:00Z`) } : {}),
            },
          }
        : {},
      q.q ? { OR: [{ poNumber: { contains: q.q } }, { catatan: { contains: q.q } }] } : {},
    ],
  };
}

const listInclude = {
  vendor: { select: { id: true, kodeVendor: true, namaVendor: true } },
  branch: { select: { id: true, kodeCabang: true, namaCabang: true } },
  createdBy: { select: { id: true, nama: true } },
  _count: { select: { receiptPOs: true, details: true } },
} satisfies Prisma.PurchaseOrderInclude;

const detailInclude = {
  ...listInclude,
  approvedBy: { select: { id: true, nama: true } },
  details: {
    include: {
      branch: { select: { id: true, kodeCabang: true, namaCabang: true } },
      product: { select: { id: true, kodeProduk: true, unit: true, merek: true } },
    },
    orderBy: [{ branchId: 'asc' }, { id: 'asc' }],
  },
  statusHistories: { include: { user: { select: { nama: true } } }, orderBy: { id: 'asc' } },
} satisfies Prisma.PurchaseOrderInclude;

router.get(
  '/',
  ah(async (req, res) => {
    const q = listSchema.parse(req.query);
    const where = buildWhere(req, q);
    const [items, total, sum] = await Promise.all([
      prisma.purchaseOrder.findMany({
        where,
        include: listInclude,
        orderBy: [{ tanggalPo: 'desc' }, { id: 'desc' }],
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      prisma.purchaseOrder.count({ where }),
      prisma.purchaseOrder.aggregate({ where, _sum: { grandTotal: true, totalPcs: true } }),
    ]);
    res.json({
      items: items.map((p) => ({ ...p, cashbackClaimed: p._count.receiptPOs > 0 })),
      total,
      page: q.page,
      pageSize: q.pageSize,
      summary: { grandTotal: sum._sum.grandTotal ?? '0', totalPcs: sum._sum.totalPcs ?? 0 },
    });
  }),
);

/** Daftar aturan status (untuk ditampilkan di frontend). */
router.get('/meta/transitions', (req, res) => {
  res.json({ labels: PO_STATUS_LABEL, transitions: PO_TRANSITIONS });
});

// ───────────── Excel (didaftarkan sebelum /:id) ─────────────

router.get(
  '/export.xlsx',
  ah(async (req, res) => {
    const q = listSchema.parse(req.query);
    const pos = await prisma.purchaseOrder.findMany({
      where: buildWhere(req, q),
      include: detailInclude,
      orderBy: [{ tanggalPo: 'asc' }, { id: 'asc' }],
      take: 5000,
    });
    const wb = new ExcelJS.Workbook();
    addSheet(
      wb,
      'Summary',
      ['NO_PO', 'TANGGAL', 'VENDOR', 'CABANG', 'STATUS', 'TOTAL_DUS', 'TOTAL_PCS', 'GRAND_TOTAL', 'DIBUAT_OLEH', 'DISETUJUI_OLEH', 'CATATAN'],
      pos.map((p) => [
        p.poNumber,
        p.tanggalPo.toISOString().slice(0, 10),
        p.vendor.namaVendor,
        p.isMulti ? 'MULTI CABANG' : p.branch?.namaCabang ?? '',
        PO_STATUS_LABEL[p.status],
        p.totalDus,
        p.totalPcs,
        Number(p.grandTotal),
        p.createdBy.nama,
        p.approvedBy?.nama ?? '',
        p.catatan ?? '',
      ]),
    );
    addSheet(
      wb,
      'Details',
      ['NO_PO', 'TANGGAL', 'VENDOR', 'KODE_CABANG', 'CABANG', 'KODE_PRODUK', 'NAMA_PRODUK', 'QTY_DUS', 'ISI_PER_DUS', 'TOTAL_PCS', 'HARGA_PER_PCS', 'SUBTOTAL'],
      pos.flatMap((p) =>
        p.details.map((d) => [
          p.poNumber,
          p.tanggalPo.toISOString().slice(0, 10),
          p.vendor.namaVendor,
          d.branch.kodeCabang,
          d.branch.namaCabang,
          d.product.kodeProduk,
          d.namaProduk,
          d.qtyDus,
          d.isiPerDus,
          d.totalPcs,
          Number(d.harga),
          Number(d.subtotal),
        ]),
      ),
    );
    await sendWorkbook(res, wb, `purchase-order-${new Date().toISOString().slice(0, 10)}.xlsx`);
  }),
);

const IMPORT_HEADERS = ['REF_PO', 'TANGGAL', 'KODE_VENDOR', 'KODE_CABANG', 'KODE_PRODUK', 'QTY_DUS', 'HARGA_PER_PCS', 'CATATAN'];

router.get(
  '/import-template.xlsx',
  ah(async (_req, res) => {
    const wb = new ExcelJS.Workbook();
    addSheet(wb, 'Import PO', IMPORT_HEADERS, [
      ['A1', '2026-11-13', 'VND-001', 'CBG-JKT', 'CHM-001', 10, '', 'Contoh PO single cabang'],
      ['A1', '2026-11-13', 'VND-001', 'CBG-JKT', 'CHM-002', 5, 29500, ''],
      ['B1', '2026-11-13', 'VND-001', 'CBG-JKT', 'CHM-001', 4, '', 'Contoh PO multi cabang (Super Admin)'],
      ['B1', '2026-11-13', 'VND-001', 'CBG-PLB', 'CHM-001', 6, '', ''],
    ]);
    addSheet(wb, 'Petunjuk', ['KOLOM', 'KETERANGAN'], [
      ['REF_PO', 'Penanda pengelompokan. Baris dengan REF_PO sama menjadi satu PO.'],
      ['TANGGAL', 'Format YYYY-MM-DD.'],
      ['KODE_VENDOR', 'Harus sama untuk semua baris dalam satu REF_PO.'],
      ['KODE_CABANG', 'Bila dalam satu REF_PO ada lebih dari satu cabang, PO dibuat sebagai multi cabang (khusus Super Admin).'],
      ['KODE_PRODUK', 'Produk harus milik vendor tersebut.'],
      ['QTY_DUS', 'Jumlah dus (bilangan bulat).'],
      ['HARGA_PER_PCS', 'Opsional. Kosongkan untuk memakai harga beli master produk.'],
      ['CATATAN', 'Opsional, diambil dari baris pertama tiap REF_PO.'],
      ['', 'Semua PO hasil impor berstatus DRAFT. Bila ada satu baris salah, seluruh impor dibatalkan.'],
    ]);
    await sendWorkbook(res, wb, 'template-import-po.xlsx');
  }),
);

router.post(
  '/import',
  excelUpload,
  ah(async (req, res) => {
    const rows = await readRows(req.file!.buffer);
    if (!rows.length) throw new HttpError(400, 'Tidak ada baris data di file');
    const missing = IMPORT_HEADERS.filter((h) => !['HARGA_PER_PCS', 'CATATAN'].includes(h) && !(h in rows[0].values));
    if (missing.length) throw new HttpError(400, `Kolom wajib tidak ditemukan: ${missing.join(', ')}`);

    const [vendors, branches, products] = await Promise.all([
      prisma.vendor.findMany({ where: { deletedAt: null }, select: { id: true, kodeVendor: true } }),
      prisma.branch.findMany({ where: { deletedAt: null }, select: { id: true, kodeCabang: true } }),
      prisma.product.findMany({ where: { deletedAt: null }, select: { id: true, kodeProduk: true } }),
    ]);
    const vmap = new Map(vendors.map((v) => [v.kodeVendor, v.id]));
    const bmap = new Map(branches.map((b) => [b.kodeCabang, b.id]));
    const pmap = new Map(products.map((p) => [p.kodeProduk, p.id]));

    const errors: { row: number; message: string }[] = [];
    const groups = new Map<string, { firstRow: number; rows: typeof rows }>();
    for (const r of rows) {
      const v = r.values;
      const ref = v.REF_PO;
      if (!ref) {
        errors.push({ row: r.rowNumber, message: 'REF_PO kosong' });
        continue;
      }
      const g = groups.get(ref) ?? { firstRow: r.rowNumber, rows: [] };
      g.rows.push(r);
      groups.set(ref, g);
    }

    const inputs: { ref: string; firstRow: number; input: POInput }[] = [];
    for (const [ref, g] of groups) {
      const first = g.rows[0].values;
      const vendorId = vmap.get(first.KODE_VENDOR?.toUpperCase());
      if (!vendorId) errors.push({ row: g.firstRow, message: `Kode vendor "${first.KODE_VENDOR}" tidak ditemukan` });
      const items: POInput['items'] = [];
      const branchSet = new Set<number>();
      for (const r of g.rows) {
        const v = r.values;
        if (v.KODE_VENDOR?.toUpperCase() !== first.KODE_VENDOR?.toUpperCase()) {
          errors.push({ row: r.rowNumber, message: `Vendor berbeda dalam REF_PO ${ref}` });
        }
        if (v.TANGGAL !== first.TANGGAL) errors.push({ row: r.rowNumber, message: `Tanggal berbeda dalam REF_PO ${ref}` });
        const branchId = bmap.get(v.KODE_CABANG?.toUpperCase());
        const productId = pmap.get(v.KODE_PRODUK?.toUpperCase());
        const qty = Number(v.QTY_DUS);
        if (!branchId) errors.push({ row: r.rowNumber, message: `Kode cabang "${v.KODE_CABANG}" tidak ditemukan` });
        if (!productId) errors.push({ row: r.rowNumber, message: `Kode produk "${v.KODE_PRODUK}" tidak ditemukan` });
        if (!Number.isInteger(qty) || qty < 1) errors.push({ row: r.rowNumber, message: 'QTY_DUS harus bilangan bulat ≥ 1' });
        const harga = v.HARGA_PER_PCS ? Number(v.HARGA_PER_PCS) : null;
        if (harga !== null && (!Number.isFinite(harga) || harga < 0)) errors.push({ row: r.rowNumber, message: 'HARGA_PER_PCS tidak valid' });
        if (branchId) branchSet.add(branchId);
        items.push({ productId: productId ?? 0, branchId: branchId ?? null, qtyDus: qty, harga: harga === null ? null : harga.toFixed(2) });
      }
      const isMulti = branchSet.size > 1;
      inputs.push({
        ref,
        firstRow: g.firstRow,
        input: {
          tanggalPo: first.TANGGAL,
          vendorId: vendorId ?? 0,
          isMulti,
          branchId: isMulti ? null : [...branchSet][0] ?? null,
          catatan: first.CATATAN || null,
          items,
        },
      });
    }
    if (errors.length) throw new ImportError(errors);

    // Validasi penuh tiap PO (hak akses, vendor-produk, dsb) sebelum menyimpan apa pun.
    for (const it of inputs) {
      const parsed = poSchema.safeParse(it.input);
      if (!parsed.success) {
        errors.push({ row: it.firstRow, message: `REF_PO ${it.ref}: ${parsed.error.issues.map((i) => i.message).join(', ')}` });
        continue;
      }
      it.input = parsed.data;
      try {
        await buildPO(req.user!, it.input);
      } catch (e) {
        errors.push({ row: it.firstRow, message: `REF_PO ${it.ref}: ${(e as Error).message}` });
      }
    }
    if (errors.length) throw new ImportError(errors);

    const created = await prisma.$transaction(
      async (tx) => {
        const out: { ref: string; poNumber: string; id: number }[] = [];
        for (const it of inputs) {
          const po = await createPO(req, it.input, tx);
          out.push({ ref: it.ref, poNumber: po.poNumber, id: po.id });
        }
        return out;
      },
      { timeout: 60_000 },
    );
    await audit(req, { aksi: 'IMPORT_PO', modul: 'PO', dataBaru: { file: req.file!.originalname, jumlah: created.length } });
    res.status(201).json({ created });
  }),
);

// ───────────── Aksi massal (Super Admin) ─────────────

const bulkSchema = z.object({ ids: z.array(z.coerce.number().int().positive()).min(1).max(500) });

router.post(
  '/bulk-status',
  requireRole('SUPER_ADMIN'),
  ah(async (req, res) => {
    const { ids, to, catatan } = bulkSchema.extend({ to: z.enum(STATUSES), catatan: optStr(255) }).parse(req.body);
    // Diproses satu per satu: PO yang gagal tidak membatalkan PO lain.
    const results: { id: number; ok: boolean; message?: string }[] = [];
    for (const id of ids) {
      try {
        await prisma.$transaction((tx) => changeStatus(req, id, to, catatan, tx));
        results.push({ id, ok: true });
      } catch (e) {
        results.push({ id, ok: false, message: (e as Error).message });
      }
    }
    res.json({ results, success: results.filter((r) => r.ok).length, failed: results.filter((r) => !r.ok).length });
  }),
);

router.post(
  '/bulk-delete',
  requireRole('SUPER_ADMIN'),
  ah(async (req, res) => {
    const { ids } = bulkSchema.parse(req.body);
    const pos = await prisma.purchaseOrder.findMany({ where: { id: { in: ids }, deletedAt: null } });
    const deletable = pos.filter((p) => p.status === 'DRAFT' || p.status === 'CANCEL');
    await prisma.purchaseOrder.updateMany({ where: { id: { in: deletable.map((p) => p.id) } }, data: { deletedAt: new Date() } });
    await audit(req, { aksi: 'BULK_DELETE_PO', modul: 'PO', dataLama: deletable.map((p) => p.poNumber) });
    res.json({
      deleted: deletable.length,
      skipped: pos.filter((p) => !deletable.includes(p)).map((p) => ({ id: p.id, poNumber: p.poNumber, status: p.status })),
    });
  }),
);

// ───────────── CRUD satu PO ─────────────

router.get(
  '/:id',
  ah(async (req, res) => {
    const po = await prisma.purchaseOrder.findFirst({
      where: { AND: [{ id: idParam(req), deletedAt: null }, scopeWhere(req)] },
      include: detailInclude,
    });
    if (!po) throw notFound('PO');
    const user = req.user!;
    const canAct = user.role === 'SUPER_ADMIN' || (!po.isMulti && po.branchId === user.branchId);
    res.json({
      ...po,
      cashbackClaimed: po._count.receiptPOs > 0,
      canEdit: canAct && po.status === 'DRAFT',
      canDelete: canAct && (po.status === 'DRAFT' || (user.role === 'SUPER_ADMIN' && po.status === 'CANCEL')),
      allowedTransitions: canAct ? allowedTransitions(po.status, user.role) : [],
    });
  }),
);

router.post(
  '/',
  ah(async (req, res) => {
    const data = poSchema.parse(req.body);
    const po = await prisma.$transaction((tx) => createPO(req, data, tx));
    res.status(201).json(po);
  }),
);

router.put(
  '/:id',
  ah(async (req, res) => {
    const id = idParam(req);
    const data = poSchema.parse(req.body);
    const old = await prisma.purchaseOrder.findFirst({ where: { id, deletedAt: null }, include: { details: true } });
    if (!old) throw notFound('PO');
    assertCanAct(req.user!, old);
    if (old.status !== 'DRAFT') throw new HttpError(400, 'Hanya PO berstatus Draft yang bisa diedit');
    if (old.isMulti !== data.isMulti) throw new HttpError(400, 'Tipe PO (single/multi) tidak bisa diubah setelah dibuat');
    if (!old.isMulti && old.branchId !== data.branchId) throw new HttpError(400, 'Cabang PO tidak bisa diubah, buat PO baru');
    const built = await buildPO(req.user!, data);
    const updated = await prisma.$transaction(async (tx) => {
      await tx.pODetail.deleteMany({ where: { poId: id } });
      const po = await tx.purchaseOrder.update({
        where: { id },
        data: { ...built.header, details: { create: built.details } },
      });
      if (data.submit) await changeStatus(req, id, 'MENUNGGU_APPROVAL', null, tx);
      await audit(req, { aksi: 'UPDATE_PO', modul: 'PO', refId: old.poNumber, dataLama: old, dataBaru: { ...po, details: built.details } }, tx);
      return po;
    });
    res.json(updated);
  }),
);

router.post(
  '/:id/status',
  ah(async (req, res) => {
    const { to, catatan } = z.object({ to: z.enum(STATUSES), catatan: optStr(255) }).parse(req.body);
    const po = await prisma.$transaction((tx) => changeStatus(req, idParam(req), to, catatan, tx));
    res.json(po);
  }),
);

router.delete(
  '/:id',
  ah(async (req, res) => {
    const id = idParam(req);
    const po = await prisma.purchaseOrder.findFirst({ where: { id, deletedAt: null } });
    if (!po) throw notFound('PO');
    assertCanAct(req.user!, po);
    const ok = po.status === 'DRAFT' || (req.user!.role === 'SUPER_ADMIN' && po.status === 'CANCEL');
    if (!ok) throw new HttpError(400, 'Hanya PO Draft (atau Cancel, oleh Super Admin) yang bisa dihapus');
    await prisma.purchaseOrder.update({ where: { id }, data: { deletedAt: new Date() } });
    await audit(req, { aksi: 'DELETE_PO', modul: 'PO', refId: po.poNumber, dataLama: po });
    res.json({ ok: true });
  }),
);

export default router;
