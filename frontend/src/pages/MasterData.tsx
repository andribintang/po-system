import { NavLink, Navigate, useParams } from 'react-router-dom';
import { Plus, Trash2 } from 'lucide-react';
import { CrudPage, StatusBadge, useOptions, type Field, type Row } from '../components/CrudPage';
import { rupiah } from '../lib/api';

const STATUS: Field = {
  name: 'status',
  label: 'Status',
  type: 'select',
  required: true,
  options: [
    { value: 'ACTIVE', label: 'Aktif' },
    { value: 'INACTIVE', label: 'Nonaktif' },
  ],
};

const TABS = [
  { key: 'cabang', label: 'Cabang' },
  { key: 'area', label: 'Area Tarif' },
  { key: 'vendor', label: 'Vendor' },
  { key: 'produk', label: 'Produk' },
  { key: 'karyawan', label: 'Karyawan' },
];

export function MasterDataPage() {
  const { tab } = useParams();
  if (!tab || !TABS.some((t) => t.key === tab)) return <Navigate to="/master/cabang" replace />;
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-slate-800">Master Data</h1>
      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <NavLink
            key={t.key}
            to={`/master/${t.key}`}
            className={({ isActive }) => `rounded-md px-3 py-1.5 text-sm ${isActive ? 'bg-blue-700 text-white' : 'bg-white text-slate-700 hover:bg-slate-50'}`}
          >
            {t.label}
          </NavLink>
        ))}
      </div>
      {tab === 'area' && <AreaTab />}
      {tab === 'cabang' && <BranchTab />}
      {tab === 'vendor' && <VendorTab />}
      {tab === 'produk' && <ProductTab />}
      {tab === 'karyawan' && <EmployeeTab />}
    </div>
  );
}

function AreaTab() {
  return (
    <CrudPage
      key="area"
      title="Area Tarif"
      endpoint="/areas"
      emptyForm={{ kodeArea: '', namaArea: '', status: 'ACTIVE' }}
      fields={[
        { name: 'kodeArea', label: 'Kode Area', required: true, placeholder: 'JAWA' },
        { name: 'namaArea', label: 'Nama Area', required: true },
        STATUS,
      ]}
      columns={[
        { label: 'Kode', render: (r) => <b>{r.kodeArea}</b> },
        { label: 'Nama Area', render: (r) => r.namaArea },
        { label: 'Status', render: (r) => <StatusBadge status={r.status} /> },
      ]}
    />
  );
}

function BranchTab() {
  const areas = useOptions('/areas', (a) => a.namaArea);
  return (
    <CrudPage
      key="branch"
      title="Cabang"
      endpoint="/branches"
      emptyForm={{ kodeCabang: '', namaCabang: '', areaId: '', kota: '', provinsi: '', npwp: '', alamat: '', status: 'ACTIVE' }}
      toForm={(r) => ({ ...r, area: undefined })}
      fields={[
        { name: 'kodeCabang', label: 'Kode Cabang', required: true },
        { name: 'namaCabang', label: 'Nama Cabang', required: true },
        { name: 'areaId', label: 'Area Tarif', type: 'select', required: true, options: areas },
        { name: 'npwp', label: 'NPWP' },
        { name: 'kota', label: 'Kota' },
        { name: 'provinsi', label: 'Provinsi' },
        { name: 'alamat', label: 'Alamat', type: 'textarea' },
        STATUS,
      ]}
      columns={[
        { label: 'Kode', render: (r) => <b>{r.kodeCabang}</b> },
        { label: 'Nama Cabang', render: (r) => r.namaCabang },
        { label: 'Area', render: (r) => r.area?.namaArea },
        { label: 'Kota', render: (r) => r.kota ?? '-' },
        { label: 'Status', render: (r) => <StatusBadge status={r.status} /> },
      ]}
    />
  );
}

