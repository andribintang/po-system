import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Paperclip, Trash2 } from 'lucide-react';
import { api, errorText, rupiah, tanggal, angka } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import type { Row } from '../../components/CrudPage';
import { DistBadge, Stat } from './CashbackList';

export function CashbackDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const nav = useNavigate();
  const [r, setR] = useState<Row | null>(null);
  const [error, setError] = useState('');
  const isKB = user?.role === 'KEPALA_BENGKEL';

  useEffect(() => {
    api<Row>(`/cashback/${id}`).then(setR).catch((e) => setError(errorText(e)));
  }, [id]);

  const remove = async () => {
    if (!window.confirm('Batalkan klaim ini? Distribusinya dihapus dan PO terkait bisa diklaim ulang.')) return;
    try {
      await api(`/cashback/${id}`, { method: 'DELETE' });
      nav('/cashback');
    } catch (e) {
      setError(errorText(e));
    }
  };

  if (!r) return <div className="p-6 text-slate-500">{error || 'Memuat...'}</div>;
  const sum = (k: string) => r.distributions.reduce((a: number, d: Row) => a + Number(d[k]), 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Link to="/cashback" className="btn-secondary"><ArrowLeft size={16} /></Link>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-slate-800">{r.receiptNo}</h1>
          <div className="text-sm text-slate-500">{r.vendor.namaVendor} · periode {r.periode}</div>
        </div>
        {r.canDelete && <button className="btn-secondary text-red-600" onClick={remove}><Trash2 size={15} /> Batalkan Klaim</button>}
      </div>
      {error && <div className="rounded bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      <div className="card grid grid-cols-2 gap-4 p-5 text-sm md:grid-cols-4">
        <div><div className="text-xs text-slate-500">Tanggal diterima</div><div className="font-medium">{tanggal(r.tanggal)}</div></div>
        <div><div className="text-xs text-slate-500">Metode</div><div className="font-medium">{r.metodePengiriman === 'CASH' ? 'Tunai' : 'Transfer'}</div></div>
        <div><div className="text-xs text-slate-500">Dicatat oleh</div><div className="font-medium">{r.createdBy.nama}</div></div>
        <div>
          <div className="text-xs text-slate-500">Bukti</div>
          {r.buktiFile ? (
            <a className="inline-flex items-center gap-1 font-medium text-blue-700" href={`/api/files/${r.buktiFile.id}`} target="_blank" rel="noreferrer">
              <Paperclip size={14} /> {r.buktiFile.originalName}
            </a>
          ) : <div>-</div>}
        </div>
        <div className="col-span-full">
          <div className="text-xs text-slate-500">PO terkait</div>
          <div className="flex flex-wrap gap-1">
            {r.pos.length ? r.pos.map((p: Row) =>
              isKB ? (
                <span key={p.id} className="rounded bg-slate-100 px-2 py-0.5 text-xs">{p.po.poNumber} · {p.branch.namaCabang}</span>
              ) : (
                <Link key={p.id} to={`/po/${p.po.id}`} className="rounded bg-slate-100 px-2 py-0.5 text-xs hover:bg-blue-50">{p.po.poNumber} · {p.branch.namaCabang}</Link>
              ),
            ) : <span className="text-slate-400">Tanpa PO (input manual)</span>}
          </div>
        </div>
        {r.catatan && <div className="col-span-full"><div className="text-xs text-slate-500">Catatan</div>{r.catatan}</div>}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {!isKB && <Stat label="Total klaim vendor" value={rupiah(r.totalCashback)} tone="blue" />}
        <Stat label={isKB ? 'Hak Kepala Bengkel cabang Anda' : 'Hak Kepala Bengkel'} value={rupiah(sum('totalFeeKabeng'))} tone="amber" />
        {!isKB && <Stat label="Hak Perusahaan" value={rupiah(sum('totalFeePerusahaan'))} tone="emerald" />}
      </div>

      <div className="card overflow-x-auto">
        <div className="border-b border-slate-200 p-4 font-semibold text-slate-800">Distribusi per cabang & produk</div>
        <table className="w-full min-w-[760px] text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-3 py-2">Cabang</th><th className="px-3 py-2">Produk</th><th className="px-3 py-2">PO</th>
              <th className="px-3 py-2 text-right">Pcs</th><th className="px-3 py-2 text-right">Fee Kabeng/pcs</th>
              <th className="px-3 py-2 text-right">Hak Kabeng</th>
              {!isKB && <th className="px-3 py-2 text-right">Hak Perusahaan</th>}
              <th className="px-3 py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {r.distributions.map((d: Row) => (
              <tr key={d.id} className="border-t border-slate-100">
                <td className="px-3 py-2">{d.branch.namaCabang}</td>
                <td className="px-3 py-2"><b>{d.product.kodeProduk}</b> {d.product.namaProduk}</td>
                <td className="px-3 py-2 text-xs">{d.po?.poNumber ?? <i className="text-slate-400">manual</i>}</td>
                <td className="px-3 py-2 text-right">{angka(d.qtyPcs)}</td>
                <td className="px-3 py-2 text-right whitespace-nowrap">{rupiah(d.feeKabengPerPcs)}</td>
                <td className="px-3 py-2 text-right whitespace-nowrap">{rupiah(d.totalFeeKabeng)}</td>
                {!isKB && <td className="px-3 py-2 text-right whitespace-nowrap">{rupiah(d.totalFeePerusahaan)}</td>}
                <td className="px-3 py-2"><DistBadge s={d.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
