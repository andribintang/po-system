import { Prisma, type POStatus } from '@prisma/client';
import { z } from 'zod';
import type { Request } from 'express';
import { prisma } from './prisma';
import { HttpError, forbidden } from './errors';
import { money, optStr } from './http';
import { nextNumber, yyyymm } from './counter';
import { audit } from './audit';
import { notify } from './notify';
import { findTransition, PO_STATUS_LABEL } from './poRules';
import type { AuthUser } from '../middleware/auth';

export const poItemSchema = z.object({
  productId: z.coerce.number().int().positive(),
  qtyDus: z.coerce.number().int().min(1, 'Qty minimal 1 dus').max(100_000),
  branchId: z.coerce.number().int().positive().optional().nullable(),
  /** Harga per pcs khusus untuk PO ini. Kosong = pakai harga beli master produk. */
  harga: money.optional().nullable().or(z.literal('').transform(() => null)),
});

export const poSchema = z.object({
  tanggalPo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format tanggal YYYY-MM-DD'),
  vendorId: z.coerce.number().int().positive(),
  isMulti: z.boolean().default(false),
  branchId: z.coerce.number().int().positive().optional().nullable(),
  catatan: optStr(2000),
  items: z.array(poItemSchema).min(1, 'Minimal 1 item produk'),
  /** true = langsung diajukan untuk approval setelah disimpan. */
  submit: z.boolean().optional(),
});
export type POInput = z.infer<typeof poSchema>;

/**
 * Validasi input PO terhadap master data dan hak akses, lalu hitung semua total di server.
 * Harga dan subtotal tidak pernah diambil mentah dari browser.
 */
export async function buildPO(user: AuthUser, d: POInput, db: Prisma.TransactionClient | typeof prisma = prisma) {
  const vendor = await db.vendor.findFirst({ where: { id: d.vendorId, deletedAt: null } });
  if (!vendor || vendor.status !== 'ACTIVE') throw new HttpError(400, 'Vendor tidak ditemukan atau tidak aktif');

  if (d.isMulti && user.role !== 'SUPER_ADMIN') {
    throw new HttpError(403, 'PO multi cabang hanya bisa dibuat oleh Super Admin');
  }

  let headerBranchId: number | null = null;
  if (!d.isMulti) {
    if (!d.branchId) throw new HttpError(400, 'Cabang wajib dipilih untuk PO single cabang');
    if (user.role === 'ADMIN' && d.branchId !== user.branchId) throw forbidden();
    headerBranchId = d.branchId;
  }

  const lines = d.items.map((it, i) => {
    const branchId = d.isMulti ? it.branchId : headerBranchId;
    if (!branchId) throw new HttpError(400, `Baris ${i + 1}: cabang wajib dipilih untuk PO multi cabang`);
    return { ...it, branchId };
  });

  const seen = new Set<string>();
  lines.forEach((l, i) => {
    const k = `${l.productId}-${l.branchId}`;
    if (seen.has(k)) throw new HttpError(400, `Baris ${i + 1}: produk yang sama untuk cabang yang sama muncul dua kali`);
    seen.add(k);
  });

  const branchIds = [...new Set(lines.map((l) => l.branchId))];
  const branches = await db.branch.findMany({ where: { id: { in: branchIds }, deletedAt: null, status: 'ACTIVE' } });
  if (branches.length !== branchIds.length) throw new HttpError(400, 'Ada cabang yang tidak ditemukan atau tidak aktif');

  const productIds = [...new Set(lines.map((l) => l.productId))];
  const products = await db.product.findMany({ where: { id: { in: productIds }, deletedAt: null } });
  const pmap = new Map(products.map((p) => [p.id, p]));

  let totalDus = 0;
  let totalPcs = 0;
  let grandTotal = new Prisma.Decimal(0);
  const details = lines.map((l, i) => {
    const p = pmap.get(l.productId);
    if (!p || p.status !== 'ACTIVE') throw new HttpError(400, `Baris ${i + 1}: produk tidak ditemukan atau tidak aktif`);
    if (p.vendorId !== d.vendorId) throw new HttpError(400, `Baris ${i + 1}: produk ${p.kodeProduk} bukan dari vendor ${vendor.namaVendor}`);
    const pcs = l.qtyDus * p.isiPerDus;
    const harga = l.harga != null ? new Prisma.Decimal(l.harga) : p.hargaBeli;
    const subtotal = harga.mul(pcs);
    totalDus += l.qtyDus;
    totalPcs += pcs;
    grandTotal = grandTotal.add(subtotal);
    return {
      productId: p.id,
      branchId: l.branchId,
      namaProduk: p.namaProduk,
      qtyDus: l.qtyDus,
      isiPerDus: p.isiPerDus,
      totalPcs: pcs,
      harga,
      subtotal,
    };
  });

  return {
    header: {
      tanggalPo: new Date(`${d.tanggalPo}T00:00:00Z`),
      vendorId: d.vendorId,
      branchId: headerBranchId,
      isMulti: d.isMulti,
      catatan: d.catatan,
      totalDus,
      totalPcs,
      grandTotal,
    },
    details,
    branchCode: headerBranchId ? branches[0].kodeCabang : 'MULTI',
  };
}

