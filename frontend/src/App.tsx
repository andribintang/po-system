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
import { POListPage } from './pages/po/POList';
import { POFormPage } from './pages/po/POForm';
import { PODetailPage } from './pages/po/PODetail';
import { POPrintPage } from './pages/po/POPrint';
import { CashbackPage } from './pages/cashback/CashbackList';
import { CashbackFormPage } from './pages/cashback/CashbackForm';
import { CashbackDetailPage } from './pages/cashback/CashbackDetail';
import { PaymentPage } from './pages/payment/PaymentPage';
import { PaymentDetailPage } from './pages/payment/PaymentDetail';

function Protected({ children, roles }: { children: ReactNode; roles?: Role[] }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="p-8 text-center text-slate-500">Memuat...</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />;
  return <>{children}</>;
}

const SA: Role[] = ['SUPER_ADMIN'];
const OPS: Role[] = ['SUPER_ADMIN', 'ADMIN'];
const PAY: Role[] = ['SUPER_ADMIN', 'KEPALA_BENGKEL'];

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/po/:id/cetak" element={<Protected roles={OPS}><POPrintPage /></Protected>} />
          <Route element={<Protected><Layout /></Protected>}>
            <Route index element={<DashboardPage />} />
            <Route path="master/:tab?" element={<Protected roles={SA}><MasterDataPage /></Protected>} />
            <Route path="users" element={<Protected roles={SA}><UsersPage /></Protected>} />
            <Route path="pengaturan" element={<Protected roles={SA}><SettingsPage /></Protected>} />
            <Route path="audit" element={<Protected roles={SA}><AuditPage /></Protected>} />
            <Route path="akun" element={<AccountPage />} />
            <Route path="po" element={<Protected roles={OPS}><POListPage /></Protected>} />
            <Route path="po/baru" element={<Protected roles={OPS}><POFormPage /></Protected>} />
            <Route path="po/:id" element={<Protected roles={OPS}><PODetailPage /></Protected>} />
            <Route path="po/:id/edit" element={<Protected roles={OPS}><POFormPage /></Protected>} />
            <Route path="cashback" element={<CashbackPage />} />
            <Route path="cashback/tab/:tab" element={<CashbackPage />} />
            <Route path="cashback/baru" element={<Protected roles={OPS}><CashbackFormPage /></Protected>} />
            <Route path="cashback/:id" element={<CashbackDetailPage />} />
            <Route path="pembayaran" element={<Protected roles={PAY}><PaymentPage /></Protected>} />
            <Route path="pembayaran/tab/:tab" element={<Protected roles={PAY}><PaymentPage /></Protected>} />
            <Route path="pembayaran/:id" element={<Protected roles={PAY}><PaymentDetailPage /></Protected>} />
            <Route path="laporan" element={<ComingSoon title="Laporan" />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
