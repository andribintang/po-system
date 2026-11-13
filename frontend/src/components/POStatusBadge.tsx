export type POStatus = 'DRAFT' | 'MENUNGGU_APPROVAL' | 'APPROVED' | 'DIKIRIM_VENDOR' | 'DIKIRIM' | 'DITERIMA' | 'SELESAI' | 'CANCEL';

export const PO_STATUS: Record<POStatus, { label: string; cls: string }> = {
  DRAFT: { label: 'Draft', cls: 'bg-slate-200 text-slate-700' },
  MENUNGGU_APPROVAL: { label: 'Menunggu Approval', cls: 'bg-amber-100 text-amber-800' },
  APPROVED: { label: 'Approved', cls: 'bg-blue-100 text-blue-800' },
  DIKIRIM_VENDOR: { label: 'Dikirim ke Vendor', cls: 'bg-indigo-100 text-indigo-800' },
  DIKIRIM: { label: 'Dikirim', cls: 'bg-violet-100 text-violet-800' },
  DITERIMA: { label: 'Diterima', cls: 'bg-teal-100 text-teal-800' },
  SELESAI: { label: 'Selesai', cls: 'bg-emerald-100 text-emerald-800' },
  CANCEL: { label: 'Cancel', cls: 'bg-red-100 text-red-700' },
};

export function POStatusBadge({ status, cashback }: { status: POStatus; cashback?: boolean }) {
  if (cashback && status === 'SELESAI') {
    return <span className="whitespace-nowrap rounded-full bg-emerald-600 px-2 py-0.5 text-xs font-semibold text-white">Selesai (Cashback)</span>;
  }
  const s = PO_STATUS[status];
  return <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ${s.cls}`}>{s.label}</span>;
}
