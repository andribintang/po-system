import { useCallback, useEffect, useState } from 'react';
import { NavLink, useNavigate, useParams } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, Search, Wallet, XCircle } from 'lucide-react';
import { api, errorText, rupiah, tanggal, angka } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import type { Row } from '../../components/CrudPage';
import { Modal } from '../../components/Modal';
import { Stat } from '../cashback/CashbackList';

export const PAY_STATUS: Record<string, { label: string; cls: string }> = {
  PENDING: { label: 'Menunggu Konfirmasi', cls: 'bg-amber-100 text-amber-800' },
  SUCCESS: { label: 'Lunas', cls: 'bg-emerald-100 text-emerald-800' },
  FAILED: { label: 'Gagal', cls: 'bg-red-100 text-red-700' },
};
export const PayBadge = ({ s }: { s: string }) => (
  <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ${PAY_STATUS[s]?.cls}`}>{PAY_STATUS[s]?.label ?? s}</span>
);
export const METODE: Record<string, string> = { TRANSFER_MANUAL: 'Transfer Bank', CASH: 'Tunai / Cash' };

const TABS = [
  ['antrean', 'Antrean Outstanding'],
  ['riwayat', 'Riwayat Pembayaran'],
  ['cek-po', 'Cek Kelayakan PO'],
];

export function PaymentPage() {
  const { tab } = useParams();
  const active = TABS.some(([k]) => k === tab) ? tab! : 'antrean';
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-slate-800">Pembayaran Cashback Kepala Bengkel</h1>
      <div className="flex flex-wrap gap-2">
        {TABS.map(([k, l]) => (
          <NavLink key={k} to={`/pembayaran/tab/${k}`} className={`rounded-md px-3 py-1.5 text-sm ${active === k ? 'bg-blue-700 text-white' : 'bg-white text-slate-700'}`}>{l}</NavLink>
        ))}
      </div>
      {active === 'antrean' && <Outstanding />}
      {active === 'riwayat' && <History />}
      {active === 'cek-po' && <Eligibility />}
    </div>
  );
}

// ───────────── Antrean ─────────────

interface Group {
  periode: string;
  branch: Row;
  recipients: Row[];
  warning: string | null;
  total: string;
  reservedTotal: string;
  poNumbers: string[];
  items: Row[];
}

function Outstanding() {
  const { user } = useAuth();
  const isSA = user?.role === 'SUPER_ADMIN';
  const [periode, setPeriode] = useState('');
  const [groups, setGroups] = useState<Group[]>([]);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [sel, setSel] = useState<Set<number>>(new Set());
  const [error, setError] = useState('');
  const [payFor, setPayFor] = useState<{ ids: number[] } | null>(null);

  const load = useCallback(() => {
    api<{ groups: Group[] }>(`/payments/outstanding${periode ? `?periode=${periode}` : ''}`)
      .then((r) => { setGroups(r.groups); setSel(new Set()); })
      .catch((e) => setError(errorText(e)));
  }, [periode]);
  useEffect(load, [load]);

  const key = (g: Group) => `${g.periode}|${g.branch.id}`;
  const free = (g: Group) => g.items.filter((i) => !i.pendingPayment);
  const total = groups.reduce((a, g) => a + Number(g.total), 0);
  const reserved = groups.reduce((a, g) => a + Number(g.reservedTotal), 0);
  const toggleGroup = (g: Group) => {
    const ids = free(g).map((i) => i.id);
    const all = ids.every((id) => sel.has(id));
    const s = new Set(sel);
    ids.forEach((id) => (all ? s.delete(id) : s.add(id)));
    setSel(s);
  };
  const toggle = (id: number) => {
    const s = new Set(sel);
    if (s.has(id)) s.delete(id);
    else s.add(id);
    setSel(s);
  };

  return (
    <>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat label="Outstanding siap dibayar" value={rupiah(total)} tone="amber" />
        <Stat label="Sedang diproses (menunggu konfirmasi)" value={rupiah(reserved)} tone="blue" />
        <div className="card flex items-center gap-2 p-4">
          <label className="text-sm text-slate-600">Periode</label>
          <input type="month" className="input" value={periode} onChange={(e) => setPeriode(e.target.value)} />
        </div>
      </div>
      {error && <div className="rounded bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      {isSA && sel.size > 0 && (
        <div className="card flex flex-wrap items-center gap-3 border-blue-300 bg-blue-50 p-3 text-sm">
          <b>{sel.size} item dipilih</b>
          <span>{rupiah(groups.flatMap((g) => g.items).filter((i) => sel.has(i.id)).reduce((a, i) => a + Number(i.totalFeeKabeng), 0))}</span>
          <button className="btn-primary ml-auto" onClick={() => setPayFor({ ids: [...sel] })}><Wallet size={15} /> Proses Pembayaran</button>
        </div>
      )}

      <div className="space-y-3">
        {groups.map((g) => {
          const k = key(g);
          const isOpen = open.has(k);
          const ids = free(g).map((i) => i.id);
          const rec = g.recipients[0];
          return (
            <div key={k} className="card">
              <div className="flex flex-wrap items-center gap-3 p-4">
                {isSA && (
                  <input type="checkbox" disabled={!ids.length} checked={ids.length > 0 && ids.every((id) => sel.has(id))} onChange={() => toggleGroup(g)} />
                )}
                <button className="text-slate-500" onClick={() => {
                  const s = new Set(open);
                  if (s.has(k)) s.delete(k);
                  else s.add(k);
                  setOpen(s);
                }}>
                  {isOpen ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                </button>
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-slate-800">{g.branch.namaCabang} <span className="text-xs font-normal text-slate-500">· periode {g.periode}</span></div>
                  <div className="text-xs text-slate-600">
                    {rec ? <>{rec.nama}{rec.nomorRekening ? ` · ${rec.bank ?? ''} ${rec.nomorRekening} a.n. ${rec.namaRekening ?? '-'}` : ''}</> : '—'}
                  </div>
                  <div className="truncate text-xs text-slate-400">{g.poNumbers.join(', ')}</div>
                  {g.warning && <div className="mt-1 flex items-center gap-1 text-xs text-amber-700"><AlertTriangle size={13} /> {g.warning}</div>}
                </div>
                <div className="text-right">
                  <div className="text-lg font-bold text-slate-800">{rupiah(g.total)}</div>
                  {Number(g.reservedTotal) > 0 && <div className="text-xs text-blue-700">+ {rupiah(g.reservedTotal)} diproses</div>}
                </div>
                {isSA && (
                  <button className="btn-primary" disabled={!ids.length || !g.recipients.length} onClick={() => setPayFor({ ids })}>Bayar Manual</button>
                )}
              </div>
              {isOpen && (
                <div className="overflow-x-auto border-t border-slate-200">
                  <table className="w-full min-w-[640px] text-sm">
                    <tbody>
                      {g.items.map((i) => (
                        <tr key={i.id} className="border-t border-slate-100 first:border-0">
                          {isSA && <td className="w-8 px-4 py-2"><input type="checkbox" disabled={!!i.pendingPayment} checked={sel.has(i.id)} onChange={() => toggle(i.id)} /></td>}
                          <td className="px-3 py-2 text-xs">{i.po?.poNumber ?? <i className="text-slate-400">manual</i>}<div className="text-slate-400">{i.receipt.receiptNo}</div></td>
                          <td className="px-3 py-2"><b>{i.product.kodeProduk}</b> {i.product.namaProduk}</td>
                          <td className="px-3 py-2 text-right">{angka(i.qtyPcs)} pcs × {rupiah(i.feeKabengPerPcs)}</td>
                          <td className="px-3 py-2 text-right font-medium whitespace-nowrap">{rupiah(i.totalFeeKabeng)}</td>
                          <td className="px-3 py-2 text-xs">{i.pendingPayment && <span className="text-blue-700">diproses {i.pendingPayment.paymentNo}</span>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })}
        {!groups.length && <div className="card p-8 text-center text-slate-400">Tidak ada cashback yang belum dibayar</div>}
      </div>

      {payFor && <PayModal ids={payFor.ids} groups={groups} onClose={() => setPayFor(null)} onDone={load} />}
    </>
  );
}

function PayModal({ ids, groups, onClose, onDone }: { ids: number[]; groups: Group[]; onClose: () => void; onDone: () => void }) {
  const nav = useNavigate();
  const idSet = new Set(ids);
  const involved = groups.filter((g) => g.items.some((i) => idSet.has(i.id)));
  const periods = [...new Set(involved.map((g) => g.periode))];
  const total = involved.flatMap((g) => g.items).filter((i) => idSet.has(i.id)).reduce((a, i) => a + Number(i.totalFeeKabeng), 0);
  const [f, setF] = useState({ tanggalBayar: new Date().toISOString().slice(0, 10), metode: 'TRANSFER_MANUAL', status: 'SUCCESS', referensi: '', catatan: '' });
  const [recipients, setRecipients] = useState<Record<string, string>>({});
  const [bukti, setBukti] = useState<{ id: number; name: string } | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const upload = async (file?: File) => {
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

  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      const p = await api<Row>('/payments', {
        method: 'POST',
        body: { ...f, periode: periods[0], distributionIds: ids, buktiFileId: bukti?.id ?? null, recipients },
      });
      onDone();
      nav(`/pembayaran/${p.id}`);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Proses Pembayaran Manual" onClose={onClose}>
      {periods.length > 1 ? (
        <div className="rounded bg-amber-50 p-3 text-sm text-amber-800">
          Item terpilih berasal dari {periods.length} periode ({periods.join(', ')}). Satu pembayaran hanya untuk satu periode; pilih ulang per periode.
        </div>
      ) : (
        <div className="space-y-4 text-sm">
          <div className="rounded bg-slate-50 p-3">
            <div className="flex justify-between"><span>Periode</span><b>{periods[0]}</b></div>
            {involved.map((g) => (
              <div key={g.branch.id} className="flex justify-between text-slate-600">
                <span>{g.branch.namaCabang}</span>
                <span>{rupiah(g.items.filter((i) => idSet.has(i.id)).reduce((a, i) => a + Number(i.totalFeeKabeng), 0))}</span>
              </div>
            ))}
            <div className="mt-1 flex justify-between border-t border-slate-200 pt-1 text-base"><span>Total</span><b>{rupiah(total)}</b></div>
          </div>
          {involved.filter((g) => g.recipients.length > 1).map((g) => (
            <div key={g.branch.id}>
              <label className="label">Penerima untuk {g.branch.namaCabang} *</label>
              <select className="input" value={recipients[g.branch.id] ?? ''} onChange={(e) => setRecipients({ ...recipients, [g.branch.id]: e.target.value })}>
                <option value="">— Pilih Kepala Bengkel —</option>
                {g.recipients.map((r) => <option key={r.id} value={r.id}>{r.nama} {r.nomorRekening ? `(${r.bank} ${r.nomorRekening})` : '(tanpa rekening)'}</option>)}
              </select>
            </div>
          ))}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Tanggal Bayar *</label>
              <input type="date" className="input" value={f.tanggalBayar} onChange={(e) => setF({ ...f, tanggalBayar: e.target.value })} />
            </div>
            <div>
              <label className="label">Metode *</label>
              <select className="input" value={f.metode} onChange={(e) => setF({ ...f, metode: e.target.value })}>
                <option value="TRANSFER_MANUAL">Transfer Bank</option>
                <option value="CASH">Tunai / Cash</option>
              </select>
            </div>
          </div>
          <div>
            <label className="label">Status Pencatatan *</label>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {[['SUCCESS', 'Sudah Dibayar / Lunas', 'Item langsung ditandai lunas'], ['PENDING', 'Menunggu Konfirmasi', 'Item dikunci sampai dikonfirmasi lunas / gagal']].map(([v, l, d]) => (
                <button key={v} type="button" onClick={() => setF({ ...f, status: v })}
                  className={`rounded-md border p-2 text-left ${f.status === v ? 'border-blue-700 bg-blue-50' : 'border-slate-300'}`}>
                  <div className="font-semibold">{l}</div>
                  <div className="text-xs text-slate-500">{d}</div>
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="label">No. Referensi Transfer</label>
            <input className="input" value={f.referensi} onChange={(e) => setF({ ...f, referensi: e.target.value })} />
          </div>
          <div>
            <label className="label">Bukti Transfer / Kwitansi (gambar/PDF, maks 2 MB)</label>
            {bukti ? (
              <div className="flex items-center gap-2"><span className="truncate">{bukti.name}</span><button className="text-xs text-red-600" onClick={() => setBukti(null)}>hapus</button></div>
            ) : (
              <input type="file" accept="image/png,image/jpeg,image/webp,application/pdf" onChange={(e) => upload(e.target.files?.[0])} />
            )}
          </div>
          <div>
            <label className="label">Catatan</label>
            <input className="input" value={f.catatan} onChange={(e) => setF({ ...f, catatan: e.target.value })} />
          </div>
          {error && <div className="rounded bg-red-50 p-3 text-red-700">{error}</div>}
          <div className="flex justify-end gap-2">
            <button className="btn-secondary" onClick={onClose}>Batal</button>
            <button className="btn-primary" disabled={busy} onClick={submit}>{busy ? 'Menyimpan...' : 'Simpan Pembayaran'}</button>
          </div>
        </div>
      )}
    </Modal>
  );
}

// ───────────── Riwayat ─────────────

function History() {
  const nav = useNavigate();
  const [f, setF] = useState({ periode: '', status: '' });
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ items: Row[]; total: number; pageSize: number } | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    const p = new URLSearchParams({ page: String(page) });
    Object.entries(f).forEach(([k, v]) => v && p.set(k, v));
    api<NonNullable<typeof data>>(`/payments?${p}`).then(setData).catch((e) => setError(errorText(e)));
  }, [f, page]);
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <>
      <div className="card grid grid-cols-1 gap-3 p-4 sm:grid-cols-2">
        <input type="month" className="input" value={f.periode} onChange={(e) => { setPage(1); setF({ ...f, periode: e.target.value }); }} />
        <select className="input" value={f.status} onChange={(e) => { setPage(1); setF({ ...f, status: e.target.value }); }}>
          <option value="">Semua status</option>
          {Object.entries(PAY_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
      </div>
      {error && <div className="rounded bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr><th className="px-3 py-2">No. Pembayaran</th><th className="px-3 py-2">Tanggal</th><th className="px-3 py-2">Periode</th><th className="px-3 py-2">Penerima</th><th className="px-3 py-2">Metode</th><th className="px-3 py-2 text-right">Nominal</th><th className="px-3 py-2">Status</th></tr>
          </thead>
          <tbody>
            {data?.items.map((p) => (
              <tr key={p.id} className="cursor-pointer border-t border-slate-100 hover:bg-slate-50" onClick={() => nav(`/pembayaran/${p.id}`)}>
                <td className="px-3 py-2 font-semibold text-blue-800">{p.paymentNo}</td>
                <td className="px-3 py-2 whitespace-nowrap">{tanggal(p.tanggalBayar)}</td>
                <td className="px-3 py-2">{p.periode}</td>
                <td className="px-3 py-2 text-xs">{p.details.map((d: Row) => `${d.employee.nama} (${d.branch.namaCabang})`).join(', ')}</td>
                <td className="px-3 py-2">{METODE[p.metode]}</td>
                <td className="px-3 py-2 text-right whitespace-nowrap">{rupiah(p.details.reduce((a: number, d: Row) => a + Number(d.nominal), 0))}</td>
                <td className="px-3 py-2"><PayBadge s={p.status} /></td>
              </tr>
            ))}
            {data && !data.items.length && <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-400">Belum ada pembayaran</td></tr>}
          </tbody>
        </table>
        <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-4 py-2 text-xs text-slate-500">
          <button className="btn-secondary px-2 py-1" disabled={page <= 1} onClick={() => setPage(page - 1)}>‹</button>
          <span>{page} / {pages}</span>
          <button className="btn-secondary px-2 py-1" disabled={page >= pages} onClick={() => setPage(page + 1)}>›</button>
        </div>
      </div>
    </>
  );
}

// ───────────── Cek kelayakan PO ─────────────

function Eligibility() {
  const [no, setNo] = useState('');
  const [r, setR] = useState<Row | null>(null);
  const [error, setError] = useState('');
  const check = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setR(null);
    try {
      setR(await api<Row>(`/payments/eligibility?poNumber=${encodeURIComponent(no.trim())}`));
    } catch (err) {
      setError(errorText(err));
    }
  };
  return (
    <div className="space-y-4">
      <form onSubmit={check} className="card flex flex-wrap items-center gap-2 p-4">
        <div className="relative flex-1">
          <Search size={15} className="absolute left-2.5 top-2.5 text-slate-400" />
          <input className="input pl-8" placeholder="Nomor PO, contoh PO/CBG-JKT/202611/0001" value={no} onChange={(e) => setNo(e.target.value)} />
        </div>
        <button className="btn-primary" disabled={no.trim().length < 3}>Cek</button>
      </form>
      {error && <div className="rounded bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      {r && (
        <div className="card p-4">
          <div className="mb-3 font-semibold">{r.po.poNumber} <span className="text-sm font-normal text-slate-500">· status {r.po.statusLabel}</span></div>
          <div className="space-y-2">
            {r.branches.map((b: Row) => (
              <div key={b.branch.id} className={`rounded-md border p-3 ${b.ok ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`}>
                <div className="flex items-center gap-2 font-medium">
                  {b.ok ? <CheckCircle2 size={16} className="text-emerald-600" /> : <XCircle size={16} className="text-amber-600" />}
                  {b.branch.namaCabang}
                  {Number(b.unpaidKabeng) > 0 && <span className="ml-auto text-sm">{rupiah(b.unpaidKabeng)} belum dibayar</span>}
                </div>
                <ul className="ml-6 mt-1 list-disc text-sm text-slate-700">
                  {b.reasons.map((x: string, i: number) => <li key={i}>{x}</li>)}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