function VendorTab() {
  return (
    <CrudPage
      key="vendor"
      title="Vendor"
      endpoint="/vendors"
      emptyForm={{ kodeVendor: '', namaVendor: '', pic: '', noHp: '', email: '', alamat: '', status: 'ACTIVE' }}
      fields={[
        { name: 'kodeVendor', label: 'Kode Vendor', required: true },
        { name: 'namaVendor', label: 'Nama Vendor', required: true },
        { name: 'pic', label: 'PIC' },
        { name: 'noHp', label: 'No. HP' },
        { name: 'email', label: 'Email', type: 'email' },
        STATUS,
        { name: 'alamat', label: 'Alamat', type: 'textarea' },
      ]}
      columns={[
        { label: 'Kode', render: (r) => <b>{r.kodeVendor}</b> },
        { label: 'Nama Vendor', render: (r) => r.namaVendor },
        { label: 'PIC', render: (r) => r.pic ?? '-' },
        { label: 'No. HP', render: (r) => r.noHp ?? '-' },
        { label: 'Status', render: (r) => <StatusBadge status={r.status} /> },
      ]}
    />
  );
}

const FEE_KEYS = [
  { k: 'feeVendorPerPcs', l: 'Fee Vendor / pcs' },
  { k: 'feeKabengPerPcs', l: 'Fee Kabeng / pcs' },
  { k: 'feePerusahaanPerPcs', l: 'Fee Perusahaan / pcs' },
] as const;

