import { Router, type Request } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { ah, HttpError, notFound } from '../lib/errors';
import { audit } from '../lib/audit';
import { idParam } from '../lib/http';
import { branchScope, requireRole } from '../middleware/auth';
import { CLAIMABLE_STATUSES } from '../lib/poRules';
import { claimSchema, computeClaim, createClaim } from '../lib/cashbackService';

const router = Router();
const ALL = ['SUPER_ADMIN', 'ADMIN', 'KEPALA_BENGKEL'] as const;
const OPS = ['SUPER_ADMIN', 'ADMIN'] as const;

const periode = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);

/** Non Super Admin hanya melihat klaim yang memuat cabangnya. */
function receiptScope(req: Request): Prisma.CashbackReceiptWhereInput {
  const b = branchScope(req.user!);
  return b === null ? {} : { distributions: { some: { branchId: b } } };
}

// ───────────── PO yang bisa diklaim ─────────────

router.get(
  '/eligible',
  requireRole(...OPS),
  ah(async (req, res) => {
    const q = z
      .object({ vendorId: z.coerce.number().int().positive(), branchId: z.coerce.number().int().positive().optional() })
      .parse(req.query);
    const scope = branchScope(req.user!);
    const branchFilter = scope ?? q.branchId;
    const pos = await prisma.purchaseOrder.findMany({
      where: {
        deletedAt: null,
        vendorId: q.vendorId,
        status: { in: CLAIMABLE_STATUSES },
        ...(branchFilter ? { details: { some: { branchId: branchFilter } } } : {}),
      },
      include: {
        receiptPOs: { select: { branchId: true } },
        details: { include: { branch: { select: { id: true, kodeCabang: true, namaCabang: true } } } },
      },
      orderBy: [{ tanggalPo: 'asc' }, { id: 'asc' }],
      take: 1000,
    });
    // Pecah per (PO, cabang) yang belum diklaim.
    const items: unknown[] = [];
    for (const po of pos) {
      const claimed = new Set(po.receiptPOs.map((r) => r.branchId));
      const byBranch = new Map<number, { branch: (typeof po.details)[number]['branch']; pcs: number }>();
      for (const d of po.details) {
        if (claimed.has(d.branchId) || (branchFilter && d.branchId !== branchFilter)) continue;
        const x = byBranch.get(d.branchId) ?? { branch: d.branch, pcs: 0 };
        x.pcs += d.totalPcs;
        byBranch.set(d.branchId, x);
      }
      for (const [branchId, x] of byBranch) {
        items.push({ poId: po.id, poNumber: po.poNumber, tanggalPo: po.tanggalPo, status: po.status, isMulti: po.isMulti, branchId, branch: x.branch, totalPcs: x.pcs });
      }
    }
    res.json({ items });
  }),
);

/** Pratinjau perhitungan tanpa menyimpan. */
router.post(
  '/preview',
  requireRole(...OPS),
  ah(async (req, res) => {
    const d = claimSchema.innerType().pick({ vendorId: true, poBranches: true, manualLines: true }).parse(req.body);
    const r = await computeClaim(req.user!, d);
    res.json({ lines: r.lines, totals: r.totals });
  }),
);

// ───────────── Distribusi (monitoring) ─────────────

