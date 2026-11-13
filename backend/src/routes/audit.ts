import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { ah } from '../lib/errors';
import { requireRole } from '../middleware/auth';

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
      })
      .parse(req.query);
    const where = {
      ...(q.modul && q.modul !== 'ALL' ? { modul: q.modul } : {}),
      ...(q.q ? { OR: [{ namaUser: { contains: q.q } }, { aksi: { contains: q.q } }, { refId: q.q }] } : {}),
    };
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
