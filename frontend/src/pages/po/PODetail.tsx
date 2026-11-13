import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Pencil, Printer, Trash2 } from 'lucide-react';
import { api, errorText, rupiah, tanggal, angka } from '../../lib/api';
import type { Row } from '../../components/CrudPage';
import { POStatusBadge, PO_STATUS, type POStatus } from '../../components/POStatusBadge';
import { Modal } from '../../components/Modal';

/** Kelompokkan baris detail per cabang (untuk PO multi cabang). */
export function groupByBranch(details: Row[]) {
  const m = new Map<number, { branch: Row; rows: Row[] }>();
  for (const d of details) {
    const g = m.get(d.branchId) ?? { branch: d.branch as Row, rows: [] as Row[] };
    g.rows.push(d);
    m.set(d.branchId, g);
  }
  return [...m.values()];
}

export function PODetailPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const [po, setPo] = useState<Row | null>(null);
  const [error, setError] = useState('');
  const [action, setAction] = useState<{ to: POStatus; label: string } | null>(null);
  const [catatan, setCatatan] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api<Row>(`/po/${id}`).then(setPo).catch((e) => setError(errorText(e)));
  }, [id]);
  useEffect(load, [load]);

  const doAction = async () => {
    if (!action) return;
    setBusy(true);
    try {
      await api(`/po/${id}/status`, { method: 'POST', body: { to: action.to, catatan } });
      setAction(null);
      setCatatan('');
      load();
    } catch (e) {
      setError(errorText(e));
      setAction(null);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!window.confirm('Hapus PO ini?')) return;
    try {
      await api(`/po/${id}`, { method: 'DELETE' });
      nav('/po');
    } catch (e) {
      setError(errorText(e));
    }
  };

  if (!po) return <div className="p-6 text-slate-500">{error || 'Memuat...'}</div>;
  const groups = groupByBranch(po.details);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Link to="/po" className="btn-secondary"><ArrowLeft size={16} /></Link>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-slate-800">{po.poNumber}</h1>
          <div className="mt-1"><POStatusBadge status={po.status} cashback={po.cashbackClaimed} /></div>
        </div>
        <Link to={`/po/${po.id}/cetak`} target="_blank" className="btn-secondary"><Printer size={15} /> Cetak / PNG</Link>
        {po.canEdit && <Link to={`/po/${po.id}/edit`} className="btn-secondary"><Pencil size={15} /> Edit</Link>}
        {po.canDelete && <button className="btn-secondary text-red-600" onClick={remove}><Trash2 size={15} /> Hapus</button>}
      </div>

      {error && <div className="rounded bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      {po.allowedTransitions.length > 0 && (
        <div className="card flex flex-wrap items-center gap-2 p-3">
          <span className="text-sm text-slate-600">Aksi:</span>
          {po.allowedTransitions.map((t: { to: POStatus; label: string }) => (
            <button key={t.to} className={t.to === 'CANCEL' || t.to === 'DRAFT' ? 'btn-secondary' : 'btn-primary'} onClick={() => setAction(t)}>
              {t.label}
            </button>
          ))}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="card p-5 lg:col-span-2">
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm md:grid-cols-3">
            <Info k="Tanggal PO" v={tanggal(po.tanggalPo)} />
            <Info k="Vendor" v={po.vendor.namaVendor} />
            <Info k="Cabang" v={po.isMulti ? `Multi cabang (${groups.length})` : po.branch?.namaCabang} />
            <Info k="Dibuat oleh" v={po.createdBy.nama} />
            <Info k="Disetujui oleh" v={po.approvedBy ? `${po.approvedBy.nama}, ${tanggal(po.approvedAt)}` : '-'} />
            <Info k="Total" v={`${angka(po.totalDus)} dus / ${angka(po.totalPcs)} pcs`} />
            {po.catatan && <div className="col-span-full"><Info k="Catatan" v={po.catatan} /></div>}
          </dl>
        </div>
        <div className="card p-5">
          <div className="text-xs font-semibold text-slate-500">GRAND TOTAL</div>
          <div className="mt-1 text-2xl font-bold text-slate-800">{rupiah(po.grandTotal)}</div>
          {po.cashbackClaimed && <div className="mt-2 text-xs text-emerald-700">Cashback vendor untuk PO ini sudah diklaim.</div>}
        </div>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-3 py-2">Produk</th>
              <th className="px-3 py-2 text-right">Qty Dus</th>
              <th className="px-3 py-2 text-right">Isi/Dus</th>
              <th className="px-3 py-2 text-right">Total Pcs</th>
              <th className="px-3 py-2 text-right">Harga / pcs</th>
              <th className="px-3 py-2 text-right">Subtotal</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <BranchRows key={g.branch.id} group={g} showHeader={po.isMulti} />
            ))}
          </tbody>
        </table>
      </div>

      <div className="card p-5">
        <h2 className="mb-3 font-semibold text-slate-800">Riwayat Status</h2>
        <ol className="space-y-3 border-l-2 border-slate-200 pl-4">
          {po.statusHistories.map((h: Row) => (
            <li key={h.id} className="relative text-sm">
              <span className="absolute -left-[22px] top-1 h-3 w-3 rounded-full border-2 border-white bg-blue-600" />
              <div className="font-medium text-slate-800">
                {h.fromStatus ? `${PO_STATUS[h.fromStatus as POStatus].label} → ` : ''}
                {PO_STATUS[h.toStatus as POStatus].label}
              </div>
              <div className="text-xs text-slate-500">
                {h.user.nama} · {new Date(h.createdAt).toLocaleString('id-ID')}
                {h.catatan ? ` · "${h.catatan}"` : ''}
              </div>
            </li>
          ))}
        </ol>
      </div>

      {action && (
        <Modal title={`${action.label}: ${po.poNumber}`} onClose={() => setAction(null)}>
          <p className="mb-3 text-sm text-slate-600">
            Status akan berubah dari <b>{PO_STATUS[po.status as POStatus].label}</b> menjadi <b>{PO_STATUS[action.to].label}</b>.
          </p>
          <label className="label">Catatan (opsional)</label>
          <input className="input" value={catatan} onChange={(e) => setCatatan(e.target.value)} maxLength={255} />
          <div className="mt-4 flex justify-end gap-2">
            <button className="btn-secondary" onClick={() => setAction(null)}>Batal</button>
            <button className={action.to === 'CANCEL' ? 'btn-danger' : 'btn-primary'} disabled={busy} onClick={doAction}>Konfirmasi</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Info({ k, v }: { k: string; v: string | undefined }) {
  return (
    <div>
      <dt className="text-xs text-slate-500">{k}</dt>
      <dd className="font-medium text-slate-800">{v ?? '-'}</dd>
    </div>
  );
}

function BranchRows({ group, showHeader }: { group: { branch: Row; rows: Row[] }; showHeader: boolean }) {
  const sub = group.rows.reduce((a, d) => a + Number(d.subtotal), 0);
  return (
    <>
      {showHeader && (
        <tr className="border-t border-slate-200 bg-purple-50">
          <td colSpan={5} className="px-3 py-1.5 text-xs font-semibold text-purple-800">{group.branch.kodeCabang} · {group.branch.namaCabang}</td>
          <td className="px-3 py-1.5 text-right text-xs font-semibold text-purple-800">{rupiah(sub)}</td>
        </tr>
      )}
      {group.rows.map((d) => (
        <tr key={d.id} className="border-t border-slate-100">
          <td className="px-3 py-2"><b>{d.product.kodeProduk}</b> {d.namaProduk}</td>
          <td className="px-3 py-2 text-right">{angka(d.qtyDus)}</td>
          <td className="px-3 py-2 text-right">{d.isiPerDus}</td>
          <td className="px-3 py-2 text-right">{angka(d.totalPcs)}</td>
          <td className="px-3 py-2 text-right whitespace-nowrap">{rupiah(d.harga)}</td>
          <td className="px-3 py-2 text-right whitespace-nowrap">{rupiah(d.subtotal)}</td>
        </tr>
      ))}
    </>
  );
}