router.get(
  '/distributions',
  requireRole(...ALL),
  ah(async (req, res) => {
    const q = z
      .object({
        periode: periode.optional(),
        branchId: z.coerce.number().int().positive().optional(),
        status: z.enum(['UNPAID', 'PAID', 'REFUND']).optional(),
        page: z.coerce.number().int().min(1).default(1),
        pageSize: z.coerce.number().int().min(1).max(500).default(50),
      })
      .parse(req.query);
    const scope = branchScope(req.user!);
    const where: Prisma.CashbackDistributionWhereInput = {
      receipt: { deletedAt: null },
      periode: q.periode,
      status: q.status,
      branchId: scope ?? q.branchId,
    };
    const [items, total, sums] = await Promise.all([
      prisma.cashbackDistribution.findMany({
        where,
        include: {
          branch: { select: { id: true, kodeCabang: true, namaCabang: true } },
          product: { select: { id: true, kodeProduk: true, namaProduk: true } },
          po: { select: { id: true, poNumber: true } },
          receipt: { select: { id: true, receiptNo: true } },
        },
        orderBy: [{ periode: 'desc' }, { branchId: 'asc' }, { id: 'asc' }],
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      prisma.cashbackDistribution.count({ where }),
      prisma.cashbackDistribution.groupBy({ by: ['status'], where, _sum: { totalFeeKabeng: true, totalFeePerusahaan: true } }),
    ]);
    res.json({
      items,
      total,
      page: q.page,
      pageSize: q.pageSize,
      summary: Object.fromEntries(sums.map((s) => [s.status, { kabeng: s._sum.totalFeeKabeng ?? '0', perusahaan: s._sum.totalFeePerusahaan ?? '0' }])),
    });
  }),
);

// ───────────── Klaim ─────────────

router.get(
  '/',
  requireRole(...ALL),
  ah(async (req, res) => {
    const q = z
      .object({
        vendorId: z.coerce.number().int().positive().optional(),
        periode: periode.optional(),
        q: z.string().trim().optional(),
        page: z.coerce.number().int().min(1).default(1),
        pageSize: z.coerce.number().int().min(1).max(200).default(20),
      })
      .parse(req.query);
    const where: Prisma.CashbackReceiptWhereInput = {
      AND: [
        { deletedAt: null },
        receiptScope(req),
        q.vendorId ? { vendorId: q.vendorId } : {},
        q.periode ? { periode: q.periode } : {},
        q.q ? { OR: [{ receiptNo: { contains: q.q } }, { catatan: { contains: q.q } }, { pos: { some: { po: { poNumber: { contains: q.q } } } } }] } : {},
      ],
    };
    const [items, total, sum] = await Promise.all([
      prisma.cashbackReceipt.findMany({
        where,
        include: {
          vendor: { select: { id: true, kodeVendor: true, namaVendor: true } },
          createdBy: { select: { nama: true } },
          pos: { include: { po: { select: { poNumber: true } } } },
          _count: { select: { distributions: true } },
        },
        orderBy: [{ tanggal: 'desc' }, { id: 'desc' }],
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      prisma.cashbackReceipt.count({ where }),
      prisma.cashbackReceipt.aggregate({ where, _sum: { totalCashback: true } }),
    ]);
    res.json({ items, total, page: q.page, pageSize: q.pageSize, summary: { totalCashback: sum._sum.totalCashback ?? '0' } });
  }),
);

router.get(
  '/:id',
  requireRole(...ALL),
  ah(async (req, res) => {
    const scope = branchScope(req.user!);
    const r = await prisma.cashbackReceipt.findFirst({
      where: { AND: [{ id: idParam(req), deletedAt: null }, receiptScope(req)] },
      include: {
        vendor: { select: { id: true, kodeVendor: true, namaVendor: true } },
        createdBy: { select: { nama: true } },
        buktiFile: { select: { id: true, originalName: true, mimeType: true } },
        pos: { include: { po: { select: { id: true, poNumber: true } }, branch: { select: { namaCabang: true } } } },
        details: {
          where: scope === null ? {} : { branchId: scope },
          include: { product: { select: { kodeProduk: true, namaProduk: true } }, branch: { select: { namaCabang: true } }, po: { select: { poNumber: true } } },
          orderBy: [{ branchId: 'asc' }, { id: 'asc' }],
        },
        distributions: {
          where: scope === null ? {} : { branchId: scope },
          include: { product: { select: { kodeProduk: true, namaProduk: true } }, branch: { select: { namaCabang: true } }, po: { select: { poNumber: true } } },
          orderBy: [{ branchId: 'asc' }, { id: 'asc' }],
        },
      },
    });
    if (!r) throw notFound('Klaim cashback');
    const anyPaid = r.distributions.some((d) => d.status !== 'UNPAID');
    res.json({ ...r, canDelete: req.user!.role === 'SUPER_ADMIN' && !anyPaid });
  }),
);

router.post(
  '/',
  requireRole(...OPS),
  ah(async (req, res) => {
    const d = claimSchema.parse(req.body);
    try {
      const r = await prisma.$transaction((tx) => createClaim(req, d, tx));
      res.status(201).json(r);
    } catch (e) {
      // Pengaman terakhir: constraint unik (po_id, branch_id) di database.
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new HttpError(409, 'Salah satu PO untuk cabang tersebut sudah diklaim');
      }
      throw e;
    }
  }),
);

/** Batalkan klaim (Super Admin), hanya bila belum ada distribusi yang dibayar / masuk antrean pembayaran. */
router.delete(
  '/:id',
  requireRole('SUPER_ADMIN'),
  ah(async (req, res) => {
    const id = idParam(req);
    const r = await prisma.cashbackReceipt.findFirst({ where: { id, deletedAt: null }, include: { distributions: { include: { _count: { select: { paymentItems: true } } } }, pos: true } });
    if (!r) throw notFound('Klaim cashback');
    if (r.distributions.some((d) => d.status !== 'UNPAID' || d._count.paymentItems > 0)) {
      throw new HttpError(400, 'Klaim tidak bisa dibatalkan karena sebagian distribusinya sudah masuk pembayaran');
    }
    await prisma.$transaction(async (tx) => {
      await tx.cashbackDistribution.deleteMany({ where: { receiptId: id } });
      // Lepas tautan PO agar PO bisa diklaim ulang dengan data yang benar.
      await tx.cashbackReceiptPO.deleteMany({ where: { receiptId: id } });
      await tx.cashbackReceipt.update({ where: { id }, data: { deletedAt: new Date() } });
      await audit(req, { aksi: 'DELETE_CASHBACK', modul: 'CASHBACK', refId: r.receiptNo, dataLama: r }, tx);
    });
    res.json({ ok: true });
  }),
);

export default router;
