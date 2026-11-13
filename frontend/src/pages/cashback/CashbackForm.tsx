import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, Trash2 } from 'lucide-react';
import { api, errorText, rupiah, tanggal, angka, type Paged } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useOptions, type Row } from '../../components/CrudPage';
import { Stat } from './CashbackList';

interface Manual { branchId: string; productId: string; qtyPcs: string }
interface Preview { lines: Row[]; totals: { qtyPcs: number; vendor: string; kabeng: string; perusahaan: string } }

const thisMonth = () => new Date().toISOString().slice(0, 7);
const today = () => new Date().toISOString().slice(0, 10);

export function CashbackFormPage() {
  const { user } = useAuth();
  const nav = useNavigate();
  const vendors = useOptions('/vendors', (v) => `${v.kodeVendor} - ${v.namaVendor}`);
  const allBranches = useOptions('/branches', (b) => `${b.kodeCabang} - ${b.namaCabang}`);
  const branches = user?.role === 'SUPER_ADMIN' ? allBranches : allBranches.filter((b) => b.value === user?.branchId);

  const [vendorId, setVendorId] = useState('');
  const [periode, setPeriode] = useState(thisMonth());
  const [tgl, setTgl] = useState(today());
  const [metode, setMetode] = useState('TRANSFER');
  const [catatan, setCatatan] = useState('');
  const [bukti, setBukti] = useState<{ id: number; name: string } | null>(null);
  const [eligible, setEligible] = useState<Row[]>([]);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [manual, setManual] = useState<Manual[]>([]);
  const [products, setProducts] = useState<Row[]>([]);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setPicked(new Set());
    setManual([]);
    setPreview(null);
    if (!vendorId) return setEligible([]);
    api<{ items: Row[] }>(`/cashback/eligible?vendorId=${vendorId}`).then((r) => setEligible(r.items)).catch((e) => setError(errorText(e)));
    api<Paged<Row>>(`/products?vendorId=${vendorId}&status=ACTIVE&pageSize=500`).then((r) => setProducts(r.items)).catch(() => setProducts([]));
  }, [vendorId]);

  const body = useMemo(() => ({
    vendorId: Number(vendorId),
    poBranches: [...picked].map((k) => {
      const [poId, branchId] = k.split('-').map(Number);
      return { poId, branchId };
    }),
    manualLines: manual
      .filter((m) => m.branchId && m.productId && Number(m.qtyPcs) > 0)
      .map((m) => ({ branchId: Number(m.branchId), productId: Number(m.productId), qtyPcs: Number(m.qtyPcs) })),
  }), [vendorId, picked, manual]);

  // Pratinjau perhitungan dari server setiap pilihan berubah.
  useEffect(() => {
    if (!vendorId || body.poBranches.length + body.manualLines.length === 0) return setPreview(null);
    const t = setTimeout(() => {
      api<Preview>('/cashback/preview', { method: 'POST', body })
        .then((p) => { setPreview(p); setError(''); })
        .catch((e) => setError(errorText(e)));
    }, 300);
    return () => clearTimeout(t);
  }, [body, vendorId]);

  const toggle = (k: string) => {
    const s = new Set(picked);
    if (s.has(k)) s.delete(k);
    else s.add(k);
    setPicked(s);
  };

  const uploadBukti = async (file?: File) => {
    if (!file) return;
    const fd = new FormData();
    fd.append('file', file);
    try {
      const r = await api<{ id: number; originalName: string }>('/files', { method: 'POST', body: fd });
      setBukti({ id: r.id, name: r.originalName });
    } catch (e) {
      setError(errorText(e));
    }
  };

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      const r = await api<Row>('/cashback', {
        method: 'POST',
        body: { ...body, periode, tanggal: tgl, metodePengiriman: metode, catatan, buktiFileId: bukti?.id ?? null },
      });
      nav(`/cashback/${r.id}`);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setSaving(false);
    }
  };

  const updateManual = (i: number, patch: Partial<Manual>) => setManual(manual.map((m, j) => (j === i ? { ...m, ...patch } : m)));

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Link to="/cashback" className="btn-secondary"><ArrowLeft size={16} /></Link>
        <h1 className="text-xl font-bold text-slate-800">Input Klaim Cashback Vendor</h1>
      </div>

      <div className="card grid grid-cols-1 gap-4 p-5 md:grid-cols-2 lg:grid-cols-4">
        <div className="lg:col-span-2">
          <label className="label">Vendor *</label>
          <select className="input" value={vendorId} onChange={(e) => setVendorId(e.target.value)}>
            <option value="">— Pilih vendor —</option>
            {vendors.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Periode *</label>
          <input type="month" className="input" value={periode} onChange={(e) => setPeriode(e.target.value)} />
        </div>
        <div>
          <label className="label">Tanggal Diterima *</label>
          <input type="date" className="input" value={tgl} onChange={(e) => setTgl(e.target.value)} />
        </div>
        <div>
          <label className="label">Metode Penerimaan *</label>
          <select className="input" value={metode} onChange={(e) => setMetode(e.target.value)}>
            <option value="TRANSFER">Transfer</option>
            <option value="CASH">Tunai / Cash</option>
          </select>
        </div>
        <div>
          <label className="label">Bukti Transfer / Kwitansi</label>
          {bukti ? (
            <div className="flex items-center gap-2 text-sm">
              <a href={`/api/files/${bukti.id}`} target="_blank" rel="noreferrer" className="truncate text-blue-700">{bukti.name}</a>
              <button className="text-xs text-red-600" onClick={() => setBukti(null)}>hapus</button>
            </div>
          ) : (
            <input type="file" accept="image/png,image/jpeg,image/webp,application/pdf" className="text-sm" onChange={(e) => uploadBukti(e.target.files?.[0])} />
          )}
        </div>
        <div className="md:col-span-2">
          <label className="label">Catatan</label>
          <input className="input" value={catatan} onChange={(e) => setCatatan(e.target.value)} />
        </div>
      </div>

      {vendorId && (
        <div className="card overflow-x-auto">
          <div className="border-b border-slate-200 p-4">
            <h2 className="font-semibold text-slate-800">PO yang diklaim</h2>
            <p className="text-xs text-slate-500">Hanya PO berstatus Approved ke atas yang belum diklaim. PO multi cabang tampil per cabang.</p>
          </div>
          <table className="w-full min-w-[600px] text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="w-8 px-3 py-2">
                  <input
                    type="checkbox"
                    checked={eligible.length > 0 && picked.size === eligible.length}
                    onChange={() => setPicked(picked.size === eligible.length ? new Set() : new Set(eligible.map((e) => `${e.poId}-${e.branchId}`)))}
                  />
                </th>
                <th className="px-3 py-2">No. PO</th><th className="px-3 py-2">Tanggal</th><th className="px-3 py-2">Cabang</th>
                <th className="px-3 py-2 text-right">Total Pcs</th>
              </tr>
            </thead>
            <tbody>
              {eligible.map((e) => {
                const k = `${e.poId}-${e.branchId}`;
                return (
                  <tr key={k} className="cursor-pointer border-t border-slate-100 hover:bg-slate-50" onClick={() => toggle(k)}>
                    <td className="px-3 py-2"><input type="checkbox" readOnly checked={picked.has(k)} /></td>
                    <td className="px-3 py-2 font-semibold">{e.poNumber} {e.isMulti && <span className="ml-1 rounded bg-purple-100 px-1 text-[10px] text-purple-800">MULTI</span>}</td>
                    <td className="px-3 py-2">{tanggal(e.tanggalPo)}</td>
                    <td className="px-3 py-2">{e.branch.namaCabang}</td>
                    <td className="px-3 py-2 text-right">{angka(e.totalPcs)}</td>
                  </tr>
                );
              })}
              {!eligible.length && <tr><td colSpan={5} className="px-4 py-6 text-center text-slate-400">Tidak ada PO vendor ini yang bisa diklaim</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {vendorId && (
        <div className="card p-4">
          <div className="mb-2 flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-slate-800">Baris manual (tanpa PO)</h2>
              <p className="text-xs text-slate-500">Untuk cashback yang tidak terkait PO di sistem. Isi jumlah pcs per cabang & produk.</p>
            </div>
            <button className="btn-secondary" onClick={() => setManual([...manual, { branchId: branches.length === 1 ? String(branches[0].value) : '', productId: '', qtyPcs: '' }])}>
              <Plus size={15} /> Baris
            </button>
          </div>
          {manual.map((m, i) => (
            <div key={i} className="mb-2 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1.5fr_120px_auto]">
              <select className="input" value={m.branchId} onChange={(e) => updateManual(i, { branchId: e.target.value })}>
                <option value="">— Cabang —</option>
                {branches.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              <select className="input" value={m.productId} onChange={(e) => updateManual(i, { productId: e.target.value })}>
                <option value="">— Produk —</option>
                {products.map((p) => <option key={p.id} value={p.id}>{p.kodeProduk} - {p.namaProduk}</option>)}
              </select>
              <input className="input" type="number" min="1" placeholder="Pcs" value={m.qtyPcs} onChange={(e) => updateManual(i, { qtyPcs: e.target.value })} />
              <button className="rounded p-2 text-red-600 hover:bg-red-50" onClick={() => setManual(manual.filter((_, j) => j !== i))}><Trash2 size={16} /></button>
            </div>
          ))}
        </div>
      )}

      {preview && (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Stat label="Total klaim ke vendor" value={rupiah(preview.totals.vendor)} tone="blue" />
            <Stat label="Hak Kepala Bengkel" value={rupiah(preview.totals.kabeng)} tone="amber" />
            <Stat label="Hak Perusahaan" value={rupiah(preview.totals.perusahaan)} tone="emerald" />
          </div>
          <div className="card overflow-x-auto">
            <div className="border-b border-slate-200 p-4 font-semibold text-slate-800">Rincian perhitungan per cabang & produk</div>
            <table className="w-full min-w-[860px] text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2">Cabang (Area)</th><th className="px-3 py-2">Produk</th><th className="px-3 py-2">PO</th>
                  <th className="px-3 py-2 text-right">Pcs</th><th className="px-3 py-2">Tarif</th>
                  <th className="px-3 py-2 text-right">Klaim Vendor</th><th className="px-3 py-2 text-right">Hak Kabeng</th><th className="px-3 py-2 text-right">Hak Perusahaan</th>
                </tr>
              </thead>
              <tbody>
                {preview.lines.map((l, i) => (
                  <tr key={i} className="border-t border-slate-100">
                    <td className="px-3 py-2">{l.branchName} <span className="text-xs text-slate-500">({l.areaName})</span></td>
                    <td className="px-3 py-2"><b>{l.kodeProduk}</b> {l.namaProduk}</td>
                    <td className="px-3 py-2 text-xs">{l.poNumber ?? <i className="text-slate-400">manual</i>}</td>
                    <td className="px-3 py-2 text-right">{angka(l.qtyPcs)}</td>
                    <td className="px-3 py-2 text-xs">
                      <span className={`rounded px-1 ${l.feeSource === 'AREA' ? 'bg-purple-100 text-purple-800' : 'bg-slate-100'}`}>{l.feeSource === 'AREA' ? 'Area' : 'Default'}</span>
                    </td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">{rupiah(l.totalVendor)}</td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">{rupiah(l.totalKabeng)}</td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">{rupiah(l.totalPerusahaan)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {error && <div className="rounded bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      <div className="flex justify-end">
        <button className="btn-primary" disabled={!preview || saving || !periode || !tgl} onClick={save}>
          {saving ? 'Menyimpan...' : 'Simpan Klaim & Buat Distribusi'}
        </button>
      </div>
    </div>
  );
}
