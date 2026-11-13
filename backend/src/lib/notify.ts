import type { NotificationType, Prisma, UserRole } from '@prisma/client';

export async function notify(
  tx: Prisma.TransactionClient,
  n: { type: NotificationType; title: string; message: string; refType?: string; refId?: number; branchId?: number | null; targetRole?: UserRole | null },
) {
  await tx.notification.create({
    data: {
      type: n.type,
      title: n.title,
      message: n.message.slice(0, 500),
      refType: n.refType ?? null,
      refId: n.refId ?? null,
      branchId: n.branchId ?? null,
      targetRole: n.targetRole ?? null,
    },
  });
}
