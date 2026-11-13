import { useEffect, useState } from 'react';
import { api, errorText } from '../lib/api';

type S = Record<string, string | number | null>;
const FIELDS: [string, string][] = [
  ['namaPerusahaan', 'Nama Perusahaan *'],
  ['npwp', 'NPWP'],
  ['telepon', 'Telepon'],
  ['fax', 'Fax'],
  ['email', 'Email'],
  ['website', 'Website'],
  ['picDefaultPenyetuju', 'PIC Default Penyetuju PO'],
];

export function SettingsPage() {
  const [form, setForm] = useState<S>({ namaPerusahaan: '' });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api<S | null>('/company-settings').then((s) => s && setForm(s));
  }, []);

  const upload = async (key: 'logoFileId' | 'signatureFileId', file?: File) => {
    if (!file) return;
    const fd = new FormData();
    fd.append('file', file);
    try {
      const r = await api<{ id: number }>('/files', { method: 'POST', body: fd });
      setForm((f) => ({ ...f, [key]: r.id }));
    } catch (e) {
      setMsg({ ok: false, text: errorText(e) });
    }
  };

  const save = async () => {
    setSaving(true);
    setMsg(null);
    try {
      const body = { ...form };
      delete body.id;
      delete body.updatedAt;
      setForm(await api<S>('/company-settings', { method: 'PUT', body }));
      setMsg({ ok: true, text: 'Pengaturan tersimpan' });
    } catch (e) {
      setMsg({ ok: false, text: errorText(e) });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-slate-800">Pengaturan Perusahaan</h1>
      <p className="text-sm text-slate-500">Dipakai sebagai kop surat dan tanda tangan pada dokumen PO.</p>
      <div className="card grid grid-cols-1 gap-4 p-5 sm:grid-cols-2">
        {FIELDS.map(([k, l]) => (
          <div key={k}>
            <label className="label">{l}</label>
            <input className="input" value={form[k] ?? ''} onChange={(e) => setForm({ ...form, [k]: e.target.value })} />
          </div>
        ))}
        <div className="sm:col-span-2">
          <label className="label">Alamat Pusat</label>
          <textarea className="input" rows={3} value={form.alamatPusat ?? ''} onChange={(e) => setForm({ ...form, alamatPusat: e.target.value })} />
        </div>
        {(['logoFileId', 'signatureFileId'] as const).map((k) => (
          <div key={k}>
            <label className="label">{k === 'logoFileId' ? 'Logo Perusahaan' : 'Tanda Tangan Digital'}</label>
            {form[k] ? <img src={`/api/files/${form[k]}`} alt="" className="mb-2 h-20 rounded border border-slate-200 bg-white object-contain p-1" /> : null}
            <input type="file" accept="image/png,image/jpeg,image/webp" className="text-sm" onChange={(e) => upload(k, e.target.files?.[0])} />
            {form[k] ? (
              <button className="ml-2 text-xs text-red-600" onClick={() => setForm({ ...form, [k]: null })}>hapus</button>
            ) : null}
          </div>
        ))}
        {msg && (
          <div className={`sm:col-span-2 rounded p-3 text-sm ${msg.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>{msg.text}</div>
        )}
        <div className="sm:col-span-2 flex justify-end">
          <button className="btn-primary" onClick={save} disabled={saving}>{saving ? 'Menyimpan...' : 'Simpan Pengaturan'}</button>
        </div>
      </div>
    </div>
  );
}
