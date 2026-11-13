import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Building2, FileText, HandCoins, Hourglass, Package, Truck, Wallet } from 'lucide-react';
import { angka, api, errorText, rupiah, tanggal, type Paged } from '../lib/api';
import { useAuth } from '../lib/auth';
import { GroupedBars, Legend, RankBars, RatioBar, SERIES, periodeLabel } from '../components/Charts';
import { POStatusBadge, type POStatus } from '../components/POStatusBadge';

interface Dash {
  scope: { branchId: number } | null;
  kpi: { totalPo: number; nilaiPo: string; vendorAktif: number; totalCabang: number; totalProduk: number; cashbackDiterima: string; cashbackDibayar: string; outstanding: string };
  payRatio: { paid: { nominal: string; jumlah: number }; unpaid: { nominal: string; jumlah: number } };
  trend: { periode: string; diterima: string; dibayar: string }[];
  topProducts: { product: { kodeProduk: string; namaProduk: string }; totalPcs: number; nilai: string }[];
  topVendors: { vendor: { namaVendor: string }; nilai: string; jumlahPo: number }[];
  topBranches: { branch: { id: number; kodeCabang: string; namaCabang: string; area: string }; hakKabeng: string; hakPerusahaan: string | null; dibayar: string; outstanding: string }[];
  recentPOs: { id: number; poNumber: string; tanggalPo: string; status: POStatus; vendor: string; cabang: string; grandTotal: string }[];
}

