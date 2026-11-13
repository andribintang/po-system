import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Plus, Trash2 } from 'lucide-react';
import { api, errorText, rupiah, angka, type Paged } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useOptions, type Row } from '../../components/CrudPage';

interface Item { productId: string; branchId: string; qtyDus: string; harga: string }
const emptyItem = (branchId = ''): Item => ({ productId: '', branchId, qtyDus: '1', harga: '' });
const today = () => new Date().toISOString().slice(0, 10);

export function POFormPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const nav = useNavigate();
  const isSA = user?.role === 'SUPER_ADMIN';
  const vendors = useOptions('/vendors', (v) => `${v.kodeVendor} - ${v.namaVendor}`);
  const branches = useOptions('/branches', (b) => `${b.kodeCabang} - ${b.namaCabang}`);

  const [isMulti, setIsMulti] = useState(false);
  const [vendorId, setVendorId] = useState('');
  const [branchId, setBranchId] = useState(user?.role === 'ADMIN' ? String(user.branchId) : '');
  const [tanggalPo, setTanggalPo] = useState(today());
  const [catatan, setCatatan] = useState('');
  const [items, setItems] = useState<Item[]>([emptyItem()]);
  const [products, setProducts] = useState<Row[]>([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [poNumber, setPoNumber] = useState('');

  // Mode edit: muat PO yang ada.
  useEffect(() => {
    if (!id) return;
    api<Row>(`/po/${id}`)
      .then((po) => {
        if (!po.canEdit) {
          setError('PO ini tidak bisa diedit (hanya PO Draft milik cabang Anda).');
          return;
        }
        setPoNumber(po.poNumber);
        setIsMulti(po.isMulti);
        setVendorId(String(po.vendorId));
        setBranchId(po.branchId ? String(po.branchId) : '');
        setTanggalPo(po.tanggalPo.slice(0, 10));
        setCatatan(po.catatan ?? '');
        setItems(
          po.details.map((d: Row) => ({
            productId: String(d.productId),
            branchId: String(d.branchId),
            qtyDus: String(d.qtyDus),
            harga: String(Number(d.harga)),
          })),
        );
      })
      .catch((e) => setError(errorText(e)));
  }, [id]);

  // Produk aktif dari vendor terpilih.
  useEffect(() => {
    if (!vendorId) return setProducts([]);
    api<Paged<Row>>(`/products?vendorId=${vendorId}&status=ACTIVE&pageSize=500`)
      .then((r) => setProducts(r.items))
      .catch(() => setProducts([]));
  }, [vendorId]);

  const pmap = useMemo(() => new Map(products.map((p) => [String(p.id), p])), [products]);

  // Pratinjau total. Nilai final tetap dihitung ulang oleh server.
  const lines = items.map((it) => {
    const p = pmap.get(it.productId);
    const pcs = p ? Number(it.qtyDus || 0) * p.isiPerDus : 0;
    const harga = it.harga !== '' ? Number(it.harga) : p ? Number(p.hargaBeli) : 0;
    return { p, pcs, harga, subtotal: pcs * harga };
  });
  const totals = lines.reduce((a, l, i) => ({ dus: a.dus + Number(items[i].qtyDus || 0), pcs: a.pcs + l.pcs, total: a.total + l.subtotal }), { dus: 0, pcs: 0, total: 0 });

  const update = (i: number, patch: Partial<Item>) => setItems(items.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  const save = async (submit: boolean) => {
    setSaving(true);
    setError('');
    try {
      const body = {
        tanggalPo,
        vendorId: Number(vendorId),
        isMulti,
        branchId: isMulti ? null : Number(branchId),
        catatan,
        submit,
        items: items.map((it) => ({
          productId: Number(it.productId),
          qtyDus: Number(it.qtyDus),
          branchId: isMulti ? Number(it.branchId) : null,
          harga: it.harga === '' ? null : it.harga,
        })),
      };
      const po = await api<Row>(id ? `/po/${id}` : '/po', { method: id ? 'PUT' : 'POST', body });
      nav(`/po/${po.id}`);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        save(false);
      }}
    >
      <div className="flex items-center gap-3">
        <Link to={id ? `/po/${id}` : '/po'} className="btn-secondary"><ArrowLeft size={16} /></Link>
        <h1 className="text-xl font-bold text-slate-800">{id ? `Edit ${poNumber}` : 'Buat Purchase Order'}</h1>
      </div>

      <div className="card grid grid-cols-1 gap-4 p-5 md:grid-cols-2 lg:grid-cols-4">
        <div>
          <label className="label">Tipe PO</label>
          <div className="flex gap-2">
            {[false, true].map((m) => (
              <button
                key={String(m)}
                type="button"
                disabled={!!id || (m && !isSA)}
                title={m && !isSA ? 'PO multi cabang hanya untuk Super Admin' : undefined}
                onClick={() => {
                  setIsMulti(m);
                  setItems([emptyItem()]);
                }}
                className={`flex-1 rounded-md border px-3 py-2 text-sm disabled:opacity-50 ${isMulti === m ? 'border-blue-700 bg-blue-700 text-white' : 'border-slate-300 bg-white'}`}
              >
                {m ? 'Multi Cabang' : 'Single Cabang'}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="label">Tanggal PO *</label>
          <input type="date" className="input" required value={tanggalPo} onChange={(e) => setTanggalPo(e.target.value)} />
        </div>
        <div>
          <label className="label">Vendor *</label>
          <select
            className="input"
            required
            value={vendorId}
            onChange={(e) => {
              setVendorId(e.target.value);
              setItems(items.map((it) => ({ ...it, productId: '', harga: '' })));
            }}
          >
            <option value="">— Pilih vendor —</option>
            {vendors.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        {!isMulti && (
          <div>
            <label className="label">Cabang *</label>
            <select className="input" required value={branchId} disabled={!isSA || !!id} onChange={(e) => setBranchId(e.target.value)}>
              <option value="">— Pilih cabang —</option>
              {branches.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
        )}
        <div className="md:col-span-2 lg:col-span-4">
          <label className="label">Catatan</label>
          <textarea className="input" rows={2} value={catatan} onChange={(e) => setCatatan(e.target.value)} />
        </div>
      </div>

      <div className="card overflow-x-auto">
        <div className="flex items-center justify-between border-b border-slate-200 p-4">
          <h2 className="font-semibold text-slate-800">Item Produk</h2>
          <button type="button" className="btn-secondary" disabled={!vendorId} onClick={() => setItems([...items, emptyItem()])}>
            <Plus size={15} /> Tambah Baris
          </button>
        </div>
        <table className="w-full min-w-[820px] text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-3 py-2">Produk</th>
              {isMulti && <th className="px-3 py-2">Cabang</th>}
              <th className="w-24 px-3 py-2">Qty Dus</th>
              <th className="px-3 py-2 text-right">Isi/Dus</th>
              <th className="px-3 py-2 text-right">Total Pcs</th>
              <th className="w-36 px-3 py-2">Harga / pcs</th>
              <th className="px-3 py-2 text-right">Subtotal</th>
              <th className="w-10" />
            </tr>
          </thead>
          <tbody>
            {items.map((it, i) => (
              <tr key={i} className="border-t border-slate-100">
                <td className="px-3 py-2">
                  <select className="input" required value={it.productId} onChange={(e) => update(i, { productId: e.target.value, harga: '' })}>
                    <option value="">{vendorId ? '— Pilih produk —' : 'Pilih vendor dulu'}</option>
                    {products.map((p) => <option key={p.id} value={p.id}>{p.kodeProduk} - {p.namaProduk}</option>)}
                  </select>
                </td>
                {isMulti && (
                  <td className="px-3 py-2">
                    <select className="input" required value={it.branchId} onChange={(e) => update(i, { branchId: e.target.value })}>
                      <option value="">— Cabang —</option>
                      {branches.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </td>
                )}
                <td className="px-3 py-2">
                  <input className="input" type="number" min="1" step="1" required value={it.qtyDus} onChange={(e) => update(i, { qtyDus: e.target.value })} />
                </td>
                <td className="px-3 py-2 text-right">{lines[i].p?.isiPerDus ?? '-'}</td>
                <td className="px-3 py-2 text-right">{angka(lines[i].pcs)}</td>
                <td className="px-3 py-2">
                  <input
                    className="input"
                    type="number"
                    min="0"
                    step="any"
                    placeholder={lines[i].p ? String(Number(lines[i].p!.hargaBeli)) : ''}
                    value={it.harga}
                    onChange={(e) => update(i, { harga: e.target.value })}
                    title="Kosongkan untuk memakai harga beli master produk"
                  />
                </td>
                <td className="px-3 py-2 text-right whitespace-nowrap">{rupiah(lines[i].subtotal)}</td>
                <td className="px-2 py-2">
                  <button type="button" disabled={items.length === 1} className="rounded p-1.5 text-red-600 hover:bg-red-50 disabled:opacity-30" onClick={() => setItems(items.filter((_, j) => j !== i))}>
                    <Trash2 size={15} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-slate-50 font-semibold">
            <tr className="border-t border-slate-200">
              <td className="px-3 py-2" colSpan={isMulti ? 2 : 1}>Total</td>
              <td className="px-3 py-2">{angka(totals.dus)} dus</td>
              <td />
              <td className="px-3 py-2 text-right">{angka(totals.pcs)}</td>
              <td />
              <td className="px-3 py-2 text-right whitespace-nowrap">{rupiah(totals.total)}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>

      {error && <div className="rounded bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      <div className="flex flex-wrap justify-end gap-2">
        <button type="submit" className="btn-secondary" disabled={saving}>Simpan Draft</button>
        <button
          type="button"
          className="btn-primary"
          disabled={saving}
          onClick={(e) => {
            const form = (e.currentTarget as HTMLButtonElement).form!;
            if (form.reportValidity()) save(true);
          }}
        >
          Simpan & Ajukan Approval
        </button>
      </div>
    </form>
  );
}
