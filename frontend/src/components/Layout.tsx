import { NavLink, Outlet } from 'react-router-dom';
import { useState } from 'react';
import {
  LayoutDashboard, Database, Users, Settings, ScrollText, FileText, Wallet, HandCoins, BarChart3, LogOut, Menu, KeyRound,
} from 'lucide-react';
import { useAuth } from '../lib/auth';
import { NotificationBell } from './NotificationBell';
import { ROLE_LABEL, type Role } from '../lib/api';

interface NavItem { to: string; label: string; icon: typeof Menu; roles: Role[]; soon?: boolean }

const NAV: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, roles: ['SUPER_ADMIN', 'ADMIN', 'KEPALA_BENGKEL'] },
  { to: '/po', label: 'Purchase Order', icon: FileText, roles: ['SUPER_ADMIN', 'ADMIN'] },
  { to: '/cashback', label: 'Cashback Vendor', icon: HandCoins, roles: ['SUPER_ADMIN', 'ADMIN', 'KEPALA_BENGKEL'], soon: true },
  { to: '/pembayaran', label: 'Pembayaran Cashback', icon: Wallet, roles: ['SUPER_ADMIN', 'KEPALA_BENGKEL'], soon: true },
  { to: '/laporan', label: 'Laporan', icon: BarChart3, roles: ['SUPER_ADMIN', 'ADMIN'], soon: true },
  { to: '/master', label: 'Master Data', icon: Database, roles: ['SUPER_ADMIN'] },
  { to: '/users', label: 'Data User', icon: Users, roles: ['SUPER_ADMIN'] },
  { to: '/pengaturan', label: 'Pengaturan Perusahaan', icon: Settings, roles: ['SUPER_ADMIN'] },
  { to: '/audit', label: 'Audit Trail', icon: ScrollText, roles: ['SUPER_ADMIN'] },
];

export function Layout() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  if (!user) return null;
  const items = NAV.filter((n) => n.roles.includes(user.role));

  return (
    <div className="flex min-h-screen">
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-64 transform bg-slate-900 text-slate-200 transition md:static md:translate-x-0 ${open ? 'translate-x-0' : '-translate-x-full'}`}
      >
        <div className="border-b border-slate-800 px-5 py-4">
          <div className="text-lg font-bold text-white">PO System</div>
          <div className="text-xs text-slate-400">Purchase Order & Cashback</div>
        </div>
        <nav className="space-y-1 p-3">
          {items.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.to === '/'}
              onClick={() => setOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-md px-3 py-2 text-sm ${isActive ? 'bg-blue-700 text-white' : 'hover:bg-slate-800'}`
              }
            >
              <n.icon size={17} />
              <span className="flex-1">{n.label}</span>
              {n.soon && <span className="rounded bg-slate-700 px-1.5 text-[10px] text-slate-300">segera</span>}
            </NavLink>
          ))}
        </nav>
      </aside>
      {open && <div className="fixed inset-0 z-30 bg-black/40 md:hidden" onClick={() => setOpen(false)} />}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-3">
          <button className="rounded p-1 md:hidden" onClick={() => setOpen(true)} aria-label="Menu">
            <Menu size={20} />
          </button>
          <div className="flex-1" />
          <div className="hidden text-right text-sm sm:block">
            <div className="font-semibold text-slate-800">{user.nama}</div>
            <div className="text-xs text-slate-500">
              {ROLE_LABEL[user.role]} · {user.branch ? user.branch.namaCabang : 'Nasional'}
            </div>
          </div>
          <NotificationBell />
          <NavLink to="/akun" className="btn-secondary" title="Ganti password"><KeyRound size={16} /></NavLink>
          <button onClick={logout} className="btn-secondary" title="Keluar"><LogOut size={16} /></button>
        </header>
        <main className="flex-1 p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
