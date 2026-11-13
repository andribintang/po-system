import { Router } from 'express';
import ExcelJS from 'exceljs';
import type { ZodTypeAny } from 'zod';
import { prisma } from '../lib/prisma';
import { ah, HttpError } from '../lib/errors';
import { audit } from '../lib/audit';
import { requireRole } from '../middleware/auth';
import { addSheet, excelUpload, ImportError, readRows, sendWorkbook } from '../lib/excel';
import { branchSchema, employeeSchema, vendorSchema } from './master';
import { productSchema } from './products';

/**
 * Ekspor / template / impor Excel untuk master data.
 * Impor bersifat "upsert": kode yang sudah ada diperbarui, kode baru ditambahkan.
 * Bila ada satu baris salah, seluruh impor dibatalkan.
 */
const router = Router();
router.use(requireRole('SUPER_ADMIN'));

type Lookups = {
  area: Map<string, number>;
  vendor: Map<string, number>;
  branch: Map<string, number>;
};

interface EntityDef {
  label: string;
  headers: string[];
  required: string[];
  sample: (string | number)[];
  notes: [string, string][];
  exportRows: () => Promise<(string | number | null)[][]>;
  /** Ubah baris Excel menjadi objek input (sebelum validasi zod). */
  toInput: (v: Record<string, string>, lk: Lookups) => Record<string, unknown>;
  schema: ZodTypeAny;
  /** Kunci unik baris, untuk mendeteksi duplikat di dalam file. */
  key: (d: Record<string, unknown>) => string;
  save: (tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0], data: Record<string, unknown>) => Promise<'created' | 'updated'>;
  extraSheets?: (wb: ExcelJS.Workbook) => Promise<void>;
}

const statusOf = (s: string | undefined) => ((s ?? '').toUpperCase() === 'INACTIVE' || (s ?? '').toUpperCase() === 'NONAKTIF' ? 'INACTIVE' : 'ACTIVE');
const ref = (map: Map<string, number>, code: string | undefined) => (code ? map.get(code.toUpperCase()) ?? -1 : undefined);

