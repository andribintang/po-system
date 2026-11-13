import { useState } from 'react';
import { api, errorText } from '../lib/api';

export function AccountPage() {
  const [f, setF] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (f.newPassword !== f.confirm) return setMsg({ ok: false, text: 'Konfirmasi password tidak sama' });
    try {
      await api('/auth/change-password', { method: 'POST', body: { currentPassword: f.currentPassword, newPassword: f.newPassword } });
      setF({ currentPassword: '', newPassword: '', confirm: '' });
      setMsg({ ok: true, text: 'Password berhasil diganti. Sesi di perangkat lain otomatis keluar.' });
    } catch (err) {
      setMsg({ ok: false, text: errorText(err) });
    }
  };

  return (
    <form onSubmit={submit} className="card max-w-md space-y-4 p-5">
      <h1 className="text-lg font-bold text-slate-800">Ganti Password</h1>
      {(['currentPassword', 'newPassword', 'confirm'] as const).map((k) => (
        <div key={k}>
          <label className="label">{{ currentPassword: 'Password Lama', newPassword: 'Password Baru (min 8, huruf + angka)', confirm: 'Ulangi Password Baru' }[k]}</label>
          <input className="input" type="password" required value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} />
        </div>
      ))}
      {msg && <div className={`rounded p-2 text-sm ${msg.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>{msg.text}</div>}
      <button className="btn-primary">Simpan</button>
    </form>
  );
}
