import { useEffect, useRef, useState } from 'react';
import { Bell } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';

interface Notif { id: number; title: string; message: string; refType: string | null; refId: number | null; createdAt: string; read: boolean }

/** Lonceng notifikasi. Diperbarui tiap 30 detik (pengganti onSnapshot Firestore). */
export function NotificationBell() {
  const [data, setData] = useState<{ unread: number; items: Notif[] }>({ unread: 0, items: [] });
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const nav = useNavigate();

  const load = () => api<typeof data>('/notifications').then(setData).catch(() => undefined);
  useEffect(() => {
    load();
    const t = setInterval(load, 30_000);
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => {
      clearInterval(t);
      document.removeEventListener('mousedown', close);
    };
  }, []);

  const openItem = async (n: Notif) => {
    setOpen(false);
    if (!n.read) await api(`/notifications/${n.id}/read`, { method: 'POST' }).catch(() => undefined);
    load();
    if (n.refType === 'PO' && n.refId) nav(`/po/${n.refId}`);
    if (n.refType === 'CASHBACK' && n.refId) nav(`/cashback/${n.refId}`);
    if (n.refType === 'PAYMENT' && n.refId) nav(`/pembayaran/${n.refId}`);
  };

  return (
    <div className="relative" ref={ref}>
      <button className="btn-secondary relative" onClick={() => setOpen(!open)} title="Notifikasi">
        <Bell size={16} />
        {data.unread > 0 && (
          <span className="absolute -right-1.5 -top-1.5 rounded-full bg-red-600 px-1.5 text-[10px] font-bold text-white">
            {data.unread > 99 ? '99+' : data.unread}
          </span>
        )}
      </button>
      {open && (
        <div className="card absolute right-0 z-50 mt-2 w-80 max-w-[calc(100vw-2rem)]">
          <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2">
            <span className="text-sm font-semibold">Notifikasi</span>
            {data.unread > 0 && (
              <button className="text-xs text-blue-700" onClick={() => api('/notifications/read-all', { method: 'POST' }).then(load)}>
                Tandai semua dibaca
              </button>
            )}
          </div>
          <div className="max-h-96 overflow-y-auto">
            {data.items.map((n) => (
              <button key={n.id} onClick={() => openItem(n)} className={`block w-full border-b border-slate-100 px-3 py-2 text-left hover:bg-slate-50 ${n.read ? '' : 'bg-blue-50/60'}`}>
                <div className="text-sm font-medium text-slate-800">{n.title}</div>
                <div className="text-xs text-slate-500">{n.message}</div>
                <div className="mt-0.5 text-[10px] text-slate-400">{new Date(n.createdAt).toLocaleString('id-ID')}</div>
              </button>
            ))}
            {!data.items.length && <div className="p-4 text-center text-sm text-slate-400">Belum ada notifikasi</div>}
          </div>
        </div>
      )}
    </div>
  );
}
