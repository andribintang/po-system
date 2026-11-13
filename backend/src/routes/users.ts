import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { ah, HttpError, notFound } from '../lib/errors';
import { audit } from '../lib/audit';
import { idParam, listQuery, optStr } from '../lib/http';
import { requireRole } from '../middleware/auth';

export const passwordSchema = z
  .string()
  .min(8, 'Password minimal 8 karakter')
  .max(72)
  .regex(/[A-Za-z]/, 'Password harus mengandung huruf')
  .regex(/[0-9]/, 'Password harus mengandung angka');

const router = Router();
router.use(requireRole('SUPER_ADMIN'));

const publicSelect = {
  id: true,
  nama: true,
  email: true,
  noHp: true,
  role: true,
  branchId: true,
  employeeId: true,
  status: true,
  lastLoginAt: true,
  createdAt: true,
  updatedAt: true,
  branch: { select: { id: true, kodeCabang: true, namaCabang: true } },
  employee: { select: { id: true, nama: true } },
} satisfies Prisma.UserSelect;

const baseFields = {
  nama: z.string().trim().min(1).max(120),
  email: z.string().trim().toLowerCase().email().max(160),
  noHp: optStr(30),
  role: z.enum(['SUPER_ADMIN', 'ADMIN', 'KEPALA_BENGKEL']),
  branchId: z.coerce.number().int().positive().nullable().optional(),
  employeeId: z.coerce.number().int().positive().nullable().optional(),
  status: z.enum(['ACTIVE', 'INACTIVE']).default('ACTIVE'),
};
const createSchema = z.object({ ...baseFields, password: passwordSchema });
const updateSchema = z.object({ ...baseFields, password: passwordSchema.optional().or(z.literal('')) });

/** Validasi aturan role vs cabang vs karyawan. Mengembalikan nilai yang sudah dinormalisasi. */
async function normalizeScope(data: z.infer<typeof updateSchema>) {
  if (data.role === 'SUPER_ADMIN') return { branchId: null, employeeId: null };
  if (!data.branchId) throw new HttpError(400, 'Cabang wajib diisi untuk role Admin / Kepala Bengkel');
  const branch = await prisma.branch.findFirst({ where: { id: data.branchId, deletedAt: null } });
  if (!branch) throw new HttpError(400, 'Cabang tidak ditemukan');
  if (data.role === 'ADMIN') return { branchId: data.branchId, employeeId: null };

  if (!data.employeeId) throw new HttpError(400, 'Kepala Bengkel wajib ditautkan ke data karyawan');
  const emp = await prisma.employee.findFirst({ where: { id: data.employeeId, deletedAt: null } });
  if (!emp) throw new HttpError(400, 'Karyawan tidak ditemukan');
  if (emp.jabatan !== 'KEPALA_BENGKEL') throw new HttpError(400, 'Karyawan tersebut bukan Kepala Bengkel');
  if (emp.branchId !== data.branchId) throw new HttpError(400, 'Karyawan tidak berada di cabang yang dipilih');
  return { branchId: data.branchId, employeeId: data.employeeId };
}

router.get(
  '/',
  ah(async (req, res) => {
    const q = listQuery.extend({ role: z.enum(['SUPER_ADMIN', 'ADMIN', 'KEPALA_BENGKEL']).optional() }).parse(req.query);
    const where: Prisma.UserWhereInput = {
      deletedAt: null,
      status: q.status,
      role: q.role,
      ...(q.q ? { OR: [{ nama: { contains: q.q } }, { email: { contains: q.q } }] } : {}),
    };
    const [items, total] = await Promise.all([
      prisma.user.findMany({
        where,
        select: publicSelect,
        orderBy: { nama: 'asc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      prisma.user.count({ where }),
    ]);
    res.json({ items, total, page: q.page, pageSize: q.pageSize });
  }),
);

router.get(
  '/:id',
  ah(async (req, res) => {
    const u = await prisma.user.findFirst({ where: { id: idParam(req), deletedAt: null }, select: publicSelect });
    if (!u) throw notFound('User');
    res.json(u);
  }),
);

router.post(
  '/',
  ah(async (req, res) => {
    const data = createSchema.parse(req.body);
    const scope = await normalizeScope(data);
    const created = await prisma.user.create({
      data: {
        nama: data.nama,
        email: data.email,
        noHp: data.noHp,
        role: data.role,
        status: data.status,
        ...scope,
        passwordHash: await bcrypt.hash(data.password, 12),
      },
      select: publicSelect,
    });
    await audit(req, { aksi: 'CREATE', modul: 'USER', refId: created.id, dataBaru: created });
    res.status(201).json(created);
  }),
);

router.put(
  '/:id',
  ah(async (req, res) => {
    const id = idParam(req);
    const data = updateSchema.parse(req.body);
    const old = await prisma.user.findFirst({ where: { id, deletedAt: null }, select: publicSelect });
    if (!old) throw notFound('User');
    if (id === req.user!.id && (data.role !== 'SUPER_ADMIN' || data.status !== 'ACTIVE')) {
      throw new HttpError(400, 'Anda tidak bisa menurunkan role atau menonaktifkan akun sendiri');
    }
    const scope = await normalizeScope(data);
    // Ganti password / role / cabang / status → token lama dibatalkan.
    const securityChanged =
      !!data.password ||
      data.role !== old.role ||
      data.status !== old.status ||
      scope.branchId !== old.branchId;
    const updated = await prisma.user.update({
      where: { id },
      data: {
        nama: data.nama,
        email: data.email,
        noHp: data.noHp,
        role: data.role,
        status: data.status,
        ...scope,
        ...(data.password ? { passwordHash: await bcrypt.hash(data.password, 12) } : {}),
        ...(securityChanged ? { tokenVersion: { increment: 1 } } : {}),
      },
      select: publicSelect,
    });
    await audit(req, { aksi: 'UPDATE', modul: 'USER', refId: id, dataLama: old, dataBaru: updated });
    res.json(updated);
  }),
);

router.delete(
  '/:id',
  ah(async (req, res) => {
    const id = idParam(req);
    if (id === req.user!.id) throw new HttpError(400, 'Anda tidak bisa menghapus akun sendiri');
    const old = await prisma.user.findFirst({ where: { id, deletedAt: null }, select: publicSelect });
    if (!old) throw notFound('User');
    // Soft delete. Email diubah agar alamat yang sama bisa dipakai lagi untuk akun baru.
    await prisma.user.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        status: 'INACTIVE',
        email: `deleted-${id}-${Date.now()}@deleted.local`,
        employeeId: null,
        tokenVersion: { increment: 1 },
      },
    });
    await audit(req, { aksi: 'DELETE', modul: 'USER', refId: id, dataLama: old });
    res.json({ ok: true });
  }),
);

export default router;
