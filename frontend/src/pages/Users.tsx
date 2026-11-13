import { CrudPage, StatusBadge, useOptions } from '../components/CrudPage';
import { ROLE_LABEL, type Role } from '../lib/api';

export function UsersPage() {
  const branches = useOptions('/branches', (b) => `${b.kodeCabang} - ${b.namaCabang}`);
  const kabeng = useOptions('/employees', (e) => `${e.nama} (${e.branch?.namaCabang})`, 'status=ACTIVE&pageSize=500&jabatan=KEPALA_BENGKEL');
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-slate-800">Data User</h1>
      <CrudPage
        title="User"
        endpoint="/users"
        emptyForm={{ nama: '', email: '', noHp: '', role: 'ADMIN', branchId: '', employeeId: '', password: '', status: 'ACTIVE' }}
        toForm={(r) => ({ ...r, password: '', branch: undefined, employee: undefined })}
        toBody={(f) => ({
          ...f,
          branchId: f.role === 'SUPER_ADMIN' || !f.branchId ? null : f.branchId,
          employeeId: f.role === 'KEPALA_BENGKEL' && f.employeeId ? f.employeeId : null,
        })}
        fields={[
          { name: 'nama', label: 'Nama', required: true },
          { name: 'email', label: 'Email', type: 'email', required: true },
          { name: 'noHp', label: 'No. HP' },
          {
            name: 'role', label: 'Role', type: 'select', required: true,
            options: (Object.keys(ROLE_LABEL) as Role[]).map((r) => ({ value: r, label: ROLE_LABEL[r] })),
          },
          { name: 'branchId', label: 'Cabang', type: 'select', required: true, options: branches, showIf: (f) => f.role !== 'SUPER_ADMIN' },
          { name: 'employeeId', label: 'Data Karyawan (Kepala Bengkel)', type: 'select', required: true, options: kabeng, showIf: (f) => f.role === 'KEPALA_BENGKEL' },
          { name: 'password', label: 'Password (min 8, huruf + angka)', type: 'password', placeholder: 'Kosongkan bila tidak diganti' },
          {
            name: 'status', label: 'Status', type: 'select', required: true,
            options: [{ value: 'ACTIVE', label: 'Aktif' }, { value: 'INACTIVE', label: 'Nonaktif' }],
          },
        ]}
        columns={[
          { label: 'Nama', render: (r) => <><b>{r.nama}</b><div className="text-xs text-slate-500">{r.email}</div></> },
          { label: 'Role', render: (r) => ROLE_LABEL[r.role as Role] },
          { label: 'Cabang', render: (r) => r.branch?.namaCabang ?? 'Nasional' },
          { label: 'Login Terakhir', render: (r) => (r.lastLoginAt ? new Date(r.lastLoginAt).toLocaleString('id-ID') : '-') },
          { label: 'Status', render: (r) => <StatusBadge status={r.status} /> },
        ]}
      />
    </div>
  );
}
