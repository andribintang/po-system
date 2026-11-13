import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { api, errorText, type Paged } from '../lib/api';
import { Modal } from './Modal';

export type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
export interface Option { value: string | number; label: string }

export interface Field {
  name: string;
  label: string;
  type?: 'text' | 'number' | 'email' | 'password' | 'textarea' | 'select';
  required?: boolean;
  options?: Option[];
  /** Tampilkan field hanya bila kondisi terpenuhi (berdasarkan isi form). */
  showIf?: (form: Row) => boolean;
  placeholder?: string;
  full?: boolean;
}

export interface Column { label: string; render: (row: Row) => ReactNode; className?: string }

interface Props {
  title: string;
  endpoint: string;
  columns: Column[];
  fields: Field[];
  emptyForm: Row;
  /** Ubah data baris menjadi isi form saat edit. */
  toForm?: (row: Row) => Row;
  /** Ubah isi form menjadi body request. */
  toBody?: (form: Row) => Row;
  /** Bagian form tambahan (misalnya tabel fee per area). */
  extraForm?: (form: Row, setForm: (f: Row) => void) => ReactNode;
  canWrite?: boolean;
  wideForm?: boolean;
}

export function StatusBadge({ status }: { status: string }) {
  const active = status === 'ACTIVE';
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'}`}>
      {active ? 'Aktif' : 'Nonaktif'}
    </span>
  );
}

