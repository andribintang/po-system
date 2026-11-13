import { Router } from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { ah, HttpError } from '../lib/errors';
import { audit } from '../lib/audit';
import { isProd } from '../lib/env';
import { COOKIE_NAME, requireAuth, signToken } from '../middleware/auth';
import { passwordSchema } from './users';

const router = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  skip: () => process.env.NODE_ENV === 'test',
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Terlalu banyak percobaan login, coba lagi dalam 15 menit' },
});

const cookieOpts = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: isProd,
  path: '/',
  maxAge: 8 * 60 * 60 * 1000,
};

async function profile(userId: number) {
  const u = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    include: { branch: { select: { id: true, kodeCabang: true, namaCabang: true } } },
  });
  return {
    id: u.id,
    nama: u.nama,
    email: u.email,
    noHp: u.noHp,
    role: u.role,
    branchId: u.branchId,
    branch: u.branch,
    employeeId: u.employeeId,
  };
}

router.post(
  '/login',
  loginLimiter,
  ah(async (req, res) => {
    const { email, password } = z
      .object({ email: z.string().trim().toLowerCase().email(), password: z.string().min(1) })
      .parse(req.body);

    const user = await prisma.user.findFirst({ where: { email, deletedAt: null } });
    // Pesan sama untuk email salah & password salah agar tidak membocorkan akun yang ada.
    const ok = user ? await bcrypt.compare(password, user.passwordHash) : false;
    if (!user || !ok) {
      await audit(req, { aksi: 'LOGIN_GAGAL', modul: 'AUTH', dataBaru: { email } });
      throw new HttpError(401, 'Email atau password salah');
    }
    if (user.status !== 'ACTIVE') throw new HttpError(403, 'Akun Anda tidak aktif');

    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    const token = signToken(user.id, user.tokenVersion);
    res.cookie(COOKIE_NAME, token, cookieOpts);
    req.user = { ...user };
    await audit(req, { aksi: 'LOGIN', modul: 'AUTH', refId: user.id });
    res.json({ user: await profile(user.id) });
  }),
);

router.post('/logout', (_req, res) => {
  res.clearCookie(COOKIE_NAME, { ...cookieOpts, maxAge: undefined });
  res.json({ ok: true });
});

router.get(
  '/me',
  requireAuth,
  ah(async (req, res) => {
    res.json({ user: await profile(req.user!.id) });
  }),
);

router.post(
  '/change-password',
  requireAuth,
  ah(async (req, res) => {
    const body = z
      .object({ currentPassword: z.string().min(1), newPassword: passwordSchema })
      .parse(req.body);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id } });
    if (!(await bcrypt.compare(body.currentPassword, user.passwordHash))) {
      throw new HttpError(400, 'Password lama salah');
    }
    const updated = await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await bcrypt.hash(body.newPassword, 12), tokenVersion: { increment: 1 } },
    });
    // Token lama tidak berlaku lagi; terbitkan token baru untuk sesi ini.
    res.cookie(COOKIE_NAME, signToken(updated.id, updated.tokenVersion), cookieOpts);
    await audit(req, { aksi: 'GANTI_PASSWORD', modul: 'AUTH', refId: user.id });
    res.json({ ok: true });
  }),
);

export default router;
