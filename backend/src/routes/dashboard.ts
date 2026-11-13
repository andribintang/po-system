import { Router } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { ah } from '../lib/errors';
import { branchScope } from '../middleware/auth';
import { CLAIMABLE_STATUSES } from '../lib/poRules';

/**
 * Dashboard eksekutif. Super Admin melihat nasional; Admin & Kepala Bengkel hanya cabangnya.
 * Kepala Bengkel tidak melihat porsi hak perusahaan.
 */
const router = Router();
const D = (v: Prisma.Decimal | null | undefined) => new Prisma.Decimal(v ?? 0);

/** Daftar 12 periode (YYYY-MM) yang berakhir di bulan `end`. */
export function lastPeriods(end: Date, n = 12): string[] {
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - i, 1));
    out.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`);
  }
  return out;
}

router.get(
  '/',
  ah(async (req, res) => {
    const q = z.object({ branchId: z.coerce.number().int().positive().optional() }).parse(req.query);
    const user = req.user!;
    const b = branchScope(user) ?? q.branchId ?? null;
    const isKb = user.role === 'KEPALA_BENGKEL';

    const poWhere: Prisma.PurchaseOrderWhereInput = {
      deletedAt: null,
      ...(b ? { OR: [{ branchId: b }, { details: { some: { branchId: b } } }] } : {}),
    };
    const detailWhere: Prisma.PODetailWhereInput = {
      po: { deletedAt: null, status: { in: CLAIMABLE_STATUSES } },
      ...(b ? { branchId: b } : {}),
    };
    const distWhere: Prisma.CashbackDistributionWhereInput = b ? { branchId: b } : {};
    const statusIn = Prisma.join(CLAIMABLE_STATUSES);

    const [
      totalPo, poByStatus, poValue, activeVendors, totalBranches, totalProducts,
      receiptSum, distByStatus, distByPeriode, distByBranch, topProductRows, topVendorRows, recent,
    ] = await Promise.all([
      prisma.purchaseOrder.count({ where: { ...poWhere, status: { not: 'CANCEL' } } }),
      prisma.purchaseOrder.groupBy({ by: ['status'], where: poWhere, _count: { _all: true } }),
      prisma.pODetail.aggregate({ where: detailWhere, _sum: { subtotal: true } }),
      prisma.vendor.count({ where: { status: 'ACTIVE', deletedAt: null } }),
      prisma.branch.count({ where: { status: 'ACTIVE', deletedAt: null } }),
      prisma.product.count({ where: { status: 'ACTIVE', deletedAt: null } }),
      prisma.cashbackReceipt.aggregate({ where: { deletedAt: null }, _sum: { totalCashback: true } }),
      prisma.cashbackDistribution.groupBy({ by: ['status'], where: distWhere, _sum: { totalFeeKabeng: true, totalFeePerusahaan: true }, _count: { _all: true } }),
      prisma.cashbackDistribution.groupBy({ by: ['periode', 'status'], where: distWhere, _sum: { totalFeeKabeng: true, totalFeePerusahaan: true } }),
      prisma.cashbackDistribution.groupBy({ by: ['branchId', 'status'], where: distWhere, _sum: { totalFeeKabeng: true, totalFeePerusahaan: true } }),
      prisma.pODetail.groupBy({ by: ['productId'], where: detailWhere, _sum: { totalPcs: true, subtotal: true }, orderBy: { _sum: { subtotal: 'desc' } }, take: 5 }),
      prisma.$queryRaw<{ vendorId: number; total: Prisma.Decimal; jumlahPo: bigint }[]>`
        SELECT po.vendor_id AS vendorId, SUM(d.subtotal) AS total, COUNT(DISTINCT po.id) AS jumlahPo
        FROM po_details d JOIN purchase_orders po ON po.id = d.po_id
        WHERE po.deleted_at IS NULL AND po.status IN (${statusIn}) ${b ? Prisma.sql`AND d.branch_id = ${b}` : Prisma.empty}
        GROUP BY po.vendor_id ORDER BY total DESC LIMIT 5`,
      prisma.purchaseOrder.findMany({
        where: poWhere,
        orderBy: { id: 'desc' },
        take: 8,
        include: { vendor: { select: { namaVendor: true } }, branch: { select: { namaCabang: true } } },
      }),
    ]);

    // Hak cashback (Kepala Bengkel melihat hak KB saja; lainnya KB + perusahaan)
    const share = (s: { totalFeeKabeng: Prisma.Decimal | null; totalFeePerusahaan: Prisma.Decimal | null }) =>
      isKb ? D(s.totalFeeKabeng) : D(s.totalFeeKabeng).add(D(s.totalFeePerusahaan));

    const st = (s: 'PAID' | 'UNPAID') => distByStatus.find((x) => x.status === s);
    const paid = D(st('PAID')?._sum.totalFeeKabeng);
    const unpaid = D(st('UNPAID')?._sum.totalFeeKabeng);
    const received = b
      ? distByStatus.reduce((a, x) => a.add(share(x._sum)), new Prisma.Decimal(0))
      : D(receiptSum._sum.totalCashback);

    const periods = lastPeriods(new Date());
    const trend = periods.map((p) => {
      const rows = distByPeriode.filter((x) => x.periode === p);
      return {
        periode: p,
        diterima: rows.reduce((a, x) => a.add(share(x._sum)), new Prisma.Decimal(0)).toString(),
        dibayar: rows.filter((x) => x.status === 'PAID').reduce((a, x) => a.add(D(x._sum.totalFeeKabeng)), new Prisma.Decimal(0)).toString(),
      };
    });

    const branchIds = [...new Set(distByBranch.map((x) => x.branchId))];
    const productIds = topProductRows.map((x) => x.productId);
    const vendorIds = topVendorRows.map((x) => Number(x.vendorId));
    const [branches, products, vendors] = await Promise.all([
      prisma.branch.findMany({ where: { id: { in: branchIds } }, select: { id: true, kodeCabang: true, namaCabang: true, area: { select: { namaArea: true } } } }),
      prisma.product.findMany({ where: { id: { in: productIds } }, select: { id: true, kodeProduk: true, namaProduk: true } }),
      prisma.vendor.findMany({ where: { id: { in: vendorIds } }, select: { id: true, namaVendor: true } }),
    ]);

    const topBranches = branches
      .map((br) => {
        const rows = distByBranch.filter((x) => x.branchId === br.id);
        const sum = (f: 'totalFeeKabeng' | 'totalFeePerusahaan', s?: string) =>
          rows.filter((x) => !s || x.status === s).reduce((a, x) => a.add(D(x._sum[f])), new Prisma.Decimal(0));
        const kabeng = sum('totalFeeKabeng');
        return {
          branch: { id: br.id, kodeCabang: br.kodeCabang, namaCabang: br.namaCabang, area: br.area.namaArea },
          hakKabeng: kabeng.toString(),
          hakPerusahaan: isKb ? null : sum('totalFeePerusahaan').toString(),
          dibayar: sum('totalFeeKabeng', 'PAID').toString(),
          outstanding: sum('totalFeeKabeng', 'UNPAID').toString(),
          _k: kabeng,
        };
      })
      .sort((a, z2) => z2._k.comparedTo(a._k))
      .map(({ _k, ...rest }) => rest);

    res.json({
      scope: b ? { branchId: b } : null,
      kpi: {
        totalPo,
        nilaiPo: D(poValue._sum.subtotal).toString(),
        vendorAktif: activeVendors,
        totalCabang: totalBranches,
        totalProduk: totalProducts,
        cashbackDiterima: received.toString(),
        cashbackDibayar: paid.toString(),
        outstanding: unpaid.toString(),
      },
      poByStatus: poByStatus.map((x) => ({ status: x.status, jumlah: x._count._all })),
      payRatio: {
        paid: { nominal: paid.toString(), jumlah: st('PAID')?._count._all ?? 0 },
        unpaid: { nominal: unpaid.toString(), jumlah: st('UNPAID')?._count._all ?? 0 },
      },
      trend,
      topProducts: topProductRows.map((r) => {
        const p = products.find((x) => x.id === r.productId);
        return { product: p ?? { id: r.productId, kodeProduk: '-', namaProduk: '-' }, totalPcs: r._sum.totalPcs ?? 0, nilai: D(r._sum.subtotal).toString() };
      }),
      topVendors: topVendorRows.map((r) => ({
        vendor: vendors.find((x) => x.id === Number(r.vendorId)) ?? { id: Number(r.vendorId), namaVendor: '-' },
        nilai: D(r.total).toString(),
        jumlahPo: Number(r.jumlahPo),
      })),
      topBranches,
      recentPOs: recent.map((p) => ({
        id: p.id, poNumber: p.poNumber, tanggalPo: p.tanggalPo, status: p.status, isMulti: p.isMulti,
        vendor: p.vendor.namaVendor, cabang: p.isMulti ? 'Multi Cabang' : p.branch?.namaCabang ?? '-', grandTotal: p.grandTotal.toString(),
      })),
    });
  }),
);

export default router;
