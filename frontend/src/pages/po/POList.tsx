import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FileDown, FileUp, Plus, Search, Trash2 } from 'lucide-react';
import { api, download, errorText, rupiah, tanggal, angka } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useOptions, type Row } from '../../components/CrudPage';
import { POStatusBadge, PO_STATUS, type POStatus } from '../../components/POStatusBadge';
import { ExcelImport } from '../../components/ExcelImport';

interface ListResp {
  items: Row[];
  total: number;
  page: number;
  pageSize: number;
  summary: { grandTotal: string; totalPcs: number };
}

const EMPTY = { q: '', status: '', vendorId: '', branchId: '', from: '', to: '' };

export function POListPage() {
  const { user } = useAuth();
  const nav = useNavigate();
  const isSA = user?.role === 'SUPER_ADMIN';
  const vendors = useOptions('/vendors', (v) => v.namaVendor);
  const branches = useOptions('/branches', (b) => b.namaCabang);
  const [f, setF] = useState(EMPTY);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<ListResp | null>(null);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [bulkTo, setBulkTo] = useState('');
  const [showImport, setShowImport] = useState(false);

  const params = useCallback(() => {
    const p = new URLSearchParams();
    Object.entries(f).forEach(([k, v]) => v && p.set(k, v));
    return p;
  }, [f]);

  const load = useCallback(async () => {
    try {
      const p = params();
      p.set('page', String(page));
      setData(await api<ListResp>(`/po?${p}`));
      setError('');
    } catch (e) {
      setError(errorText(e));
    }
  }, [params, page]);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  const set = (k: keyof typeof EMPTY, v: string) => {
    setPage(1);
    setF({ ...f, [k]: v });
  };

  const toggle = (id: number) => {
    const s = new Set(selected);
    if (s.has(id)) s.delete(id);
    else s.add(id);
    setSelected(s);
  };

  const runBulkStatus = async () => {
    if (!bulkTo || !selected.size) return;
    try {
      const r = await api<{ success: number; failed: number; results: { ok: boolean; message?: string }[] }>('/po/bulk-status', {
        method: 'POST',
        body: { ids: [...selected], to: bulkTo },
      });
      const fails = r.results.filter((x) => !x.ok).map((x) => x.message);
      setInfo(`${r.success} PO berhasil diubah${r.failed ? `, ${r.failed} gagal: ${[...new Set(fails)].join('; ')}` : ''}`);
      setSelected(new Set());
      load();
    } catch (e) {
      setError(errorText(e));
    }
  };

  const runBulkDelete = async () => {
    if (!selected.size || !window.confirm(`Hapus ${selected.size} PO terpilih? Hanya PO Draft/Cancel yang akan dihapus.`)) return;
    try {
      const r = await api<{ deleted: number; skipped: { poNumber: string }[] }>('/po/bulk-delete', { method: 'POST', body: { ids: [...selected] } });
      setInfo(`${r.deleted} PO dihapus${r.skipped.length ? `, ${r.skipped.length} dilewati karena statusnya bukan Draft/Cancel` : ''}`);
      setSelected(new Set());
      load();
    } catch (e) {
      setError(errorText(e));
    }
  };

  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const allChecked = !!data?.items.length && data.items.every((p) => selected.has(p.id));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="flex-1 text-xl font-bold text-slate-800">Purchase Order</h1>
        <button className="btn-secondary" onClick={() => setShowImport(true)}><FileUp size={15} /> Impor Excel</button>
        <button className="btn-secondary" onClick={() => download(`/po/export.xlsx?${params()}`, 'purchase-order.xlsx').catch((e) => setError(errorText(e)))}>
          <FileDown size={15} /> Ekspor Excel
        </button>
        <Link to="/po/baru" className="btn-primary"><Plus size={15} /> Buat PO</Link>
      </div>

      <div className="card grid grid-cols-2 gap-3 p-4 md:grid-cols-3 lg:grid-cols-6">
        <div className="relative col-span-2 md:col-span-1 lg:col-span-2">
          <Search size={15} className="absolute left-2.5 top-2.5 text-slate-400" />
          <input className="input pl-8" placeholder="Cari no. PO / catatan" value={f.q} onChange={(e) => set('q', e.target.value)} />
        </div>
        <select className="input" value={f.status} onChange={(e) => set('status', e.target.value)}>
          <option value="">Semua status</option>
          {Object.entries(PO_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <select className="input" value={f.vendorId} onChange={(e) => set('vendorId', e.target.value)}>
          <option value="">Semua vendor</option>
          {vendors.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        {isSA && (
          <select className="input" value={f.branchId} onChange={(e) => set('branchId', e.target.value)}>
            <option value="">Semua cabang</option>
            {branches.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        )}
        <div className="col-span-2 flex items-center gap-1 md:col-span-1">
          <input type="date" className="input" value={f.from} onChange={(e) => set('from', e.target.value)} title="Dari tanggal" />
          <input type="date" className="input" value={f.to} onChange={(e) => set('to', e.target.value)} title="Sampai tanggal" />
        </div>
      </div>

      {error && <div className="rounded bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      {info && <div className="rounded bg-blue-50 p-3 text-sm text-blue-800">{info}</div>}

      {isSA && selected.size > 0 && (
        <div className="card flex flex-wrap items-center gap-2 border-blue-300 bg-blue-50 p-3 text-sm">
          <b>{selected.size} PO dipilih</b>
          <select className="input w-auto" value={bulkTo} onChange={(e) => setBulkTo(e.target.value)}>
            <option value="">Ubah status ke…</option>
            {Object.entries(PO_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <button className="btn-primary" disabled={!bulkTo} onClick={runBulkStatus}>Terapkan</button>
          <button className="btn-danger" onClick={runBulkDelete}><Trash2 size={15} /> Hapus</button>
          <button className="ml-auto text-xs text-slate-600" onClick={() => setSelected(new Set())}>Batal pilih</button>
        </div>
      )}

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              {isSA && (
                <th className="w-8 px-3 py-2">
                  <input
                    type="checkbox"
                    checked={allChecked}
                    onChange={() => setSelected(allChecked ? new Set() : new Set(data?.items.map((p) => p.id)))}
                  />
                </th>
              )}
              <th className="px-3 py-2">No. PO</th>
              <th className="px-3 py-2">Tanggal</th>
              <th className="px-3 py-2">Vendor</th>
              <th className="px-3 py-2">Cabang</th>
              <th className="px-3 py-2 text-right">Dus / Pcs</th>
              <th className="px-3 py-2 text-right">Grand Total</th>
              <th className="px-3 py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {data?.items.map((p) => (
              <tr key={p.id} className="cursor-pointer border-t border-slate-100 hover:bg-slate-50" onClick={() => nav(`/po/${p.id}`)}>
                {isSA && (
                  <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                    <input type="checkbox" checked={selected.has(p.id)} onChange={() => toggle(p.id)} />
                  </td>
                )}
                <td className="px-3 py-2 font-semibold whitespace-nowrap text-blue-800">{p.poNumber}</td>
                <td className="px-3 py-2 whitespace-nowrap">{tanggal(p.tanggalPo)}</td>
                <td className="px-3 py-2">{p.vendor.namaVendor}</td>
                <td className="px-3 py-2">
                  {p.isMulti ? <span className="rounded bg-purple-100 px-1.5 text-xs font-semibold text-purple-800">MULTI CABANG</span> : p.branch?.namaCabang}
                </td>
                <td className="px-3 py-2 text-right whitespace-nowrap">{angka(p.totalDus)} / {angka(p.totalPcs)}</td>
                <td className="px-3 py-2 text-right whitespace-nowrap">{rupiah(p.grandTotal)}</td>
                <td className="px-3 py-2"><POStatusBadge status={p.status as POStatus} cashback={p.cashbackClaimed} /></td>
              </tr>
            ))}
            {data && !data.items.length && (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-400">Belum ada PO</td></tr>
            )}
          </tbody>
        </table>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 px-4 py-2 text-xs text-slate-500">
          <span>
            {data?.total ?? 0} PO · Total {angka(data?.summary.totalPcs)} pcs · {rupiah(data?.summary.grandTotal ?? 0)}
          </span>
          <div className="flex items-center gap-2">
            <button className="btn-secondary px-2 py-1" disabled={page <= 1} onClick={() => setPage(page - 1)}>‹</button>
            <span>{page} / {pages}</span>
            <button className="btn-secondary px-2 py-1" disabled={page >= pages} onClick={() => setPage(page + 1)}>›</button>
          </div>
        </div>
      </div>

      {showImport && (
        <ExcelImport
          title="Impor PO dari Excel"
          templatePath="/po/import-template.xlsx"
          importPath="/po/import"
          onClose={() => setShowImport(false)}
          onDone={() => load()}
          describe={(r) => `${(r as { created: unknown[] }).created.length} PO berhasil dibuat sebagai Draft`}
        />
      )}
    </div>
  );
}
