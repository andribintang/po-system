import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import multer from 'multer';
import { prisma } from '../lib/prisma';
import { env } from '../lib/env';
import { ah, HttpError, notFound } from '../lib/errors';
import { idParam } from '../lib/http';
import { requireRole } from '../middleware/auth';

const MAX_BYTES = 2 * 1024 * 1024;
const ALLOWED: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'application/pdf': '.pdf',
};

export const uploadRoot = path.resolve(env.UPLOAD_DIR);

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    // Dikelompokkan per bulan: storage/uploads/2026-11/...
    const dir = path.join(uploadRoot, new Date().toISOString().slice(0, 7));
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  // Nama file acak; nama asli hanya disimpan di database.
  filename: (_req, file, cb) => cb(null, crypto.randomUUID() + ALLOWED[file.mimetype]),
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED[file.mimetype]) return cb(new HttpError(400, 'Format file harus PNG, JPG, WEBP, atau PDF'));
    cb(null, true);
  },
});

const router = Router();

router.post(
  '/',
  requireRole('SUPER_ADMIN', 'ADMIN'),
  (req, res, next) =>
    upload.single('file')(req, res, (err: unknown) => {
      if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
        return next(new HttpError(400, 'Ukuran file maksimal 2 MB'));
      }
      next(err);
    }),
  ah(async (req, res) => {
    if (!req.file) throw new HttpError(400, 'File wajib diunggah (field "file")');
    const rec = await prisma.fileUpload.create({
      data: {
        originalName: req.file.originalname.slice(0, 255),
        storedPath: path.relative(uploadRoot, req.file.path),
        mimeType: req.file.mimetype,
        size: req.file.size,
        uploadedById: req.user!.id,
      },
    });
    res.status(201).json({ id: rec.id, originalName: rec.originalName, mimeType: rec.mimeType, size: rec.size });
  }),
);

// File hanya bisa diambil oleh user yang sudah login (tidak disajikan sebagai folder publik).
router.get(
  '/:id',
  ah(async (req, res) => {
    const rec = await prisma.fileUpload.findUnique({ where: { id: idParam(req) } });
    if (!rec) throw notFound('File');
    const full = path.resolve(uploadRoot, rec.storedPath);
    if (!full.startsWith(uploadRoot + path.sep) || !fs.existsSync(full)) throw notFound('File');
    res.setHeader('Content-Type', rec.mimeType);
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(rec.originalName)}"`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.sendFile(full);
  }),
);

export default router;
