import { useEffect, useState } from 'react';
import { Building2, Package, Truck, Users } from 'lucide-react';
import { api, type Paged } from '../lib/api';
import { useAuth } from '../lib/auth';

export function DashboardPage() {
  const { user } = useAuth();
  const [counts, setCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    const eps: [string, string][] = [['branches', '/branches'], ['products', '/products']];
    if (user?.role !== 'KEPALA_BENGKEL') eps.push(['vendors', '/vendors'], ['employees', '/employees']);
    eps.forEach(([k, ep]) =>
      api<Paged<unknown>>(`${ep}?status=ACTIVE&pageSize=1`).then((r) => setCounts((c) => ({ ...c, [k]: r.total }))).catch(() => undefined),
    );
  }, [user]);

  const cards = [
    { k: 'branches', l: 'Cabang Aktif', icon: Building2 },
    { k: 'vendors', l: 'Vendor Aktif', icon: Truck },
    { k: 'products', l: 'Master Produk', icon: Package },
    { k: 'employees', l: 'Karyawan', icon: Users },
  ].filter((c) => counts[c.k] !== undefined);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-slate-800">Selamat datang, {user?.nama}</h1>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {cards.map((c) => (
          <div key={c.k} className="card flex items-center gap-4 p-4">
            <div className="rounded-lg bg-blue-50 p-3 text-blue-700"><c.icon size={22} /></div>
            <div>
              <div className="text-2xl font-bold text-slate-800">{counts[c.k]}</div>
              <div className="text-xs text-slate-500">{c.l}</div>
            </div>
          </div>
        ))}
      </div>
      <div className="card p-4 text-sm text-slate-600">
        KPI PO, cashback diterima, cashback dibayarkan, dan outstanding akan tampil di sini setelah modul PO dan Cashback selesai (tahap berikutnya).
      </div>
    </div>
  );
}

export function ComingSoon({ title }: { title: string }) {
  return (
    <div className="card p-8 text-center">
      <h1 className="text-lg font-bold text-slate-800">{title}</h1>
      <p className="mt-2 text-sm text-slate-500">Modul ini sedang dibangun pada tahap berikutnya.</p>
    </div>
  );
}