export function DashboardPage() {
  const { user } = useAuth();
  const isSA = user?.role === 'SUPER_ADMIN';
  const isKb = user?.role === 'KEPALA_BENGKEL';
  const [branchId, setBranchId] = useState('');
  const [branches, setBranches] = useState<{ id: number; namaCabang: string }[]>([]);
  const [d, setD] = useState<Dash | null>(null);
  const [error, setError] = useState('');
  const [showTable, setShowTable] = useState(false);

  useEffect(() => {
    if (isSA) api<Paged<{ id: number; namaCabang: string }>>('/branches?status=ACTIVE&pageSize=200').then((r) => setBranches(r.items)).catch(() => undefined);
  }, [isSA]);
  useEffect(() => {
    api<Dash>(`/dashboard${branchId ? `?branchId=${branchId}` : ''}`).then(setD).catch((e) => setError(errorText(e)));
  }, [branchId]);

  const recvLabel = isKb ? 'Hak Cashback Saya' : 'Cashback Diterima';
  const cards = d && [
    { l: 'Total PO', v: angka(d.kpi.totalPo), sub: `Nilai ${rupiah(d.kpi.nilaiPo)}`, icon: FileText, hide: isKb },
    { l: 'Vendor Aktif', v: angka(d.kpi.vendorAktif), icon: Truck, hide: isKb },
    { l: 'Total Cabang', v: angka(d.kpi.totalCabang), icon: Building2 },
    { l: 'Master Produk', v: angka(d.kpi.totalProduk), icon: Package },
    { l: recvLabel, v: rupiah(d.kpi.cashbackDiterima), icon: HandCoins },
    { l: 'Cashback Dibayarkan', v: rupiah(d.kpi.cashbackDibayar), sub: 'ke Kepala Bengkel', icon: Wallet },
    { l: 'Outstanding Cashback', v: rupiah(d.kpi.outstanding), sub: 'belum dibayar', icon: Hourglass },
  ].filter((c) => !c.hide);

  const series = [
    { label: isKb ? 'Hak cashback' : 'Cashback diterima', color: SERIES[0] },
    { label: 'Dibayarkan ke KB', color: SERIES[1] },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Selamat datang, {user?.nama}</h1>
          <p className="text-xs text-slate-500">{d?.scope ? 'Ringkasan cabang' : 'Ringkasan nasional'}</p>
        </div>
        {isSA && (
          <select className="input w-56" value={branchId} onChange={(e) => setBranchId(e.target.value)} aria-label="Filter cabang">
            <option value="">Semua cabang (nasional)</option>
            {branches.map((b) => <option key={b.id} value={b.id}>{b.namaCabang}</option>)}
          </select>
        )}
      </div>
      {error && <div className="rounded bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      {!d ? <div className="card p-8 text-center text-sm text-slate-400">Memuat…</div> : (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {cards!.map((c) => (
              <div key={c.l} className="card flex items-center gap-3 p-4">
                <div className="rounded-lg bg-blue-50 p-2.5 text-blue-700"><c.icon size={20} /></div>
                <div className="min-w-0">
                  <div className="text-xs text-slate-500">{c.l}</div>
                  <div className="truncate text-lg font-bold text-slate-800">{c.v}</div>
                  {c.sub && <div className="truncate text-[11px] text-slate-400">{c.sub}</div>}
                </div>
              </div>
            ))}
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <div className="card p-4 lg:col-span-2">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-sm font-semibold text-slate-800">Tren cashback 12 bulan (per periode)</h2>
                <div className="flex items-center gap-3">
                  <Legend items={series} />
                  <button className="text-xs text-blue-700 hover:underline" onClick={() => setShowTable(!showTable)}>{showTable ? 'Grafik' : 'Tabel'}</button>
                </div>
              </div>
              {showTable ? (
                <table className="w-full text-xs">
                  <thead className="text-left text-slate-500"><tr><th className="py-1">Periode</th><th className="text-right">{series[0].label}</th><th className="text-right">{series[1].label}</th></tr></thead>
                  <tbody>{d.trend.map((t) => <tr key={t.periode} className="border-t border-slate-100"><td className="py-1">{t.periode}</td><td className="text-right">{rupiah(t.diterima)}</td><td className="text-right">{rupiah(t.dibayar)}</td></tr>)}</tbody>
                </table>
              ) : (
                <GroupedBars series={series} data={d.trend.map((t) => ({ label: periodeLabel(t.periode), values: [Number(t.diterima), Number(t.dibayar)] }))} />
              )}
            </div>
            <div className="card p-4">
              <h2 className="mb-3 text-sm font-semibold text-slate-800">Status pembayaran hak Kepala Bengkel</h2>
              <RatioBar parts={[
                { label: 'Sudah dibayar (PAID)', value: Number(d.payRatio.paid.nominal), count: d.payRatio.paid.jumlah, color: SERIES[0] },
                { label: 'Belum dibayar (UNPAID)', value: Number(d.payRatio.unpaid.nominal), count: d.payRatio.unpaid.jumlah, color: SERIES[1] },
              ]} />
              {user?.role !== 'ADMIN' && (
                <Link to="/pembayaran" className="mt-4 inline-block text-xs text-blue-700 hover:underline">Lihat antrean pembayaran →</Link>
              )}
            </div>
          </div>

          {!isKb && (
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="card p-4">
                <h2 className="mb-3 text-sm font-semibold text-slate-800">Top 5 produk (nilai PO)</h2>
                <RankBars items={d.topProducts.map((p) => ({ label: p.product.namaProduk, sub: `${angka(p.totalPcs)} pcs`, value: Number(p.nilai) }))} />
              </div>
              <div className="card p-4">
                <h2 className="mb-3 text-sm font-semibold text-slate-800">Top 5 vendor (nilai PO)</h2>
                <RankBars items={d.topVendors.map((v) => ({ label: v.vendor.namaVendor, sub: `${v.jumlahPo} PO`, value: Number(v.nilai) }))} />
              </div>
            </div>
          )}

          <BranchRanking rows={d.topBranches} showCompany={!isKb} />

          {!isKb && (
            <div className="card overflow-x-auto">
              <div className="flex items-center justify-between px-4 pt-4">
                <h2 className="text-sm font-semibold text-slate-800">Aktivitas PO terbaru</h2>
                <Link to="/po" className="text-xs text-blue-700 hover:underline">Semua PO →</Link>
              </div>
              <table className="mt-2 w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                  <tr><th className="px-4 py-2">No PO</th><th className="px-4 py-2">Tanggal</th><th className="px-4 py-2">Vendor</th><th className="px-4 py-2">Cabang</th><th className="px-4 py-2">Status</th><th className="px-4 py-2 text-right">Total</th></tr>
                </thead>
                <tbody>
                  {d.recentPOs.map((p) => (
                    <tr key={p.id} className="border-t border-slate-100">
                      <td className="px-4 py-2"><Link className="font-medium text-blue-700 hover:underline" to={`/po/${p.id}`}>{p.poNumber}</Link></td>
                      <td className="px-4 py-2">{tanggal(p.tanggalPo)}</td>
                      <td className="px-4 py-2">{p.vendor}</td>
                      <td className="px-4 py-2">{p.cabang}</td>
                      <td className="px-4 py-2"><POStatusBadge status={p.status} /></td>
                      <td className="px-4 py-2 text-right">{rupiah(p.grandTotal)}</td>
                    </tr>
                  ))}
                  {!d.recentPOs.length && <tr><td colSpan={6} className="px-4 py-6 text-center text-slate-400">Belum ada PO</td></tr>}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function BranchRanking({ rows, showCompany }: { rows: Dash['topBranches']; showCompany: boolean }) {
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const size = 10;
  const filtered = useMemo(() => rows.filter((r) => `${r.branch.kodeCabang} ${r.branch.namaCabang} ${r.branch.area}`.toLowerCase().includes(q.toLowerCase())), [rows, q]);
  const pages = Math.max(1, Math.ceil(filtered.length / size));
  const view = filtered.slice((page - 1) * size, page * size);
  return (
    <div className="card overflow-x-auto">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-4">
        <h2 className="text-sm font-semibold text-slate-800">Peringkat cabang berdasarkan cashback</h2>
        <input className="input w-56" placeholder="Cari cabang / area…" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
      </div>
      <table className="mt-2 w-full text-sm">
        <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
          <tr>
            <th className="px-4 py-2">#</th><th className="px-4 py-2">Cabang</th><th className="px-4 py-2">Area</th>
            <th className="px-4 py-2 text-right">Hak KB</th>{showCompany && <th className="px-4 py-2 text-right">Hak Perusahaan</th>}
            <th className="px-4 py-2 text-right">Dibayar</th><th className="px-4 py-2 text-right">Outstanding</th>
          </tr>
        </thead>
        <tbody>
          {view.map((r, i) => (
            <tr key={r.branch.id} className="border-t border-slate-100">
              <td className="px-4 py-2 text-slate-400">{(page - 1) * size + i + 1}</td>
              <td className="px-4 py-2 font-medium">{r.branch.namaCabang}<span className="ml-1 text-xs text-slate-400">{r.branch.kodeCabang}</span></td>
              <td className="px-4 py-2">{r.branch.area}</td>
              <td className="px-4 py-2 text-right">{rupiah(r.hakKabeng)}</td>
              {showCompany && <td className="px-4 py-2 text-right">{rupiah(r.hakPerusahaan)}</td>}
              <td className="px-4 py-2 text-right">{rupiah(r.dibayar)}</td>
              <td className={`px-4 py-2 text-right ${Number(r.outstanding) > 0 ? 'font-semibold text-slate-800' : 'text-slate-400'}`}>{rupiah(r.outstanding)}</td>
            </tr>
          ))}
          {!view.length && <tr><td colSpan={7} className="px-4 py-6 text-center text-slate-400">Belum ada distribusi cashback</td></tr>}
        </tbody>
      </table>
      {pages > 1 && (
        <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-4 py-2 text-xs text-slate-500">
          <button className="btn-secondary px-2 py-1" disabled={page <= 1} onClick={() => setPage(page - 1)}>‹</button>
          <span>{page} / {pages}</span>
          <button className="btn-secondary px-2 py-1" disabled={page >= pages} onClick={() => setPage(page + 1)}>›</button>
        </div>
      )}
    </div>
  );
}
