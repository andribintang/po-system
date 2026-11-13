import { Router, type Request } from 'express';
import type { NotificationType, Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { ah } from '../lib/errors';
import { idParam } from '../lib/http';

const router = Router();

const CASHBACK_TYPES: NotificationType[] = ['CASHBACK_RECEIVED', 'CASHBACK_PAID'];

/** Notifikasi yang relevan untuk user: sesuai role, cabang, dan jenis modul yang boleh diakses. */
function scope(req: Request): Prisma.NotificationWhereInput {
  const u = req.user!;
  return {
    AND: [
      { OR: [{ targetRole: null }, { targetRole: u.role }] },
      u.role === 'SUPER_ADMIN' ? {} : { OR: [{ branchId: null }, { branchId: u.branchId }] },
      u.role === 'KEPALA_BENGKEL' ? { type: { in: CASHBACK_TYPES } } : {},
    ],
  };
}

router.get(
  '/',
  ah(async (req, res) => {
    const where = scope(req);
    const userId = req.user!.id;
    const [items, unread] = await Promise.all([
      prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: 30,
        include: { reads: { where: { userId }, select: { readAt: true } } },
      }),
      prisma.notification.count({ where: { ...where, reads: { none: { userId } } } }),
    ]);
    res.json({
      unread,
      items: items.map(({ reads, ...n }) => ({ ...n, read: reads.length > 0 })),
    });
  }),
);

router.post(
  '/read-all',
  ah(async (req, res) => {
    const userId = req.user!.id;
    const ids = await prisma.notification.findMany({
      where: { ...scope(req), reads: { none: { userId } } },
      select: { id: true },
    });
    await prisma.notificationRead.createMany({
      data: ids.map((n) => ({ notificationId: n.id, userId })),
      skipDuplicates: true,
    });
    res.json({ ok: true, count: ids.length });
  }),
);

router.post(
  '/:id/read',
  ah(async (req, res) => {
    await prisma.notificationRead.createMany({
      data: [{ notificationId: idParam(req), userId: req.user!.id }],
      skipDuplicates: true,
    });
    res.json({ ok: true });
  }),
);

export default router;
