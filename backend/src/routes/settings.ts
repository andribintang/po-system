import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { ah, HttpError } from '../lib/errors';
import { audit } from '../lib/audit';
import { optStr } from '../lib/http';
import { requireRole } from '../middleware/auth';

const router = Router();

const schema = z.object({
  namaPerusahaan: z.string().trim().min(1).max(150),
  alamatPusat: optStr(2000),
  telepon: optStr(40),
  fax: optStr(40),
  email: optStr(160),
  website: optStr(160),
  npwp: optStr(40),
  picDefaultPenyetuju: optStr(120),
  logoFileId: z.coerce.number().int().positive().nullable().optional(),
  signatureFileId: z.coerce.number().int().positive().nullable().optional(),
});

router.get(
  '/',
  ah(async (_req, res) => {
    const s = await prisma.companySettings.findUnique({ where: { id: 1 } });
    res.json(s);
  }),
);

router.put(
  '/',
  requireRole('SUPER_ADMIN'),
  ah(async (req, res) => {
    const data = schema.parse(req.body);
    for (const fid of [data.logoFileId, data.signatureFileId]) {
      if (!fid) continue;
      const f = await prisma.fileUpload.findUnique({ where: { id: fid } });
      if (!f || !f.mimeType.startsWith('image/')) throw new HttpError(400, 'Logo / tanda tangan harus berupa gambar');
    }
    const old = await prisma.companySettings.findUnique({ where: { id: 1 } });
    const saved = await prisma.companySettings.upsert({
      where: { id: 1 },
      create: { id: 1, ...data },
      update: data,
    });
    await audit(req, { aksi: 'UPDATE_SETTINGS', modul: 'SETTINGS', refId: 1, dataLama: old, dataBaru: saved });
    res.json(saved);
  }),
);

export default router;