const ENTITIES: Record<string, EntityDef> = {
  vendor: {
    label: 'Vendor',
    headers: ['KODE_VENDOR', 'NAMA_VENDOR', 'PIC', 'NO_HP', 'EMAIL', 'ALAMAT', 'STATUS'],
    required: ['KODE_VENDOR', 'NAMA_VENDOR'],
    sample: ['VND-002', 'PT Contoh Vendor', 'Sari', '0812000000', 'sales@contoh.co.id', 'Jakarta', 'ACTIVE'],
    notes: [['KODE_VENDOR', 'Kunci unik. Kode yang sudah ada akan diperbarui.']],
    exportRows: async () =>
      (await prisma.vendor.findMany({ where: { deletedAt: null }, orderBy: { kodeVendor: 'asc' } })).map((v) => [
        v.kodeVendor, v.namaVendor, v.pic, v.noHp, v.email, v.alamat, v.status,
      ]),
    toInput: (v) => ({
      kodeVendor: v.KODE_VENDOR, namaVendor: v.NAMA_VENDOR, pic: v.PIC, noHp: v.NO_HP, email: v.EMAIL, alamat: v.ALAMAT, status: statusOf(v.STATUS),
    }),
    schema: vendorSchema,
    key: (d) => String(d.kodeVendor),
    save: async (tx, d) => {
      const ex = await tx.vendor.findUnique({ where: { kodeVendor: d.kodeVendor as string } });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await tx.vendor.upsert({ where: { kodeVendor: d.kodeVendor as string }, create: d as any, update: { ...d, deletedAt: null } });
      return ex ? 'updated' : 'created';
    },
  },
  cabang: {
    label: 'Cabang',
    headers: ['KODE_CABANG', 'NAMA_CABANG', 'KODE_AREA', 'KOTA', 'PROVINSI', 'NPWP', 'ALAMAT', 'STATUS'],
    required: ['KODE_CABANG', 'NAMA_CABANG', 'KODE_AREA'],
    sample: ['CBG-BDG', 'Cabang Bandung', 'JAWA', 'Bandung', 'Jawa Barat', '', '', 'ACTIVE'],
    notes: [['KODE_AREA', 'Harus sesuai kode di menu Area Tarif.']],
    exportRows: async () =>
      (await prisma.branch.findMany({ where: { deletedAt: null }, include: { area: true }, orderBy: { kodeCabang: 'asc' } })).map((b) => [
        b.kodeCabang, b.namaCabang, b.area.kodeArea, b.kota, b.provinsi, b.npwp, b.alamat, b.status,
      ]),
    toInput: (v, lk) => ({
      kodeCabang: v.KODE_CABANG, namaCabang: v.NAMA_CABANG, areaId: ref(lk.area, v.KODE_AREA), kota: v.KOTA, provinsi: v.PROVINSI,
      npwp: v.NPWP, alamat: v.ALAMAT, status: statusOf(v.STATUS),
    }),
    schema: branchSchema,
    key: (d) => String(d.kodeCabang),
    save: async (tx, d) => {
      const ex = await tx.branch.findUnique({ where: { kodeCabang: d.kodeCabang as string } });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await tx.branch.upsert({ where: { kodeCabang: d.kodeCabang as string }, create: d as any, update: { ...d, deletedAt: null } });
      return ex ? 'updated' : 'created';
    },
  },
  produk: {
    label: 'Produk',
    headers: ['KODE_PRODUK', 'NAMA_PRODUK', 'MEREK', 'KODE_VENDOR', 'UNIT', 'ISI_PER_DUS', 'HARGA_BELI', 'FEE_VENDOR', 'FEE_KABENG', 'FEE_PERUSAHAAN', 'STATUS'],
    required: ['KODE_PRODUK', 'NAMA_PRODUK', 'KODE_VENDOR', 'ISI_PER_DUS', 'HARGA_BELI', 'FEE_VENDOR', 'FEE_KABENG', 'FEE_PERUSAHAAN'],
    sample: ['CHM-010', 'Brake Cleaner 500ml', 'Contoh', 'VND-001', 'PCS', 24, 32000, 3000, 2000, 1000, 'ACTIVE'],
    notes: [
      ['FEE_*', 'Tarif default per pcs. Tarif khusus per area diatur lewat aplikasi (sheet "Tarif Area" di file ekspor hanya untuk referensi).'],
      ['ISI_PER_DUS', 'Jumlah pcs per dus, misalnya 24 atau 36.'],
    ],
    exportRows: async () =>
      (await prisma.product.findMany({ where: { deletedAt: null }, include: { vendor: true }, orderBy: { kodeProduk: 'asc' } })).map((p) => [
        p.kodeProduk, p.namaProduk, p.merek, p.vendor.kodeVendor, p.unit, p.isiPerDus, Number(p.hargaBeli),
        Number(p.feeVendorPerPcs), Number(p.feeKabengPerPcs), Number(p.feePerusahaanPerPcs), p.status,
      ]),
    extraSheets: async (wb) => {
      const fees = await prisma.productAreaFee.findMany({ where: { product: { deletedAt: null } }, include: { product: true, area: true } });
      addSheet(wb, 'Tarif Area', ['KODE_PRODUK', 'KODE_AREA', 'FEE_VENDOR', 'FEE_KABENG', 'FEE_PERUSAHAAN'],
        fees.map((f) => [f.product.kodeProduk, f.area.kodeArea, Number(f.feeVendorPerPcs), Number(f.feeKabengPerPcs), Number(f.feePerusahaanPerPcs)]));
    },
    toInput: (v, lk) => ({
      kodeProduk: v.KODE_PRODUK, namaProduk: v.NAMA_PRODUK, merek: v.MEREK, vendorId: ref(lk.vendor, v.KODE_VENDOR), unit: v.UNIT || 'PCS',
      isiPerDus: v.ISI_PER_DUS, hargaBeli: v.HARGA_BELI, feeVendorPerPcs: v.FEE_VENDOR, feeKabengPerPcs: v.FEE_KABENG,
      feePerusahaanPerPcs: v.FEE_PERUSAHAAN, status: statusOf(v.STATUS),
    }),
    schema: productSchema,
    key: (d) => String(d.kodeProduk),
    save: async (tx, d) => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { areaFees, ...data } = d;
      const ex = await tx.product.findUnique({ where: { kodeProduk: data.kodeProduk as string } });
      // Tarif per area yang sudah ada tidak diubah oleh impor.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await tx.product.upsert({ where: { kodeProduk: data.kodeProduk as string }, create: data as any, update: { ...data, deletedAt: null } });
      return ex ? 'updated' : 'created';
    },
  },
  karyawan: {
    label: 'Karyawan',
    headers: ['NAMA', 'KODE_CABANG', 'JABATAN', 'NO_HP', 'BANK', 'NOMOR_REKENING', 'NAMA_REKENING', 'STATUS'],
    required: ['NAMA', 'KODE_CABANG', 'JABATAN'],
    sample: ['Budi Santoso', 'CBG-JKT', 'KEPALA_BENGKEL', '0813000000', 'BCA', '1234567890', 'Budi Santoso', 'ACTIVE'],
    notes: [
      ['JABATAN', 'KEPALA_BENGKEL, SERVICE_ADVISOR, atau LAINNYA.'],
      ['NAMA + KODE_CABANG', 'Dipakai sebagai kunci: bila sudah ada karyawan dengan nama sama di cabang itu, datanya diperbarui.'],
    ],
    exportRows: async () =>
      (await prisma.employee.findMany({ where: { deletedAt: null }, include: { branch: true }, orderBy: [{ branchId: 'asc' }, { nama: 'asc' }] })).map((e) => [
        e.nama, e.branch.kodeCabang, e.jabatan, e.noHp, e.bank, e.nomorRekening, e.namaRekening, e.status,
      ]),
    toInput: (v, lk) => ({
      nama: v.NAMA, branchId: ref(lk.branch, v.KODE_CABANG), jabatan: (v.JABATAN ?? '').toUpperCase().replace(/\s+/g, '_'), noHp: v.NO_HP,
      bank: v.BANK, nomorRekening: v.NOMOR_REKENING, namaRekening: v.NAMA_REKENING, status: statusOf(v.STATUS),
    }),
    schema: employeeSchema,
    key: (d) => `${String(d.nama).toLowerCase()}|${d.branchId}`,
    save: async (tx, d) => {
      const ex = await tx.employee.findFirst({ where: { nama: d.nama as string, branchId: d.branchId as number, deletedAt: null } });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (ex) await tx.employee.update({ where: { id: ex.id }, data: d as any });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      else await tx.employee.create({ data: d as any });
      return ex ? 'updated' : 'created';
    },
  },
};

