import { useCallback, useEffect, useState } from 'react';
import { Link, NavLink, useNavigate, useParams } from 'react-router-dom';
import { Plus, Search } from 'lucide-react';
import { api, errorText, rupiah, tanggal, angka } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useOptions, type Row } from '../../components/CrudPage';

export const DIST_STATUS: Record<string, { label: string; cls: string }> = {
  UNPAID: { label: 'Belum Dibayar', cls: 'bg-amber-100 text-amber-800' },
  PAID: { label: 'Sudah Dibayar', cls: 'bg-emerald-100 text-emerald-800' },
  REFUND: { label: 'Refund', cls: 'bg-slate-200 text-slate-700' },
};
export const DistBadge = ({ s }: { s: string }) => (
  <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ${DIST_STATUS[s]?.cls}`}>{DIST_STATUS[s]?.label ?? s}</span>
);

function Pager({ page, pages, set }: { page: number; pages: number; set: (n: number) => void }) {
  return (
    <div className="flex items-center gap-2">
      <button className="btn-secondary px-2 py-1" disabled={page <= 1} onClick={() => set(page - 1)}>‹</button>
      <span>{page} / {pages}</span>
      <button className="btn-secondary px-2 py-1" disabled={page >= pages} onClick={() => set(page + 1)}>›</button>
    </div>
  );
}

export function CashbackPage() {
  const { tab } = useParams();
  const { user } = useAuth();
  const canInput = user?.role !== 'KEPALA_BENGKEL';
  const active = tab === 'distribusi' ? 'distribusi' : 'klaim';
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="flex-1 text-xl font-bold text-slate-800">Cashback Vendor</h1>
        {canInput && <Link to="/cashback/baru" className="btn-primary"><Plus size={15} /> Input Klaim Cashback</Link>}
      </div>
      <div className="flex gap-2">
        {[['klaim', 'Klaim dari Vendor'], ['distribusi', 'Distribusi per Cabang']].map(([k, l]) => (
          <NavLink key={k} to={`/cashback/tab/${k}`} className={`rounded-md px-3 py-1.5 text-sm ${active === k ? 'bg-blue-700 text-white' : 'bg-white text-slate-700'}`}>{l}</NavLink>
        ))}
      </div>
      {active === 'klaim' ? <ReceiptList /> : <DistributionList />}
    </div>
  );
}

function ReceiptList() {
  const nav = useNavigate();
  const vendors = useOptions('/vendors', (v) => v.namaVendor);
  const [f, setF] = useState({ q: '', vendorId: '', periode: '' });
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ items: Row[]; total: number; pageSize: number; summary: { totalCashback: string } } | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    const p = new URLSearchParams({ page: String(page) });
    Object.entries(f).forEach(([k, v]) => v && p.set(k, v));
    api<NonNullable<typeof data>>(`/cashback?${p}`).then(setData).catch((e) => setError(errorText(e)));
  }, [f, page]);
  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);
  const set = (k: keyof typeof f, v: string) => { setPage(1); setF({ ...f, [k]: v }); };
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <>
      <div className="card grid grid-cols-1 gap-3 p-4 sm:grid-cols-3">
        <div className="relative">
          <Search size={15} className="absolute left-2.5 top-2.5 text-slate-400" />
          <input className="input pl-8" placeholder="Cari no. klaim / no. PO" value={f.q} onChange={(e) => set('q', e.target.value)} />
        </div>
        {vendors.length > 0 && (
          <select className="input" value={f.vendorId} onChange={(e) => set('vendorId', e.target.value)}>
            <option value="">Semua vendor</option>
            {vendors.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        )}
        <input type="month" className="input" value={f.periode} onChange={(e) => set('periode', e.target.value)} title="Periode" />
      </div>
      {error && <div className="rounded bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-3 py-2">No. Klaim</th><th className="px-3 py-2">Tanggal</th><th className="px-3 py-2">Periode</th>
              <th className="px-3 py-2">Vendor</th><th className="px-3 py-2">PO</th><th className="px-3 py-2">Metode</th>
              <th className="px-3 py-2 text-right">Total Cashback</th>
            </tr>
          </thead>
          <tbody>
            {data?.items.map((r) => (
              <tr key={r.id} className="cursor-pointer border-t border-slate-100 hover:bg-slate-50" onClick={() => nav(`/cashback/${r.id}`)}>
                <td className="px-3 py-2 font-semibold whitespace-nowrap text-blue-800">{r.receiptNo}</td>
                <td className="px-3 py-2 whitespace-nowrap">{tanggal(r.tanggal)}</td>
                <td className="px-3 py-2">{r.periode}</td>
                <td className="px-3 py-2">{r.vendor.namaVendor}</td>
                <td className="px-3 py-2 text-xs">{[...new Set(r.pos.map((p: Row) => p.po.poNumber))].join(', ') || <i className="text-slate-400">tanpa PO</i>}</td>
                <td className="px-3 py-2">{r.metodePengiriman === 'CASH' ? 'Tunai' : 'Transfer'}</td>
                <td className="px-3 py-2 text-right whitespace-nowrap">{rupiah(r.totalCashback)}</td>
              </tr>
            ))}
            {data && !data.items.length && <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-400">Belum ada klaim cashback</td></tr>}
          </tbody>
        </table>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 px-4 py-2 text-xs text-slate-500">
          <span>{data?.total ?? 0} klaim · Total {rupiah(data?.summary.totalCashback ?? 0)}</span>
          <Pager page={page} pages={pages} set={setPage} />
        </div>
      </div>
    </>
  );
}

function DistributionList() {
  const { user } = useAuth();
  const branches = useOptions('/branches', (b) => b.namaCabang);
  const [f, setF] = useState({ periode: '', status: '', branchId: '' });
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ items: Row[]; total: number; pageSize: number; summary: Record<string, { kabeng: string; perusahaan: string }> } | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const p = new URLSearchParams({ page: String(page) });
    Object.entries(f).forEach(([k, v]) => v && p.set(k, v));
    api<NonNullable<typeof data>>(`/cashback/distributions?${p}`).then(setData).catch((e) => setError(errorText(e)));
  }, [f, page]);
  const set = (k: keyof typeof f, v: string) => { setPage(1); setF({ ...f, [k]: v }); };
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const s = data?.summary ?? {};

  return (
    <>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat label="Hak Kepala Bengkel belum dibayar" value={rupiah(s.UNPAID?.kabeng ?? 0)} tone="amber" />
        <Stat label="Hak Kepala Bengkel sudah dibayar" value={rupiah(s.PAID?.kabeng ?? 0)} tone="emerald" />
        {user?.role !== 'KEPALA_BENGKEL' && (
          <Stat label="Hak Perusahaan" value={rupiah(Object.values(s).reduce((a, x) => a + Number(x.perusahaan), 0))} tone="blue" />
        )}
      </div>
      <div className="card grid grid-cols-1 gap-3 p-4 sm:grid-cols-3">
        <input type="month" className="input" value={f.periode} onChange={(e) => set('periode', e.target.value)} title="Periode" />
        <select className="input" value={f.status} onChange={(e) => set('status', e.target.value)}>
          <option value="">Semua status</option>
          {Object.entries(DIST_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        {user?.role === 'SUPER_ADMIN' && (
          <select className="input" value={f.branchId} onChange={(e) => set('branchId', e.target.value)}>
            <option value="">Semua cabang</option>
            {branches.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        )}
      </div>
      {error && <div className="rounded bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[820px] text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-3 py-2">Periode</th><th className="px-3 py-2">Cabang</th><th className="px-3 py-2">Produk</th>
              <th className="px-3 py-2">PO / Klaim</th><th className="px-3 py-2 text-right">Pcs</th>
              <th className="px-3 py-2 text-right">Hak Kabeng</th>
              {user?.role !== 'KEPALA_BENGKEL' && <th className="px-3 py-2 text-right">Hak Perusahaan</th>}
              <th className="px-3 py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {data?.items.map((d) => (
              <tr key={d.id} className="border-t border-slate-100">
                <td className="px-3 py-2">{d.periode}</td>
                <td className="px-3 py-2">{d.branch.namaCabang}</td>
                <td className="px-3 py-2"><b>{d.product.kodeProduk}</b> {d.product.namaProduk}</td>
                <td className="px-3 py-2 text-xs">
                  {d.po?.poNumber ?? <i className="text-slate-400">tanpa PO</i>}
                  <div><Link className="text-blue-700" to={`/cashback/${d.receipt.id}`}>{d.receipt.receiptNo}</Link></div>
                </td>
                <td className="px-3 py-2 text-right">{angka(d.qtyPcs)}</td>
                <td className="px-3 py-2 text-right whitespace-nowrap">{rupiah(d.totalFeeKabeng)}</td>
                {user?.role !== 'KEPALA_BENGKEL' && <td className="px-3 py-2 text-right whitespace-nowrap">{rupiah(d.totalFeePerusahaan)}</td>}
                <td className="px-3 py-2"><DistBadge s={d.status} /></td>
              </tr>
            ))}
            {data && !data.items.length && <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-400">Belum ada distribusi</td></tr>}
          </tbody>
        </table>
        <div className="flex items-center justify-between border-t border-slate-200 px-4 py-2 text-xs text-slate-500">
          <span>{data?.total ?? 0} baris</span>
          <Pager page={page} pages={pages} set={setPage} />
        </div>
      </div>
    </>
  );
}

export function Stat({ label, value, tone }: { label: string; value: string; tone: 'amber' | 'emerald' | 'blue' }) {
  const c = { amber: 'border-l-amber-500', emerald: 'border-l-emerald-500', blue: 'border-l-blue-600' }[tone];
  return (
    <div className={`card border-l-4 p-4 ${c}`}>
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-1 text-lg font-bold text-slate-800">{value}</div>
    </div>
  );
}