function ProductTab() {
  const vendors = useOptions('/vendors', (v) => `${v.kodeVendor} - ${v.namaVendor}`);
  const areas = useOptions('/areas', (a) => a.namaArea);

  const areaFeeEditor = (form: Row, setForm: (f: Row) => void) => {
    const list: Row[] = form.areaFees ?? [];
    const update = (i: number, patch: Row) => setForm({ ...form, areaFees: list.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
    return (
      <div className="mt-5 rounded-md border border-slate-200 p-3">
        <div className="mb-2 flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold text-slate-700">Tarif Cashback Khusus per Area</div>
            <div className="text-xs text-slate-500">Kosongkan bila semua area memakai tarif default di atas.</div>
          </div>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => setForm({ ...form, areaFees: [...list, { areaId: '', feeVendorPerPcs: '', feeKabengPerPcs: '', feePerusahaanPerPcs: '' }] })}
          >
            <Plus size={15} /> Area
          </button>
        </div>
        {list.map((af, i) => (
          <div key={i} className="mb-2 grid grid-cols-2 items-end gap-2 sm:grid-cols-[1.4fr_1fr_1fr_1fr_auto]">
            <div>
              <label className="label">Area</label>
              <select className="input" required value={af.areaId} onChange={(e) => update(i, { areaId: e.target.value })}>
                <option value="">— Pilih —</option>
                {areas.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
              </select>
            </div>
            {FEE_KEYS.map(({ k, l }) => (
              <div key={k}>
                <label className="label">{l}</label>
                <input className="input" type="number" step="any" min="0" required value={af[k]} onChange={(e) => update(i, { [k]: e.target.value })} />
              </div>
            ))}
            <button type="button" className="rounded p-2 text-red-600 hover:bg-red-50" onClick={() => setForm({ ...form, areaFees: list.filter((_, j) => j !== i) })}>
              <Trash2 size={16} />
            </button>
          </div>
        ))}
      </div>
    );
  };

  return (
    <CrudPage
      key="product"
      title="Produk"
      endpoint="/products"
      wideForm
      emptyForm={{
        kodeProduk: '', namaProduk: '', merek: '', vendorId: '', unit: 'PCS', isiPerDus: '24', hargaBeli: '',
        feeVendorPerPcs: '', feeKabengPerPcs: '', feePerusahaanPerPcs: '', status: 'ACTIVE', areaFees: [],
      }}
      toForm={(r) => ({
        ...r,
        vendor: undefined,
        areaFees: r.areaFees.map((a: Row) => ({
          areaId: a.areaId, feeVendorPerPcs: a.feeVendorPerPcs, feeKabengPerPcs: a.feeKabengPerPcs, feePerusahaanPerPcs: a.feePerusahaanPerPcs,
        })),
      })}
      extraForm={areaFeeEditor}
      fields={[
        { name: 'kodeProduk', label: 'Kode Produk', required: true },
        { name: 'namaProduk', label: 'Nama Produk', required: true },
        { name: 'merek', label: 'Merek' },
        { name: 'vendorId', label: 'Vendor', type: 'select', required: true, options: vendors },
        { name: 'unit', label: 'Satuan', required: true },
        { name: 'isiPerDus', label: 'Isi per Dus (pcs)', type: 'select', required: true, options: [{ value: 24, label: '24 pcs' }, { value: 36, label: '36 pcs' }] },
        { name: 'hargaBeli', label: 'Harga Beli / pcs', type: 'number', required: true },
        STATUS,
        { name: 'feeVendorPerPcs', label: 'Fee Vendor / pcs (default)', type: 'number', required: true },
        { name: 'feeKabengPerPcs', label: 'Fee Kepala Bengkel / pcs (default)', type: 'number', required: true },
        { name: 'feePerusahaanPerPcs', label: 'Fee Perusahaan / pcs (default)', type: 'number', required: true },
      ]}
      columns={[
        { label: 'Kode', render: (r) => <b>{r.kodeProduk}</b> },
        { label: 'Nama Produk', render: (r) => <>{r.namaProduk}<div className="text-xs text-slate-500">{r.vendor?.namaVendor}</div></> },
        { label: 'Isi/Dus', render: (r) => r.isiPerDus, className: 'text-right' },
        { label: 'Harga Beli', render: (r) => rupiah(r.hargaBeli), className: 'text-right' },
        { label: 'Fee V / K / P', render: (r) => `${rupiah(r.feeVendorPerPcs)} / ${rupiah(r.feeKabengPerPcs)} / ${rupiah(r.feePerusahaanPerPcs)}`, className: 'text-right whitespace-nowrap' },
        { label: 'Tarif Area', render: (r) => (r.areaFees.length ? r.areaFees.map((a: Row) => a.area.namaArea).join(', ') : '-') },
        { label: 'Status', render: (r) => <StatusBadge status={r.status} /> },
      ]}
    />
  );
}

const JABATAN = [
  { value: 'KEPALA_BENGKEL', label: 'Kepala Bengkel' },
  { value: 'SERVICE_ADVISOR', label: 'Service Advisor' },
  { value: 'LAINNYA', label: 'Lainnya' },
];

function EmployeeTab() {
  const branches = useOptions('/branches', (b) => `${b.kodeCabang} - ${b.namaCabang}`);
  return (
    <CrudPage
      key="employee"
      title="Karyawan"
      endpoint="/employees"
      emptyForm={{ nama: '', noHp: '', branchId: '', jabatan: 'KEPALA_BENGKEL', bank: '', nomorRekening: '', namaRekening: '', status: 'ACTIVE' }}
      toForm={(r) => ({ ...r, branch: undefined })}
      fields={[
        { name: 'nama', label: 'Nama', required: true },
        { name: 'noHp', label: 'No. HP' },
        { name: 'branchId', label: 'Cabang', type: 'select', required: true, options: branches },
        { name: 'jabatan', label: 'Jabatan', type: 'select', required: true, options: JABATAN },
        { name: 'bank', label: 'Bank' },
        { name: 'nomorRekening', label: 'Nomor Rekening' },
        { name: 'namaRekening', label: 'Nama di Rekening' },
        STATUS,
      ]}
      columns={[
        { label: 'Nama', render: (r) => <b>{r.nama}</b> },
        { label: 'Jabatan', render: (r) => JABATAN.find((j) => j.value === r.jabatan)?.label },
        { label: 'Cabang', render: (r) => r.branch?.namaCabang },
        { label: 'Rekening', render: (r) => (r.nomorRekening ? `${r.bank ?? ''} ${r.nomorRekening} a.n. ${r.namaRekening ?? '-'}` : '-') },
        { label: 'Status', render: (r) => <StatusBadge status={r.status} /> },
      ]}
    />
  );
}
