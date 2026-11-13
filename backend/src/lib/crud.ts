import { Router, type Request } from 'express';
import type { ZodTypeAny, z } from 'zod';
import type { UserRole } from '@prisma/client';
import { prisma } from './prisma';
import { ah, notFound } from './errors';
import { audit } from './audit';
import { idParam, listQuery } from './http';
import { requireRole } from '../middleware/auth';

type ModelName = 'area' | 'branch' | 'vendor' | 'employee';

interface CrudOptions<S extends ZodTypeAny> {
  model: ModelName;
  label: string;
  schema: S;
  searchFields: string[];
  orderBy: Record<string, 'asc' | 'desc'>;
  include?: Record<string, unknown>;
  readRoles: UserRole[];
  /** Filter tambahan per user, misalnya batasan cabang. */
  scopeWhere?: (req: Request) => Record<string, unknown>;
  /** Filter tambahan dari query string. */
  extraFilters?: (query: Record<string, unknown>) => Record<string, unknown>;
  /** Validasi tambahan sebelum simpan (cek relasi, dsb). */
  beforeSave?: (data: z.infer<S>, id?: number) => Promise<void>;
  /** Cek sebelum hapus; lempar HttpError bila tidak boleh. */
  beforeDelete?: (id: number) => Promise<void>;
}

/**
 * Router CRUD standar untuk master data:
 * GET /, GET /:id (role baca), POST /, PUT /:id, DELETE /:id (SUPER_ADMIN, soft delete + audit).
 */
export function crudRouter<S extends ZodTypeAny>(o: CrudOptions<S>) {
  const router = Router();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const delegate = (prisma as any)[o.model];
  const modul = 'MASTER';

  router.get(
    '/',
    requireRole(...o.readRoles),
    ah(async (req, res) => {
      const q = listQuery.parse(req.query);
      const where = {
        deletedAt: null,
        ...(q.status ? { status: q.status } : {}),
        ...(q.q ? { OR: o.searchFields.map((f) => ({ [f]: { contains: q.q } })) } : {}),
        ...(o.extraFilters?.(req.query as Record<string, unknown>) ?? {}),
        ...(o.scopeWhere?.(req) ?? {}),
      };
      const [items, total] = await Promise.all([
        delegate.findMany({
          where,
          include: o.include,
          orderBy: o.orderBy,
          skip: (q.page - 1) * q.pageSize,
          take: q.pageSize,
        }),
        delegate.count({ where }),
      ]);
      res.json({ items, total, page: q.page, pageSize: q.pageSize });
    }),
  );

  router.get(
    '/:id',
    requireRole(...o.readRoles),
    ah(async (req, res) => {
      const item = await delegate.findFirst({
        where: { id: idParam(req), deletedAt: null, ...(o.scopeWhere?.(req) ?? {}) },
        include: o.include,
      });
      if (!item) throw notFound(o.label);
      res.json(item);
    }),
  );

  router.post(
    '/',
    requireRole('SUPER_ADMIN'),
    ah(async (req, res) => {
      const data = o.schema.parse(req.body);
      await o.beforeSave?.(data);
      const created = await delegate.create({ data, include: o.include });
      await audit(req, { aksi: `CREATE_${o.model.toUpperCase()}`, modul, refId: created.id, dataBaru: created });
      res.status(201).json(created);
    }),
  );

  router.put(
    '/:id',
    requireRole('SUPER_ADMIN'),
    ah(async (req, res) => {
      const id = idParam(req);
      const old = await delegate.findFirst({ where: { id, deletedAt: null } });
      if (!old) throw notFound(o.label);
      const data = o.schema.parse(req.body);
      await o.beforeSave?.(data, id);
      const updated = await delegate.update({ where: { id }, data, include: o.include });
      await audit(req, { aksi: `UPDATE_${o.model.toUpperCase()}`, modul, refId: id, dataLama: old, dataBaru: updated });
      res.json(updated);
    }),
  );

  router.delete(
    '/:id',
    requireRole('SUPER_ADMIN'),
    ah(async (req, res) => {
      const id = idParam(req);
      const old = await delegate.findFirst({ where: { id, deletedAt: null } });
      if (!old) throw notFound(o.label);
      await o.beforeDelete?.(id);
      await delegate.update({ where: { id }, data: { deletedAt: new Date(), status: 'INACTIVE' } });
      await audit(req, { aksi: `DELETE_${o.model.toUpperCase()}`, modul, refId: id, dataLama: old });
      res.json({ ok: true });
    }),
  );

  return router;
}
