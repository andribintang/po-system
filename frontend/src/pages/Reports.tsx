import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { FileDown, FileSpreadsheet, Printer } from 'lucide-react';
import { angka, api, download, errorText, rupiah, tanggal, type Paged } from '../lib/api';
import { useAuth } from '../lib/auth';
import { POStatusBadge, PO_STATUS, type POStatus } from '../components/POStatusBadge';
import { PayBadge, METODE } from './payment/PaymentPage';

type Tab = 'po' | 'cashback' | 'pembayaran';
const TABS: { k: Tab; l: string; ep: string }[] = [
  { k: 'po', l: 'Rekap PO', ep: '/reports/po' },
  { k: 'cashback', l: 'Cashback Vendor Diterima', ep: '/reports/cashback' },
  { k: 'pembayaran', l: 'Pembayaran Manual & Tunai', ep: '/reports/payments' },
];

interface Opt { id: number; nama: string }
interface Report<T> { title: string; items: T[]; totals: Record<string, string | number> }
type Row = Record<string, string | number>;

const firstOfMonth = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`; };
const today = () => new Date().toLocaleDateString('sv-SE');

export function ReportsPage() {
  const { tab = 'po' } = useParams<{ tab: Tab }>();
  const nav = useNavigate();
  const { user } = useAuth();
  const isSA = user?.role === 'SUPER_ADMIN';
  const cur = TABS.find((t) => t.k === tab) ?? TABS[0];

  const [f, setF] = useState({ from: firstOfMonth(), to: today(), vendorId: '', branchId: '', status: 'ALL', metode: '' });
  const [vendors, setVendors] = useState<Opt[]>([]);
  const [branches, setBranches] = useState<Opt[]>([]);
  const [data, setData] = useState<Report<Row> | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');

  useEffect(() => {
    api<Paged<{ id: number; namaVendor: string }>>('/vendors?pageSize=200').then((r) => setVendors(r.items.map((v) => ({ id: v.id, nama: v.namaVendor })))).catch(() => undefined);
    if (isSA) api<Paged<{ id: number; namaCabang: string }>>('/branches?pageSize=200').then((r) => setBranches(r.items.map((b) => ({ id: b.id, nama: b.namaCabang })))).catch(() => undefined);
  }, [isSA]);

  const qs = (format?: string) => {
    const p = new URLSearchParams();
    if (f.from) p.set('from', f.from);
    if (f.to) p.set('to', f.to);
    if (f.vendorId && cur.k !== 'pembayaran') p.set('vendorId', f.vendorId);
    if (f.branchId) p.set('branchId', f.branchId);
    if (f.status !== 'ALL' && cur.k !== 'cashback') p.set('status', f.status);
    if (f.metode && cur.k === 'pembayaran') p.set('metode', f.metode);
    if (format) p.set('format', format);
    return p.toString();
  };

  useEffect(() => {
    setData(null);
    setError('');
    api<Report<Row>>(`${cur.ep}?${qs()}`).then(setData).catch((e) => setError(errorText(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cur.k, f]);

  const exportFile = async (format: 'csv' | 'xlsx') => {
    setBusy(format);
    try { await download(`${cur.ep}?${qs(format)}`, `laporan.${format}`); } catch (e) { setError(errorText(e)); } finally { setBusy(''); }
  };
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  const statusOpts = cur.k === 'po'
    ? Object.entries(PO_STATUS).map(([k, v]) => [k, v.label])
    : [['SUCCESS', 'Lunas'], ['PENDING', 'Menunggu Konfirmasi'], ['FAILED', 'Gagal']];
  const filterText = [
    `Periode ${f.from ? tanggal(f.from) : 'awal'} s/d ${f.to ? tanggal(f.to) : 'sekarang'}`,
    f.vendorId && cur.k !== 'pembayaran' ? `Vendor: ${vendors.find((v) => String(v.id) === f.vendorId)?.nama}` : '',
    f.branchId ? `Cabang: ${branches.find((b) => String(b.id) === f.branchId)?.nama}` : user?.branch ? `Cabang: ${user.branch.namaCabang}` : 'Semua cabang',
    f.status !== 'ALL' && cur.k !== 'cashback' ? `Status: ${statusOpts.find((s) => s[0] === f.status)?.[1]}` : '',
  ].filter(Boolean).join(' · ');

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <h1 className="text-xl font-bold text-slate-800">Laporan Manajemen</h1>
        <div className="flex gap-2">
          <button className="btn-secondary" disabled={!!busy} onClick={() => exportFile('csv')}><FileDown size={16} />{busy === 'csv' ? 'Mengunduh…' : 'CSV'}</button>
          <button className="btn-secondary" disabled={!!busy} onClick={() => exportFile('xlsx')}><FileSpreadsheet size={16} />{busy === 'xlsx' ? 'Mengunduh…' : 'Excel'}</button>
          <button className="btn-primary" onClick={() => window.print()}><Printer size={16} />Cetak / PDF</button>
        </div>
      </div>

      <div className="flex flex-wrap gap-1 border-b border-slate-200 print:hidden">
        {TABS.map((t) => (
          <button key={t.k} onClick={() => { nav(`/laporan/${t.k}`); setF({ ...f, status: 'ALL' }); }}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${t.k === cur.k ? 'border-blue-700 text-blue-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>{t.l}</button>
        ))}
      </div>

      <div className="card grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-5 print:hidden">
        <div><label className="label" htmlFor="r-from">Dari tanggal</label><input id="r-from" type="date" className="input" value={f.from} onChange={set('from')} /></div>
        <div><label className="label" htmlFor="r-to">Sampai tanggal</label><input id="r-to" type="date" className="input" value={f.to} onChange={set('to')} /></div>
        {cur.k !== 'pembayaran' && (
          <div><label className="label" htmlFor="r-vendor">Vendor</label>
            <select id="r-vendor" className="input" value={f.vendorId} onChange={set('vendorId')}>
              <option value="">Semua vendor</option>{vendors.map((v) => <option key={v.id} value={v.id}>{v.nama}</option>)}
            </select></div>
        )}
        {isSA && (
          <div><label className="label" htmlFor="r-branch">Cabang</label>
            <select id="r-branch" className="input" value={f.branchId} onChange={set('branchId')}>
              <option value="">Semua cabang</option>{branches.map((b) => <option key={b.id} value={b.id}>{b.nama}</option>)}
            </select></div>
        )}
        {cur.k !== 'cashback' && (
          <div><label className="label" htmlFor="r-status">Status</label>
            <select id="r-status" className="input" value={f.status} onChange={set('status')}>
              <option value="ALL">Semua status</option>{statusOpts.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select></div>
        )}
        {cur.k === 'pembayaran' && (
          <div><label className="label" htmlFor="r-metode">Metode</label>
            <select id="r-metode" className="input" value={f.metode} onChange={set('metode')}>
              <option value="">Semua metode</option>{Object.entries(METODE).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select></div>
        )}
      </div>

      <div className="hidden print:block">
        <h1 className="text-lg font-bold">{cur.l}</h1>
        <p className="text-xs">{filterText}</p>
        <p className="text-xs">Dicetak {new Date().toLocaleString('id-ID')} oleh {user?.nama}</p>
      </div>

      {error && <div className="rounded bg-red-50 p-3 text-sm text-red-700 print:hidden">{error}</div>}
      {!data ? !error && <div className="card p-8 text-center text-sm text-slate-400">Memuat…</div> : (
        <>
          <Totals tab={cur.k} t={data.totals} />
          <div className="card overflow-x-auto print:border-0 print:shadow-none">
            {cur.k === 'po' && <POTable rows={data.items} totals={data.totals} />}
            {cur.k === 'cashback' && <CashbackTable rows={data.items} totals={data.totals} />}
            {cur.k === 'pembayaran' && <PaymentTable rows={data.items} />}
          </div>
          <p className="text-xs text-slate-400 print:hidden">{filterText}</p>
        </>
      )}
    </div>
  );
}

function Totals({ tab, t }: { tab: Tab; t: Report<Row>['totals'] }) {
  const items: [string, string][] =
    tab === 'po' ? [['Jumlah PO', angka(t.jumlahPo)], ['Total Dus', angka(t.totalDus)], ['Total Pcs', angka(t.totalPcs)], ['Nilai PO (tanpa Cancel)', rupiah(t.nilai)]]
    : tab === 'cashback' ? [['Total Cashback', rupiah(t.totalCashback)], ['Hak Kepala Bengkel', rupiah(t.hakKabeng)], ['Sudah Dibayar', rupiah(t.dibayar)], ['Outstanding', rupiah(t.outstanding)]]
    : [['Jumlah Transaksi', angka(t.jumlah)], ['Lunas', rupiah(t.lunas)], ['Menunggu Konfirmasi', rupiah(t.pending)], ['Gagal', rupiah(t.gagal)]];
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {items.map(([l, v]) => (
        <div key={l} className="card p-3 print:shadow-none">
          <div className="text-xs text-slate-500">{l}</div>
          <div className="text-lg font-bold text-slate-800">{v}</div>
        </div>
      ))}
    </div>
  );
}

const TH = 'px-3 py-2';
const TD = 'px-3 py-1.5';
const Empty = ({ cols }: { cols: number }) => <tr><td colSpan={cols} className="px-3 py-8 text-center text-slate-400">Tidak ada data untuk filter ini</td></tr>;

function POTable({ rows, totals }: { rows: Row[]; totals: Row }) {
  return (
    <table className="w-full text-sm print:text-[11px]">
      <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
        <tr><th className={TH}>No</th><th className={TH}>No PO</th><th className={TH}>Tanggal</th><th className={TH}>Vendor</th><th className={TH}>Cabang</th><th className={TH}>Status</th><th className={`${TH} text-right`}>Dus</th><th className={`${TH} text-right`}>Pcs</th><th className={`${TH} text-right`}>Nilai PO</th></tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={r.id} className={`border-t border-slate-100 ${r.status === 'CANCEL' ? 'text-slate-400 line-through' : ''}`}>
            <td className={TD}>{i + 1}</td>
            <td className={TD}><Link to={`/po/${r.id}`} className="text-blue-700 hover:underline print:text-black">{r.poNumber}</Link></td>
            <td className={TD}>{tanggal(String(r.tanggalPo))}</td>
            <td className={TD}>{r.vendor}</td>
            <td className={TD}>{r.cabang}</td>
            <td className={TD}><POStatusBadge status={r.status as POStatus} /></td>
            <td className={`${TD} text-right`}>{angka(r.totalDus)}</td>
            <td className={`${TD} text-right`}>{angka(r.totalPcs)}</td>
            <td className={`${TD} text-right`}>{rupiah(r.nilai)}</td>
          </tr>
        ))}
        {!rows.length && <Empty cols={9} />}
      </tbody>
      {rows.length > 0 && (
        <tfoot className="border-t-2 border-slate-300 font-semibold">
          <tr><td className={TD} colSpan={6}>Total (tanpa Cancel)</td><td className={`${TD} text-right`}>{angka(totals.totalDus)}</td><td className={`${TD} text-right`}>{angka(totals.totalPcs)}</td><td className={`${TD} text-right`}>{rupiah(totals.nilai)}</td></tr>
        </tfoot>
      )}
    </table>
  );
}

function CashbackTable({ rows, totals }: { rows: Row[]; totals: Row }) {
  const money = ['totalCashback', 'hakKabeng', 'hakPerusahaan', 'dibayar', 'outstanding'];
  return (
    <table className="w-full text-sm print:text-[11px]">
      <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
        <tr><th className={TH}>No Klaim</th><th className={TH}>Tanggal</th><th className={TH}>Periode</th><th className={TH}>Vendor</th><th className={`${TH} text-right`}>PO</th><th className={`${TH} text-right`}>Total Cashback</th><th className={`${TH} text-right`}>Hak KB</th><th className={`${TH} text-right`}>Hak Perusahaan</th><th className={`${TH} text-right`}>Dibayar</th><th className={`${TH} text-right`}>Outstanding</th></tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id} className="border-t border-slate-100">
            <td className={TD}><Link to={`/cashback/${r.id}`} className="text-blue-700 hover:underline print:text-black">{r.receiptNo}</Link></td>
            <td className={TD}>{tanggal(String(r.tanggal))}</td>
            <td className={TD}>{r.periode}</td>
            <td className={TD}>{r.vendor}</td>
            <td className={`${TD} text-right`}>{r.jumlahPo}</td>
            {money.map((k) => <td key={k} className={`${TD} text-right`}>{rupiah(r[k])}</td>)}
          </tr>
        ))}
        {!rows.length && <Empty cols={10} />}
      </tbody>
      {rows.length > 0 && (
        <tfoot className="border-t-2 border-slate-300 font-semibold">
          <tr><td className={TD} colSpan={5}>Total</td>{money.map((k) => <td key={k} className={`${TD} text-right`}>{rupiah(totals[k])}</td>)}</tr>
        </tfoot>
      )}
    </table>
  );
}

function PaymentTable({ rows }: { rows: Row[] }) {
  return (
    <table className="w-full text-sm print:text-[11px]">
      <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
        <tr><th className={TH}>No Pembayaran</th><th className={TH}>Tanggal</th><th className={TH}>Periode</th><th className={TH}>Cabang</th><th className={TH}>Penerima</th><th className={TH}>Rekening</th><th className={TH}>Metode</th><th className={TH}>Referensi</th><th className={TH}>Status</th><th className={`${TH} text-right`}>Nominal</th></tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id} className="border-t border-slate-100">
            <td className={TD}>{r.paymentNo}</td>
            <td className={TD}>{tanggal(String(r.tanggalBayar))}</td>
            <td className={TD}>{r.periode}</td>
            <td className={TD}>{r.cabang}</td>
            <td className={TD}>{r.penerima}</td>
            <td className={`${TD} text-xs`}>{r.rekening}</td>
            <td className={TD}>{METODE[String(r.metode)]}</td>
            <td className={`${TD} text-xs`}>{r.referensi || '-'}</td>
            <td className={TD}><PayBadge s={String(r.status)} /></td>
            <td className={`${TD} text-right`}>{rupiah(r.nominal)}</td>
          </tr>
        ))}
        {!rows.length && <Empty cols={10} />}
      </tbody>
    </table>
  );
}
