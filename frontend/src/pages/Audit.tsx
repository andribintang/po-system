import { Fragment, useEffect, useState } from 'react';
import { FileDown, FileSpreadsheet } from 'lucide-react';
import { api, download, errorText, type Paged } from '../lib/api';

interface Log { id: string; namaUser: string; aksi: string; modul: string; refId: string | null; ipAddress: string | null; createdAt: string; dataLama: unknown; dataBaru: unknown }
const MODULES = ['ALL', 'AUTH', 'MASTER', 'USER', 'SETTINGS', 'PO', 'CASHBACK', 'PAYOUT'];

export function AuditPage() {
  const [modul, setModul] = useState('ALL');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Paged<Log> | null>(null);
  const [error, setError] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const params = (extra: Record<string, string>) => {
    const p = new URLSearchParams({ modul, ...extra });
    if (q) p.set('q', q);
    if (from) p.set('from', from);
    if (to) p.set('to', to);
    return p;
  };
  const exportFile = (format: 'csv' | 'xlsx') => download(`/audit-logs?${params({ format })}`, `audit-trail.${format}`).catch((e) => setError(errorText(e)));

  useEffect(() => {
    const t = setTimeout(() => {
      const p = params({ page: String(page), pageSize: '50' });
      api<Paged<Log>>(`/audit-logs?${p}`).then(setData).catch((e) => setError(errorText(e)));
    }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modul, q, page, from, to]);

  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold text-slate-800">Audit Trail</h1>
        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
          <input type="date" className="input w-40" aria-label="Dari tanggal" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} />
          s/d
          <input type="date" className="input w-40" aria-label="Sampai tanggal" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} />
          <button className="btn-secondary" onClick={() => exportFile('csv')}><FileDown size={16} />CSV</button>
          <button className="btn-secondary" onClick={() => exportFile('xlsx')}><FileSpreadsheet size={16} />Excel</button>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {MODULES.map((m) => (
          <button key={m} onClick={() => { setModul(m); setPage(1); }} className={`rounded-md px-3 py-1.5 text-xs font-semibold ${modul === m ? 'bg-blue-700 text-white' : 'bg-white text-slate-600'}`}>{m}</button>
        ))}
        <input className="input ml-auto w-60" placeholder="Cari user / aksi / ID..." value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
      </div>
      {error && <div className="rounded bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr><th className="px-4 py-2">Waktu</th><th className="px-4 py-2">User</th><th className="px-4 py-2">Modul</th><th className="px-4 py-2">Aksi</th><th className="px-4 py-2">Ref</th><th className="px-4 py-2">IP</th></tr>
          </thead>
          <tbody>
            {data?.items.map((l) => (
              <Fragment key={l.id}>
                <tr className="cursor-pointer border-t border-slate-100 hover:bg-slate-50" onClick={() => setOpen(open === l.id ? null : l.id)}>
                  <td className="px-4 py-2 whitespace-nowrap">{new Date(l.createdAt).toLocaleString('id-ID')}</td>
                  <td className="px-4 py-2">{l.namaUser}</td>
                  <td className="px-4 py-2"><span className="rounded bg-slate-100 px-1.5 text-xs">{l.modul}</span></td>
                  <td className="px-4 py-2 font-mono text-xs">{l.aksi}</td>
                  <td className="px-4 py-2">{l.refId ?? '-'}</td>
                  <td className="px-4 py-2 text-xs text-slate-500">{l.ipAddress ?? '-'}</td>
                </tr>
                {open === l.id && (
                  <tr className="bg-slate-50">
                    <td colSpan={6} className="px-4 py-2">
                      <div className="grid gap-2 md:grid-cols-2">
                        <pre className="max-h-64 overflow-auto rounded bg-white p-2 text-xs"><b>Sebelum:</b>{'\n'}{JSON.stringify(l.dataLama, null, 2) ?? '-'}</pre>
                        <pre className="max-h-64 overflow-auto rounded bg-white p-2 text-xs"><b>Sesudah:</b>{'\n'}{JSON.stringify(l.dataBaru, null, 2) ?? '-'}</pre>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
        <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-4 py-2 text-xs text-slate-500">
          <button className="btn-secondary px-2 py-1" disabled={page <= 1} onClick={() => setPage(page - 1)}>‹</button>
          <span>{page} / {pages}</span>
          <button className="btn-secondary px-2 py-1" disabled={page >= pages} onClick={() => setPage(page + 1)}>›</button>
        </div>
      </div>
    </div>
  );
}
