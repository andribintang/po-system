import { Router } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { ah, HttpError, notFound } from '../lib/errors';
import { audit } from '../lib/audit';
import { idParam, listQuery, money, optStr } from '../lib/http';
import { requireRole } from '../middleware/auth';
import { mustExist } from './master';

const router = Router();

const include = {
  vendor: { select: { id: true, kodeVendor: true, namaVendor: true } },
  areaFees: {
    include: { area: { select: { id: true, kodeArea: true, namaArea: true } } },
    orderBy: { areaId: 'asc' },
  },
} satisfies Prisma.ProductInclude;

const feeFields = {
  feeVendorPerPcs: money,
  feeKabengPerPcs: money,
  feePerusahaanPerPcs: money,
};

const schema = z
  .object({
    kodeProduk: z.string().trim().min(1).max(40).transform((s) => s.toUpperCase()),
    namaProduk: z.string().trim().min(1).max(150),
    merek: optStr(80),
    vendorId: z.coerce.number().int().positive(),
    unit: z.string().trim().min(1).max(20).default('PCS'),
    isiPerDus: z.coerce.number().int().min(1).max(1000),
    hargaBeli: money,
    ...feeFields,
    status: z.enum(['ACTIVE', 'INACTIVE']).default('ACTIVE'),
    areaFees: z
      .array(z.object({ areaId: z.coerce.number().int().positive(), ...feeFields }))
      .default([]),
  })
  .superRefine((d, ctx) => {
    const seen = new Set<number>();
    d.areaFees.forEach((f, i) => {
      if (seen.has(f.areaId)) {
        ctx.addIssue({ code: 'custom', path: ['areaFees', i, 'areaId'], message: 'Area duplikat' });
      }
      seen.add(f.areaId);
    });
  });

router.get(
  '/',
  requireRole('SUPER_ADMIN', 'ADMIN', 'KEPALA_BENGKEL'),
  ah(async (req, res) => {
    const q = listQuery.extend({ vendorId: z.coerce.number().int().optional() }).parse(req.query);
    const where: Prisma.ProductWhereInput = {
      deletedAt: null,
      status: q.status,
      vendorId: q.vendorId,
      ...(q.q
        ? { OR: [{ kodeProduk: { contains: q.q } }, { namaProduk: { contains: q.q } }, { merek: { contains: q.q } }] }
        : {}),
    };
    const [items, total] = await Promise.all([
      prisma.product.findMany({
        where,
        include,
        orderBy: { namaProduk: 'asc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      prisma.product.count({ where }),
    ]);
    res.json({ items, total, page: q.page, pageSize: q.pageSize });
  }),
);

router.get(
  '/:id',
  requireRole('SUPER_ADMIN', 'ADMIN', 'KEPALA_BENGKEL'),
  ah(async (req, res) => {
    const p = await prisma.product.findFirst({ where: { id: idParam(req), deletedAt: null }, include });
    if (!p) throw notFound('Produk');
    res.json(p);
  }),
);

async function validateRefs(d: z.infer<typeof schema>) {
  await mustExist('vendor', d.vendorId, 'Vendor');
  if (d.areaFees.length) {
    const ids = d.areaFees.map((f) => f.areaId);
    const found = await prisma.area.count({ where: { id: { in: ids }, deletedAt: null } });
    if (found !== ids.length) throw new HttpError(400, 'Ada area yang tidak ditemukan');
  }
}

router.post(
  '/',
  requireRole('SUPER_ADMIN'),
  ah(async (req, res) => {
    const { areaFees, ...data } = schema.parse(req.body);
    await validateRefs({ ...data, areaFees });
    const created = await prisma.product.create({
      data: { ...data, areaFees: { create: areaFees } },
      include,
    });
    await audit(req, { aksi: 'CREATE_PRODUCT', modul: 'MASTER', refId: created.id, dataBaru: created });
    res.status(201).json(created);
  }),
);

router.put(
  '/:id',
  requireRole('SUPER_ADMIN'),
  ah(async (req, res) => {
    const id = idParam(req);
    const old = await prisma.product.findFirst({ where: { id, deletedAt: null }, include });
    if (!old) throw notFound('Produk');
    const { areaFees, ...data } = schema.parse(req.body);
    await validateRefs({ ...data, areaFees });
    // Ganti seluruh tarif area dalam satu transaksi.
    const updated = await prisma.$transaction(async (tx) => {
      await tx.productAreaFee.deleteMany({ where: { productId: id } });
      return tx.product.update({
        where: { id },
        data: { ...data, areaFees: { create: areaFees } },
        include,
      });
    });
    await audit(req, { aksi: 'UPDATE_PRODUCT', modul: 'MASTER', refId: id, dataLama: old, dataBaru: updated });
    res.json(updated);
  }),
);

router.delete(
  '/:id',
  requireRole('SUPER_ADMIN'),
  ah(async (req, res) => {
    const id = idParam(req);
    const old = await prisma.product.findFirst({ where: { id, deletedAt: null }, include });
    if (!old) throw notFound('Produk');
    await prisma.product.update({ where: { id }, data: { deletedAt: new Date(), status: 'INACTIVE' } });
    await audit(req, { aksi: 'DELETE_PRODUCT', modul: 'MASTER', refId: id, dataLama: old });
    res.json({ ok: true });
  }),
);

export default router;