function entity(name: string): EntityDef {
  const e = ENTITIES[name];
  if (!e) throw new HttpError(404, 'Jenis master data tidak dikenal');
  return e;
}

router.get(
  '/:entity/export.xlsx',
  ah(async (req, res) => {
    const e = entity(req.params.entity);
    const wb = new ExcelJS.Workbook();
    addSheet(wb, e.label, e.headers, await e.exportRows());
    await e.extraSheets?.(wb);
    await sendWorkbook(res, wb, `master-${req.params.entity}-${new Date().toISOString().slice(0, 10)}.xlsx`);
  }),
);

router.get(
  '/:entity/template.xlsx',
  ah(async (req, res) => {
    const e = entity(req.params.entity);
    const wb = new ExcelJS.Workbook();
    addSheet(wb, e.label, e.headers, [e.sample]);
    addSheet(wb, 'Petunjuk', ['KOLOM', 'KETERANGAN'], [
      ['Wajib diisi', e.required.join(', ')],
      ['STATUS', 'ACTIVE atau INACTIVE (kosong = ACTIVE).'],
      ...e.notes,
      ['', 'Bila ada satu baris salah, seluruh impor dibatalkan dan daftar kesalahan ditampilkan.'],
    ]);
    await sendWorkbook(res, wb, `template-${req.params.entity}.xlsx`);
  }),
);

router.post(
  '/:entity/import',
  excelUpload,
  ah(async (req, res) => {
    const e = entity(req.params.entity);
    const rows = await readRows(req.file!.buffer);
    if (!rows.length) throw new HttpError(400, 'Tidak ada baris data di file');
    const missing = e.required.filter((h) => !(h in rows[0].values));
    if (missing.length) throw new HttpError(400, `Kolom wajib tidak ditemukan: ${missing.join(', ')}`);

    const [areas, vendors, branches] = await Promise.all([
      prisma.area.findMany({ where: { deletedAt: null } }),
      prisma.vendor.findMany({ where: { deletedAt: null } }),
      prisma.branch.findMany({ where: { deletedAt: null } }),
    ]);
    const lk: Lookups = {
      area: new Map(areas.map((a) => [a.kodeArea, a.id])),
      vendor: new Map(vendors.map((v) => [v.kodeVendor, v.id])),
      branch: new Map(branches.map((b) => [b.kodeCabang, b.id])),
    };

    const errors: { row: number; message: string }[] = [];
    const valid: Record<string, unknown>[] = [];
    const keys = new Set<string>();
    for (const r of rows) {
      const input = e.toInput(r.values, lk);
      for (const [k, v] of Object.entries(input)) {
        if (v === -1) errors.push({ row: r.rowNumber, message: `${k.replace(/Id$/, '')}: kode tidak ditemukan` });
      }
      const parsed = e.schema.safeParse(input);
      if (!parsed.success) {
        errors.push({ row: r.rowNumber, message: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') });
        continue;
      }
      const key = e.key(parsed.data as Record<string, unknown>);
      if (keys.has(key)) errors.push({ row: r.rowNumber, message: 'Baris duplikat di dalam file' });
      keys.add(key);
      valid.push(parsed.data as Record<string, unknown>);
    }
    if (errors.length) throw new ImportError(errors);

    const result = await prisma.$transaction(
      async (tx) => {
        let created = 0;
        let updated = 0;
        for (const d of valid) ((await e.save(tx, d)) === 'created' ? created++ : updated++);
        return { created, updated };
      },
      { timeout: 60_000 },
    );
    await audit(req, { aksi: `IMPORT_${req.params.entity.toUpperCase()}`, modul: 'MASTER', dataBaru: { file: req.file!.originalname, ...result } });
    res.json(result);
  }),
);

export default router;
