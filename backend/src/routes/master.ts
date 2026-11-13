
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { HttpError } from '../lib/errors';
import { crudRouter } from '../lib/crud';
import { optStr } from '../lib/http';
import { branchScope } from '../middleware/auth';

const status = z.enum(['ACTIVE', 'INACTIVE']).default('ACTIVE');
const kode = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .regex(/^[A-Za-z0-9_\-./]+$/, 'Kode hanya boleh huruf, angka, dan - _ . /')
    .transform((s) => s.toUpperCase());
const fk = z.coerce.number().int().positive();

async function mustExist(model: 'area' | 'branch' | 'vendor', id: number, label: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const row = await (prisma as any)[model].findFirst({ where: { id, deletedAt: null } });
  if (!row) throw new HttpError(400, `${label} tidak ditemukan`);
}

const ALL = ['SUPER_ADMIN', 'ADMIN', 'KEPALA_BENGKEL'] as const;

export const areaRouter = crudRouter({
  model: 'area',
  label: 'Area',
  schema: z.object({ kodeArea: kode(30), namaArea: z.string().trim().min(1).max(100), status }),
  searchFields: ['kodeArea', 'namaArea'],
  orderBy: { namaArea: 'asc' },
  readRoles: [...ALL],
  beforeDelete: async (id) => {
    const used = await prisma.branch.count({ where: { areaId: id, deletedAt: null } });
    if (used) throw new HttpError(409, `Area masih dipakai oleh ${used} cabang`);
  },
});

export const branchRouter = crudRouter({
  model: 'branch',
  label: 'Cabang',
  schema: z.object({
    kodeCabang: kode(30),
    namaCabang: z.string().trim().min(1).max(120),
    alamat: optStr(2000),
    kota: optStr(80),
    provinsi: optStr(80),
    npwp: optStr(40),
    areaId: fk,
    status,
  }),
  searchFields: ['kodeCabang', 'namaCabang', 'kota'],
  orderBy: { namaCabang: 'asc' },
  include: { area: { select: { id: true, kodeArea: true, namaArea: true } } },
  readRoles: [...ALL],
  extraFilters: (q) => (q.areaId ? { areaId: Number(q.areaId) } : {}),
  beforeSave: async (d) => mustExist('area', d.areaId, 'Area'),
  beforeDelete: async (id) => {
    const users = await prisma.user.count({ where: { branchId: id, deletedAt: null, status: 'ACTIVE' } });
    if (users) throw new HttpError(409, `Cabang masih memiliki ${users} user aktif`);
  },
});

export const vendorRouter = crudRouter({
  model: 'vendor',
  label: 'Vendor',
  schema: z.object({
    kodeVendor: kode(30),
    namaVendor: z.string().trim().min(1).max(150),
    alamat: optStr(2000),
    pic: optStr(100),
    noHp: optStr(30),
    email: z.string().trim().email().max(160).optional().nullable().or(z.literal('').transform(() => null)),
    status,
  }),
  searchFields: ['kodeVendor', 'namaVendor', 'pic'],
  orderBy: { namaVendor: 'asc' },
  readRoles: ['SUPER_ADMIN', 'ADMIN'],
  beforeDelete: async (id) => {
    const used = await prisma.product.count({ where: { vendorId: id, deletedAt: null, status: 'ACTIVE' } });
    if (used) throw new HttpError(409, `Vendor masih memiliki ${used} produk aktif`);
  },
});

export const employeeRouter = crudRouter({
  model: 'employee',
  label: 'Karyawan',
  schema: z.object({
    nama: z.string().trim().min(1).max(120),
    noHp: optStr(30),
    branchId: fk,
    jabatan: z.enum(['KEPALA_BENGKEL', 'SERVICE_ADVISOR', 'LAINNYA']),
    bank: optStr(60),
    nomorRekening: optStr(40),
    namaRekening: optStr(120),
    status,
  }),
  searchFields: ['nama', 'nomorRekening'],
  orderBy: { nama: 'asc' },
  include: { branch: { select: { id: true, kodeCabang: true, namaCabang: true } } },
  readRoles: ['SUPER_ADMIN', 'ADMIN'],
  // Admin cabang hanya melihat karyawan cabangnya.
  scopeWhere: (req) => {
    const b = branchScope(req.user!);
    return b === null ? {} : { branchId: b };
  },
  extraFilters: (q) => ({
    ...(q.branchId ? { branchId: Number(q.branchId) } : {}),
    ...(q.jabatan ? { jabatan: String(q.jabatan) } : {}),
  }),
  beforeSave: async (d) => mustExist('branch', d.branchId, 'Cabang'),
});

export { mustExist };
