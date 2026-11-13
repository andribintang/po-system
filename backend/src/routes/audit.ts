import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { ah } from '../lib/errors';
import { requireRole } from '../middleware/auth';
import { sendTable } from '../lib/tabular';

const router = Router();
router.use(requireRole('SUPER_ADMIN'));

router.get(
  '/',
  ah(async (req, res) => {
    const q = z
      .object({
        modul: z.string().optional(),
        q: z.string().trim().optional(),
        page: z.coerce.number().int().min(1).default(1),
        pageSize: z.coerce.number().int().min(1).max(200).default(50),
        from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        format: z.enum(['json', 'csv', 'xlsx']).default('json'),
      })
      .parse(req.query);
    const where = {
      ...(q.modul && q.modul !== 'ALL' ? { modul: q.modul } : {}),
      ...(q.q ? { OR: [{ namaUser: { contains: q.q } }, { aksi: { contains: q.q } }, { refId: q.q }] } : {}),
      ...(q.from || q.to
        ? { createdAt: { ...(q.from ? { gte: new Date(`${q.from}T00:00:00+07:00`) } : {}), ...(q.to ? { lte: new Date(`${q.to}T23:59:59.999+07:00`) } : {}) } }
        : {}),
    };
    if (q.format !== 'json') {
      // Ekspor maksimal 10.000 baris terbaru sesuai filter
      const all = await prisma.auditLog.findMany({ where, orderBy: { createdAt: 'desc' }, take: 10000 });
      const wib = (d: Date) => new Date(d.getTime() + 7 * 3600_000).toISOString().replace('T', ' ').slice(0, 19);
      await sendTable(res, {
        title: 'Audit Trail',
        filename: `audit-trail-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`,
        headers: ['Waktu (WIB)', 'User', 'Modul', 'Aksi', 'Ref', 'IP', 'Data Lama', 'Data Baru'],
        rows: all.map((l) => [wib(l.createdAt), l.namaUser, l.modul, l.aksi, l.refId, l.ipAddress, l.dataLama ? JSON.stringify(l.dataLama) : '', l.dataBaru ? JSON.stringify(l.dataBaru) : '']),
      }, q.format);
      return;
    }
    const [items, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      prisma.auditLog.count({ where }),
    ]);
    res.json({ items: items.map((i) => ({ ...i, id: i.id.toString() })), total, page: q.page, pageSize: q.pageSize });
  }),
);

export default router;
