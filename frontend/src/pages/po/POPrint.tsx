import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { toBlob } from 'html-to-image';
import { Copy, Image, Printer } from 'lucide-react';
import { api, errorText, rupiah, tanggal, angka } from '../../lib/api';
import type { Row } from '../../components/CrudPage';
import { PO_STATUS, type POStatus } from '../../components/POStatusBadge';
import { groupByBranch } from './PODetail';

const SIGNED: POStatus[] = ['APPROVED', 'DIKIRIM_VENDOR', 'DIKIRIM', 'DITERIMA', 'SELESAI'];

/** Dokumen PO ukuran A4 untuk dicetak / disimpan sebagai PDF atau PNG. */
export function POPrintPage() {
  const { id } = useParams();
  const [po, setPo] = useState<Row | null>(null);
  const [co, setCo] = useState<Row | null>(null);
  const [msg, setMsg] = useState('');
  const doc = useRef<HTMLDivElement>(null);

  useEffect(() => {
    Promise.all([api<Row>(`/po/${id}`), api<Row | null>('/company-settings')])
      .then(([p, c]) => {
        setPo(p);
        setCo(c);
        document.title = p.poNumber.replace(/\//g, '-');
      })
      .catch((e) => setMsg(errorText(e)));
  }, [id]);

  const snapshot = async () => {
    const blob = await toBlob(doc.current!, { pixelRatio: 2, backgroundColor: '#ffffff' });
    if (!blob) throw new Error('Gagal membuat gambar');
    return blob;
  };
  const savePng = async () => {
    try {
      const url = URL.createObjectURL(await snapshot());
      const a = document.createElement('a');
      a.href = url;
      a.download = `${po!.poNumber.replace(/\//g, '-')}.png`;
      a.click();
    } catch (e) {
      setMsg(errorText(e));
    }
  };
  const copyPng = async () => {
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': snapshot() })]);
      setMsg('Gambar PO disalin ke clipboard');
    } catch {
      setMsg('Browser tidak mengizinkan salin gambar. Gunakan tombol Simpan PNG.');
    }
  };

  if (!po) return <div className="p-6 text-slate-500">{msg || 'Memuat...'}</div>;
  const groups = groupByBranch(po.details);
  const signed = SIGNED.includes(po.status);
  // Nomor urut baris dihitung di depan (bukan counter saat render) agar tetap benar di StrictMode.
  const starts = groups.map((_, i) => groups.slice(0, i).reduce((a, g) => a + g.rows.length, 0));

  return (
    <div className="min-h-screen bg-slate-200 py-6 print:bg-white print:py-0">
      <style>{`@page { size: A4; margin: 12mm; } @media print { .no-print { display: none !important; } }`}</style>
      <div className="no-print mx-auto mb-4 flex max-w-[210mm] flex-wrap items-center gap-2 px-4">
        <button className="btn-primary" onClick={() => window.print()}><Printer size={15} /> Cetak / Simpan PDF</button>
        <button className="btn-secondary" onClick={savePng}><Image size={15} /> Simpan PNG</button>
        <button className="btn-secondary" onClick={copyPng}><Copy size={15} /> Salin PNG</button>
        {msg && <span className="text-sm text-slate-700">{msg}</span>}
      </div>

      <div className="overflow-x-auto">
        <div ref={doc} className="mx-auto w-[210mm] bg-white p-[12mm] text-[11px] leading-snug text-slate-900 shadow print:w-auto print:p-0 print:shadow-none">
          <div className="flex items-start gap-4 border-b-2 border-slate-800 pb-3">
            {co?.logoFileId && <img src={`/api/files/${co.logoFileId}`} alt="" className="h-16 w-16 object-contain" />}
            <div className="flex-1">
              <div className="text-lg font-bold">{co?.namaPerusahaan ?? 'Nama Perusahaan'}</div>
              <div className="whitespace-pre-line">{co?.alamatPusat}</div>
              <div>
                {[co?.telepon && `Telp ${co.telepon}`, co?.fax && `Fax ${co.fax}`, co?.email, co?.website].filter(Boolean).join(' · ')}
              </div>
              {co?.npwp && <div>NPWP {co.npwp}</div>}
            </div>
            <div className="text-right">
              <div className="text-xl font-bold tracking-wide">PURCHASE ORDER</div>
              <div className="font-semibold">{po.poNumber}</div>
              <div>Tanggal: {tanggal(po.tanggalPo)}</div>
              <div>Status: {PO_STATUS[po.status as POStatus].label}</div>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-4">
            <div>
              <div className="font-semibold text-slate-500">KEPADA (VENDOR)</div>
              <div className="font-bold">{po.vendor.namaVendor}</div>
              <div>Kode: {po.vendor.kodeVendor}</div>
            </div>
            <div>
              <div className="font-semibold text-slate-500">DIKIRIM KE</div>
              {po.isMulti ? (
                <div className="font-bold">Multi cabang ({groups.length} cabang), lihat rincian</div>
              ) : (
                <div className="font-bold">{po.branch?.kodeCabang} · {po.branch?.namaCabang}</div>
              )}
            </div>
          </div>

          <table className="mt-4 w-full border-collapse">
            <thead>
              <tr className="bg-slate-100">
                {['No', 'Kode', 'Nama Produk', 'Qty Dus', 'Isi/Dus', 'Total Pcs', 'Harga/Pcs', 'Subtotal'].map((h, i) => (
                  <th key={h} className={`border border-slate-400 px-1.5 py-1 ${i >= 3 ? 'text-right' : 'text-left'}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {groups.map((g, gi) => (
                <GroupRows key={g.branch.id} g={g} showHeader={po.isMulti} start={starts[gi]} />
              ))}
            </tbody>
            <tfoot>
              <tr className="font-bold">
                <td colSpan={3} className="border border-slate-400 px-1.5 py-1 text-right">TOTAL</td>
                <td className="border border-slate-400 px-1.5 py-1 text-right">{angka(po.totalDus)}</td>
                <td className="border border-slate-400" />
                <td className="border border-slate-400 px-1.5 py-1 text-right">{angka(po.totalPcs)}</td>
                <td className="border border-slate-400" />
                <td className="border border-slate-400 px-1.5 py-1 text-right">{rupiah(po.grandTotal)}</td>
              </tr>
            </tfoot>
          </table>

          {po.catatan && <div className="mt-3"><b>Catatan:</b> {po.catatan}</div>}

          <div className="mt-8 grid grid-cols-2 gap-8 text-center">
            <div>
              <div>Dibuat oleh,</div>
              <div className="h-20" />
              <div className="font-semibold underline">{po.createdBy.nama}</div>
            </div>
            <div>
              <div>Disetujui oleh,</div>
              <div className="flex h-20 items-center justify-center">
                {signed && co?.signatureFileId && <img src={`/api/files/${co.signatureFileId}`} alt="" className="max-h-20 object-contain" />}
              </div>
              <div className="font-semibold underline">{po.approvedBy?.nama ?? co?.picDefaultPenyetuju ?? '..................'}</div>
              {!signed && <div className="text-[10px] text-red-600">Belum disetujui</div>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function GroupRows({ g, showHeader, start }: { g: { branch: Row; rows: Row[] }; showHeader: boolean; start: number }) {
  return (
    <>
      {showHeader && (
        <tr>
          <td colSpan={8} className="border border-slate-400 bg-slate-50 px-1.5 py-1 font-semibold">
            Cabang: {g.branch.kodeCabang} · {g.branch.namaCabang}
          </td>
        </tr>
      )}
      {g.rows.map((d, i) => (
        <tr key={d.id}>
          <td className="border border-slate-400 px-1.5 py-1">{start + i + 1}</td>
          <td className="border border-slate-400 px-1.5 py-1">{d.product.kodeProduk}</td>
          <td className="border border-slate-400 px-1.5 py-1">{d.namaProduk}</td>
          <td className="border border-slate-400 px-1.5 py-1 text-right">{angka(d.qtyDus)}</td>
          <td className="border border-slate-400 px-1.5 py-1 text-right">{d.isiPerDus}</td>
          <td className="border border-slate-400 px-1.5 py-1 text-right">{angka(d.totalPcs)}</td>
          <td className="border border-slate-400 px-1.5 py-1 text-right">{rupiah(d.harga)}</td>
          <td className="border border-slate-400 px-1.5 py-1 text-right">{rupiah(d.subtotal)}</td>
        </tr>
      ))}
    </>
  );
}
