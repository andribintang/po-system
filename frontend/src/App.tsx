import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import type { ReactNode } from 'react';
import { AuthProvider, useAuth } from './lib/auth';
import type { Role } from './lib/api';
import { Layout } from './components/Layout';
import { LoginPage } from './pages/Login';
import { ComingSoon, DashboardPage } from './pages/Dashboard';
import { MasterDataPage } from './pages/MasterData';
import { UsersPage } from './pages/Users';
import { SettingsPage } from './pages/Settings';
import { AuditPage } from './pages/Audit';
import { AccountPage } from './pages/Account';

function Protected({ children, roles }: { children: ReactNode; roles?: Role[] }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="p-8 text-center text-slate-500">Memuat...</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />;
  return <>{children}</>;
}

const SA: Role[] = ['SUPER_ADMIN'];

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<Protected><Layout /></Protected>}>
            <Route index element={<DashboardPage />} />
            <Route path="master/:tab?" element={<Protected roles={SA}><MasterDataPage /></Protected>} />
            <Route path="users" element={<Protected roles={SA}><UsersPage /></Protected>} />
            <Route path="pengaturan" element={<Protected roles={SA}><SettingsPage /></Protected>} />
            <Route path="audit" element={<Protected roles={SA}><AuditPage /></Protected>} />
            <Route path="akun" element={<AccountPage />} />
            <Route path="po" element={<ComingSoon title="Purchase Order" />} />
            <Route path="cashback" element={<ComingSoon title="Cashback Vendor" />} />
            <Route path="pembayaran" element={<ComingSoon title="Pembayaran Cashback" />} />
            <Route path="laporan" element={<ComingSoon title="Laporan" />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
