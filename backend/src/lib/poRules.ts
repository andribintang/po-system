import type { POStatus, UserRole } from '@prisma/client';

export interface Transition {
  to: POStatus;
  roles: UserRole[];
  label: string;
}

const SA: UserRole[] = ['SUPER_ADMIN'];
const OPS: UserRole[] = ['SUPER_ADMIN', 'ADMIN'];

/** Aturan perubahan status PO. Status yang tidak ada di daftar tidak bisa dituju. */
export const PO_TRANSITIONS: Record<POStatus, Transition[]> = {
  DRAFT: [
    { to: 'MENUNGGU_APPROVAL', roles: OPS, label: 'Ajukan Approval' },
    { to: 'CANCEL', roles: OPS, label: 'Batalkan' },
  ],
  MENUNGGU_APPROVAL: [
    { to: 'APPROVED', roles: SA, label: 'Setujui' },
    { to: 'DRAFT', roles: OPS, label: 'Kembalikan ke Draft' },
    { to: 'CANCEL', roles: SA, label: 'Tolak / Batalkan' },
  ],
  APPROVED: [
    { to: 'DIKIRIM_VENDOR', roles: OPS, label: 'Dikirim ke Vendor' },
    { to: 'CANCEL', roles: SA, label: 'Batalkan' },
  ],
  DIKIRIM_VENDOR: [{ to: 'DIKIRIM', roles: OPS, label: 'Barang Dikirim' }],
  DIKIRIM: [{ to: 'DITERIMA', roles: OPS, label: 'Barang Diterima' }],
  DITERIMA: [{ to: 'SELESAI', roles: OPS, label: 'Selesai' }],
  SELESAI: [],
  CANCEL: [],
};

export const PO_STATUS_LABEL: Record<POStatus, string> = {
  DRAFT: 'Draft',
  MENUNGGU_APPROVAL: 'Menunggu Approval',
  APPROVED: 'Approved',
  DIKIRIM_VENDOR: 'Dikirim ke Vendor',
  DIKIRIM: 'Dikirim',
  DITERIMA: 'Diterima',
  SELESAI: 'Selesai',
  CANCEL: 'Cancel',
};

/** Status PO yang sudah boleh diklaim cashback-nya (dipakai di tahap 3). */
export const CLAIMABLE_STATUSES: POStatus[] = ['APPROVED', 'DIKIRIM_VENDOR', 'DIKIRIM', 'DITERIMA', 'SELESAI'];

export function findTransition(from: POStatus, to: POStatus, role: UserRole): Transition | null {
  const t = PO_TRANSITIONS[from].find((x) => x.to === to);
  return t && t.roles.includes(role) ? t : null;
}

export function allowedTransitions(from: POStatus, role: UserRole): Transition[] {
  return PO_TRANSITIONS[from].filter((t) => t.roles.includes(role));
}