export function CrudPage(p: Props) {
  const [data, setData] = useState<Paged<Row>>({ items: [], total: 0, page: 1, pageSize: 20 });
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<{ id: number | null; form: Row } | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: '20' });
      if (q) params.set('q', q);
      setData(await api<Paged<Row>>(`${p.endpoint}?${params}`));
    } catch (e) {
      setError(errorText(e));
    } finally {
      setLoading(false);
    }
  }, [p.endpoint, page, q]);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  const openNew = () => {
    setFormError('');
    setEditing({ id: null, form: { ...p.emptyForm } });
  };
  const openEdit = (row: Row) => {
    setFormError('');
    setEditing({ id: row.id, form: p.toForm ? p.toForm(row) : { ...row } });
  };

  const save = async () => {
    if (!editing) return;
    setSaving(true);
    setFormError('');
    try {
      const body = p.toBody ? p.toBody(editing.form) : editing.form;
      await api(editing.id ? `${p.endpoint}/${editing.id}` : p.endpoint, {
        method: editing.id ? 'PUT' : 'POST',
        body,
      });
      setEditing(null);
      load();
    } catch (e) {
      setFormError(errorText(e));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (row: Row) => {
    if (!window.confirm('Hapus data ini? Data akan dinonaktifkan dan disembunyikan.')) return;
    try {
      await api(`${p.endpoint}/${row.id}`, { method: 'DELETE' });
      load();
    } catch (e) {
      setError(errorText(e));
    }
  };

  const setForm = (f: Row) => setEditing((s) => (s ? { ...s, form: f } : s));
  const pages = Math.max(1, Math.ceil(data.total / data.pageSize));

  return (
    <div className="card">
      <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 p-4">
        <h2 className="flex-1 font-semibold text-slate-800">{p.title}</h2>
        <div className="relative">
          <Search size={15} className="absolute left-2.5 top-2.5 text-slate-400" />
          <input
            className="input w-56 pl-8"
            placeholder="Cari..."
            value={q}
            onChange={(e) => {
              setPage(1);
              setQ(e.target.value);
            }}
          />
        </div>
        {p.canWrite !== false && (
          <button className="btn-primary" onClick={openNew}>
            <Plus size={16} /> Tambah
          </button>
        )}
      </div>
      {error && <div className="m-4 rounded bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              {p.columns.map((c) => (
                <th key={c.label} className={`px-4 py-2 ${c.className ?? ''}`}>{c.label}</th>
              ))}
              {p.canWrite !== false && <th className="w-24 px-4 py-2" />}
            </tr>
          </thead>
          <tbody>
            {data.items.map((row) => (
              <tr key={row.id} className="border-t border-slate-100 hover:bg-slate-50">
                {p.columns.map((c) => (
                  <td key={c.label} className={`px-4 py-2 ${c.className ?? ''}`}>{c.render(row)}</td>
                ))}
                {p.canWrite !== false && (
                  <td className="px-4 py-2 text-right whitespace-nowrap">
                    <button className="rounded p-1.5 text-blue-700 hover:bg-blue-50" onClick={() => openEdit(row)} title="Edit">
                      <Pencil size={15} />
                    </button>
                    <button className="rounded p-1.5 text-red-600 hover:bg-red-50" onClick={() => remove(row)} title="Hapus">
                      <Trash2 size={15} />
                    </button>
                  </td>
                )}
              </tr>
            ))}
            {!data.items.length && (
              <tr>
                <td colSpan={p.columns.length + 1} className="px-4 py-8 text-center text-slate-400">
                  {loading ? 'Memuat...' : 'Belum ada data'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between border-t border-slate-200 px-4 py-2 text-xs text-slate-500">
        <span>Total {data.total} data</span>
        <div className="flex items-center gap-2">
          <button className="btn-secondary px-2 py-1" disabled={page <= 1} onClick={() => setPage(page - 1)}>‹</button>
          <span>{page} / {pages}</span>
          <button className="btn-secondary px-2 py-1" disabled={page >= pages} onClick={() => setPage(page + 1)}>›</button>
        </div>
      </div>

      {editing && (
        <Modal title={`${editing.id ? 'Edit' : 'Tambah'} ${p.title}`} onClose={() => setEditing(null)} wide={p.wideForm}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              save();
            }}
          >
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {p.fields
                .filter((f) => !f.showIf || f.showIf(editing.form))
                .map((f) => (
                  <div key={f.name} className={f.full || f.type === 'textarea' ? 'sm:col-span-2' : ''}>
                    <label className="label">
                      {f.label} {f.required && <span className="text-red-500">*</span>}
                    </label>
                    <FieldInput field={f} value={editing.form[f.name]} onChange={(v) => setForm({ ...editing.form, [f.name]: v })} />
                  </div>
                ))}
            </div>
            {p.extraForm?.(editing.form, setForm)}
            {formError && <div className="mt-4 rounded bg-red-50 p-3 text-sm text-red-700">{formError}</div>}
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" className="btn-secondary" onClick={() => setEditing(null)}>Batal</button>
              <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Menyimpan...' : 'Simpan'}</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

function FieldInput({ field: f, value, onChange }: { field: Field; value: unknown; onChange: (v: unknown) => void }) {
  const v = value === null || value === undefined ? '' : String(value);
  if (f.type === 'select') {
    return (
      <select className="input" value={v} required={f.required} onChange={(e) => onChange(e.target.value)}>
        <option value="">— Pilih —</option>
        {f.options?.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    );
  }
  if (f.type === 'textarea') {
    return <textarea className="input" rows={3} value={v} required={f.required} onChange={(e) => onChange(e.target.value)} />;
  }
  return (
    <input
      className="input"
      type={f.type ?? 'text'}
      step={f.type === 'number' ? 'any' : undefined}
      value={v}
      required={f.required}
      placeholder={f.placeholder}
      autoComplete={f.type === 'password' ? 'new-password' : undefined}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

/** Ambil daftar pilihan (dropdown) dari endpoint master data. */
export function useOptions(endpoint: string, label: (r: Row) => string, query = 'status=ACTIVE&pageSize=500') {
  const [opts, setOpts] = useState<Option[]>([]);
  useEffect(() => {
    api<Paged<Row>>(`${endpoint}?${query}`)
      .then((r) => setOpts(r.items.map((i) => ({ value: i.id, label: label(i) }))))
      .catch(() => setOpts([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endpoint, query]);
  return opts;
}
