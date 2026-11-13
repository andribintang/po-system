import { useState } from 'react';
import { Download, Upload } from 'lucide-react';
import { ApiError, api, download, errorText } from '../lib/api';
import { Modal } from './Modal';

interface Props {
  title: string;
  templatePath: string;
  importPath: string;
  onClose: () => void;
  onDone: (result: unknown) => void;
  describe?: (result: unknown) => string;
}

/** Dialog impor Excel: unduh template, pilih file, tampilkan kesalahan per baris. */
export function ExcelImport(p: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [rows, setRows] = useState<{ row: number; message: string }[]>([]);
  const [done, setDone] = useState('');

  const submit = async () => {
    if (!file) return;
    setBusy(true);
    setError('');
    setRows([]);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const r = await api(p.importPath, { method: 'POST', body: fd });
      setDone(p.describe?.(r) ?? 'Impor berhasil');
      p.onDone(r);
    } catch (e) {
      setError(errorText(e));
      if (e instanceof ApiError) setRows((e.details as { rows?: typeof rows })?.rows ?? []);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={p.title} onClose={p.onClose}>
      <div className="space-y-4 text-sm">
        <p className="text-slate-600">
          Gunakan template agar nama kolom sesuai. Jika ada satu baris yang salah, seluruh impor dibatalkan dan tidak ada data yang tersimpan.
        </p>
        <button className="btn-secondary" onClick={() => download(p.templatePath, 'template.xlsx').catch((e) => setError(errorText(e)))}>
          <Download size={15} /> Unduh Template
        </button>
        <input type="file" accept=".xlsx" className="block w-full text-sm" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        {error && <div className="rounded bg-red-50 p-3 text-red-700">{error}</div>}
        {rows.length > 0 && (
          <div className="max-h-56 overflow-auto rounded border border-red-200">
            <table className="w-full text-xs">
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} className="border-b border-red-100">
                    <td className="w-20 px-2 py-1 font-semibold text-red-700">Baris {r.row}</td>
                    <td className="px-2 py-1">{r.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {done && <div className="rounded bg-emerald-50 p-3 text-emerald-700">{done}</div>}
        <div className="flex justify-end gap-2">
          <button className="btn-secondary" onClick={p.onClose}>Tutup</button>
          <button className="btn-primary" disabled={!file || busy} onClick={submit}>
            <Upload size={15} /> {busy ? 'Mengimpor...' : 'Impor'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
