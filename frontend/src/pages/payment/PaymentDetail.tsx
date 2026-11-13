import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, Download, Paperclip, XCircle } from 'lucide-react';
import { api, download, errorText, rupiah, tanggal, angka } from '../../lib/api';
import type { Row } from '../../components/CrudPage';
import { Modal } from '../../components/Modal';
import { METODE, PayBadge } from './PaymentPage';

export function PaymentDetailPage() {
  const { id } = useParams();
  const [p, setP] = useState<Row | null>(null);
  const [error, setError] = useState('');
  const [confirm, setConfirm] = useState<'SUCCESS' | 'FAILED' | null>(null);
  const [catatan, setCatatan] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api<Row>(`/payments/${id}`).then(setP).catch((e) => setError(errorText(e)));
  }, [id]);
  useEffect(load, [load]);

  const doConfirm = async () => {
    setBusy(true);
    try {
      await api(`/payments/${id}/confirm`, { method: 'POST', body: { status: confirm, catatan } });
      setConfirm(null);
      setCatatan('');
      load();
    } catch (e) {
      setError(errorText(e));
      setConfirm(null);
    } finally {
      setBusy(false);
    }
  };

  if (!p) return <div className="p-6 text-slate-500">{error || 'Memuat...'}</div>;
  const total = p.details.reduce((a: number, d: Row) => a + Number(d.nominal), 0);
  const isImage = p.buktiFile?.mimeType?.startsWith('image/');

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Link to="/pembayaran/tab/riwayat" className="btn-secondary"><ArrowLeft size={16} /></Link>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-slate-800">{p.paymentNo}</h1>
          <div className="mt-1"><PayBadge s={p.status} /></div>
        </div>
        <button className="btn-secondary" onClick={() => download(`/payments/${p.id}/slip.txt`, 'slip.txt').catch((e) => setError(errorText(e)))}>
          <Download size={15} /> Unduh Slip
        </button>
        {p.buktiFile && (
          <a className="btn-secondary" href={`/api/files/${p.buktiFile.id}`} download={p.buktiFile.originalName}><Paperclip size={15} /> Unduh Bukti</a>
        )}
      </div>
      {error && <div className="rounded bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      {p.canConfirm && (
        <div className="card flex flex-wrap items-center gap-2 border-amber-300 bg-amber-50 p-3 text-sm">
          <span className="flex-1">Pembayaran ini menunggu konfirmasi. Item distribusinya dikunci sampai dikonfirmasi.</span>
          <button className="btn-primary" onClick={() => setConfirm('SUCCESS')}><CheckCircle2 size={15} /> Konfirmasi Lunas</button>
          <button className="btn-danger" onClick={() => setConfirm('FAILED')}><XCircle size={15} /> Tandai Gagal</button>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="card grid grid-cols-2 gap-4 p-5 text-sm lg:col-span-2">
          <div><div className="text-xs text-slate-500">Periode</div><div className="font-medium">{p.periode}</div></div>
          <div><div className="text-xs text-slate-500">Tanggal bayar</div><div className="font-medium">{tanggal(p.tanggalBayar)}</div></div>
          <div><div className="text-xs text-slate-500">Metode</div><div className="font-medium">{METODE[p.metode]}</div></div>
          <div><div className="text-xs text-slate-500">Dibuat oleh</div><div className="font-medium">{p.createdBy.nama}</div></div>
          {p.confirmedBy && (
            <div><div className="text-xs text-slate-500">Dikonfirmasi</div><div className="font-medium">{p.confirmedBy.nama}, {new Date(p.confirmedAt).toLocaleString('id-ID')}</div></div>
          )}
          {p.catatan && <div className="col-span-2"><div className="text-xs text-slate-500">Catatan</div><div className="whitespace-pre-line">{p.catatan}</div></div>}
          <div className="col-span-2 border-t border-slate-200 pt-3">
            <div className="text-xs text-slate-500">TOTAL</div>
            <div className="text-2xl font-bold">{rupiah(total)}</div>
          </div>
        </div>
        <div className="card p-4">
          <div className="mb-2 text-xs font-semibold text-slate-500">BUKTI TRANSFER / KWITANSI</div>
          {p.buktiFile ? (
            isImage ? (
              <a href={`/api/files/${p.buktiFile.id}`} target="_blank" rel="noreferrer"><img src={`/api/files/${p.buktiFile.id}`} alt="Bukti" className="max-h-72 w-full rounded border border-slate-200 object-contain" /></a>
            ) : (
              <a className="text-blue-700" href={`/api/files/${p.buktiFile.id}`} target="_blank" rel="noreferrer">{p.buktiFile.originalName}</a>
            )
          ) : <div className="text-sm text-slate-400">Tidak ada lampiran</div>}
        </div>
      </div>

      {p.details.map((d: Row) => (
        <div key={d.id} className="card overflow-x-auto">
          <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 p-4">
            <div className="flex-1">
              <div className="font-semibold text-slate-800">{d.employee.nama} <span className="text-sm font-normal text-slate-500">· {d.branch.namaCabang}</span></div>
              {p.metode === 'TRANSFER_MANUAL' && <div className="text-xs text-slate-600">{d.bank} {d.rekening} a.n. {d.namaRekening}</div>}
              {d.referensiPembayaran && <div className="text-xs text-slate-500">Ref: {d.referensiPembayaran}</div>}
            </div>
            <div className="text-lg font-bold">{rupiah(d.nominal)}</div>
          </div>
          <table className="w-full min-w-[560px] text-sm">
            <tbody>
              {d.items.map((it: Row) => (
                <tr key={it.id} className="border-t border-slate-100 first:border-0">
                  <td className="px-4 py-2 text-xs">{it.distribution.po?.poNumber ?? <i className="text-slate-400">manual</i>}</td>
                  <td className="px-3 py-2"><b>{it.distribution.product.kodeProduk}</b> {it.distribution.product.namaProduk}</td>
                  <td className="px-3 py-2 text-right">{angka(it.distribution.qtyPcs)} pcs</td>
                  <td className="px-4 py-2 text-right whitespace-nowrap">{rupiah(it.nominal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}

      {confirm && (
        <Modal title={confirm === 'SUCCESS' ? 'Konfirmasi Lunas' : 'Tandai Gagal'} onClose={() => setConfirm(null)}>
          <p className="mb-3 text-sm text-slate-600">
            {confirm === 'SUCCESS'
              ? 'Semua item dalam pembayaran ini akan ditandai sudah dibayar dan Kepala Bengkel menerima notifikasi.'
              : 'Pembayaran ditandai gagal. Item distribusinya kembali ke antrean outstanding dan bisa dibayar ulang.'}
          </p>
          <label className="label">Catatan (opsional)</label>
          <input className="input" value={catatan} onChange={(e) => setCatatan(e.target.value)} />
          <div className="mt-4 flex justify-end gap-2">
            <button className="btn-secondary" onClick={() => setConfirm(null)}>Batal</button>
            <button className={confirm === 'SUCCESS' ? 'btn-primary' : 'btn-danger'} disabled={busy} onClick={doConfirm}>Konfirmasi</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