/** Simpan PO baru (status DRAFT, atau MENUNGGU_APPROVAL bila submit). */
export async function createPO(req: Request, d: POInput, tx: Prisma.TransactionClient) {
  const user = req.user!;
  const built = await buildPO(user, d, tx);
  const seq = await nextNumber(tx, `PO/${built.branchCode}/${yyyymm(built.header.tanggalPo)}`);
  const poNumber = `PO/${built.branchCode}/${yyyymm(built.header.tanggalPo)}/${String(seq).padStart(4, '0')}`;
  const status: POStatus = d.submit ? 'MENUNGGU_APPROVAL' : 'DRAFT';
  const po = await tx.purchaseOrder.create({
    data: {
      ...built.header,
      poNumber,
      status,
      createdById: user.id,
      details: { create: built.details },
      statusHistories: {
        create: [
          { toStatus: 'DRAFT', userId: user.id, catatan: 'PO dibuat' },
          ...(d.submit ? [{ fromStatus: 'DRAFT' as POStatus, toStatus: 'MENUNGGU_APPROVAL' as POStatus, userId: user.id }] : []),
        ],
      },
    },
  });
  await notify(tx, {
    type: 'PO_CREATED',
    title: `PO baru ${poNumber}`,
    message: `${user.nama} membuat PO ${poNumber} (${PO_STATUS_LABEL[status]})`,
    refType: 'PO',
    refId: po.id,
    branchId: po.branchId,
  });
  await audit(req, { aksi: 'CREATE_PO', modul: 'PO', refId: po.poNumber, dataBaru: { ...po, details: built.details } }, tx);
  return po;
}

/** Cek apakah user boleh bertindak (ubah/hapus/ganti status) atas PO ini. */
export function assertCanAct(user: AuthUser, po: { branchId: number | null; isMulti: boolean }) {
  if (user.role === 'SUPER_ADMIN') return;
  if (user.role === 'ADMIN' && !po.isMulti && po.branchId === user.branchId) return;
  throw forbidden();
}

const NOTIFY_ON: Partial<Record<POStatus, 'PO_APPROVED' | 'GOODS_SHIPPED' | 'GOODS_RECEIVED'>> = {
  APPROVED: 'PO_APPROVED',
  DIKIRIM: 'GOODS_SHIPPED',
  DITERIMA: 'GOODS_RECEIVED',
};

/** Ubah status satu PO sesuai aturan transisi, catat riwayat, notifikasi, dan audit. */
export async function changeStatus(req: Request, poId: number, to: POStatus, catatan: string | null, tx: Prisma.TransactionClient) {
  const user = req.user!;
  // Kunci baris PO agar dua perubahan status bersamaan tidak saling menimpa.
  await tx.$queryRaw`SELECT id FROM purchase_orders WHERE id = ${poId} FOR UPDATE`;
  const po = await tx.purchaseOrder.findFirst({
    where: { id: poId, deletedAt: null },
    include: { _count: { select: { receiptPOs: true } } },
  });
  if (!po) throw new HttpError(404, 'PO tidak ditemukan');
  assertCanAct(user, po);
  if (!findTransition(po.status, to, user.role)) {
    throw new HttpError(400, `Status ${PO_STATUS_LABEL[po.status]} tidak bisa diubah ke ${PO_STATUS_LABEL[to]} oleh role Anda`);
  }
  if (to === 'CANCEL' && po._count.receiptPOs > 0) {
    throw new HttpError(400, 'PO yang sudah diklaim cashback tidak bisa dibatalkan');
  }
  const updated = await tx.purchaseOrder.update({
    where: { id: poId },
    data: {
      status: to,
      ...(to === 'APPROVED' ? { approvedById: user.id, approvedAt: new Date() } : {}),
      ...(to === 'DRAFT' ? { approvedById: null, approvedAt: null } : {}),
      statusHistories: { create: { fromStatus: po.status, toStatus: to, userId: user.id, catatan } },
    },
  });
  const nt = NOTIFY_ON[to];
  if (nt) {
    await notify(tx, {
      type: nt,
      title: `${po.poNumber}: ${PO_STATUS_LABEL[to]}`,
      message: `${user.nama} mengubah status PO ${po.poNumber} menjadi ${PO_STATUS_LABEL[to]}`,
      refType: 'PO',
      refId: po.id,
      branchId: po.branchId,
    });
  }
  await audit(
    req,
    { aksi: `PO_${to}`, modul: 'PO', refId: po.poNumber, dataLama: { status: po.status }, dataBaru: { status: to, catatan } },
    tx,
  );
  return updated;
}
