import { Router, type Request } from 'express';
import { z } from 'zod';
import { Prisma, type PaymentStatus } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { ah, HttpError, notFound } from '../lib/errors';
import { audit } from '../lib/audit';
import { idParam, optStr } from '../lib/http';
import { branchScope, requireRole } from '../middleware/auth';
import { nextNumber } from '../lib/counter';
import { notify } from '../lib/notify';
import { CLAIMABLE_STATUSES, PO_STATUS_LABEL } from '../lib/poRules';

/**
 * Pembayaran cashback manual ke Kepala Bengkel (transfer bank manual / tunai).
 * - Distribusi UNPAID yang sedang ada di pembayaran PENDING dianggap "sedang diproses"
 *   dan tidak bisa dipilih lagi, supaya tidak terbayar dua kali.
 * - SUCCESS → distribusi menjadi PAID. FAILED → distribusi kembali bebas (tetap UNPAID).
 */
const router = Router();
const ALL = ['SUPER_ADMIN', 'KEPALA_BENGKEL'] as const;
const periode = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Periode harus YYYY-MM');

const METHOD_LABEL = { TRANSFER_MANUAL: 'Transfer Bank Manual', CASH: 'Tunai / Cash' } as const;
const STATUS_LABEL: Record<PaymentStatus, string> = { PENDING: 'Menunggu Konfirmasi', SUCCESS: 'Lunas', FAILED: 'Gagal' };

/** Kepala Bengkel hanya melihat cabangnya. */
function kbBranch(req: Request): number | null {
  return req.user!.role === 'KEPALA_BENGKEL' ? branchScope(req.user!) : null;
}

async function kabengOfBranches(branchIds: number[]) {
  const emps = await prisma.employee.findMany({
    where: { branchId: { in: branchIds }, jabatan: 'KEPALA_BENGKEL', status: 'ACTIVE', deletedAt: null },
    orderBy: { id: 'asc' },
  });
  const m = new Map<number, typeof emps>();
  for (const e of emps) m.set(e.branchId, [...(m.get(e.branchId) ?? []), e]);
  return m;
}

// ───────────── Antrean outstanding ─────────────

router.get(
  '/outstanding',
  requireRole(...ALL),
  ah(async (req, res) => {
    const q = z.object({ periode: periode.optional(), branchId: z.coerce.number().int().positive().optional() }).parse(req.query);
    const dists = await prisma.cashbackDistribution.findMany({
      where: {
        status: 'UNPAID',
        receipt: { deletedAt: null },
        periode: q.periode,
        branchId: kbBranch(req) ?? q.branchId,
      },
      include: {
        branch: { select: { id: true, kodeCabang: true, namaCabang: true } },
        product: { select: { kodeProduk: true, namaProduk: true } },
        po: { select: { id: true, poNumber: true } },
        receipt: { select: { id: true, receiptNo: true } },
        paymentItems: {
          where: { paymentDetail: { status: 'PENDING' } },
          select: { paymentDetail: { select: { payment: { select: { id: true, paymentNo: true } } } } },
        },
      },
      orderBy: [{ periode: 'asc' }, { branchId: 'asc' }, { id: 'asc' }],
    });
    const kab = await kabengOfBranches([...new Set(dists.map((d) => d.branchId))]);

    // Kelompok per (periode, cabang).
    const groups = new Map<
      string,
      {
        periode: string;
        branch: (typeof dists)[number]['branch'];
        recipients: unknown[];
        warning: string | null;
        total: Prisma.Decimal;
        reservedTotal: Prisma.Decimal;
        poNumbers: Set<string>;
        items: unknown[];
      }
    >();
    for (const d of dists) {
      const k = `${d.periode}|${d.branchId}`;
      let g = groups.get(k);
      if (!g) {
        const rec = kab.get(d.branchId) ?? [];
        const warning = !rec.length
          ? 'Cabang ini belum punya Kepala Bengkel aktif di data karyawan'
          : rec.length > 1
            ? 'Ada lebih dari satu Kepala Bengkel aktif; pilih penerima saat membayar'
            : !rec[0].nomorRekening
              ? 'Rekening Kepala Bengkel belum diisi (hanya bisa dibayar tunai)'
              : null;
        g = {
          periode: d.periode,
          branch: d.branch,
          warning,
          total: new Prisma.Decimal(0),
          reservedTotal: new Prisma.Decimal(0),
          poNumbers: new Set(),
          items: [],
          recipients: rec.map((e) => ({ id: e.id, nama: e.nama, bank: e.bank, nomorRekening: e.nomorRekening, namaRekening: e.namaRekening })),
        };
        groups.set(k, g);
      }
      const pending = d.paymentItems[0]?.paymentDetail.payment ?? null;
      if (pending) g.reservedTotal = g.reservedTotal.add(d.totalFeeKabeng);
      else g.total = g.total.add(d.totalFeeKabeng);
      if (d.po) g.poNumbers.add(d.po.poNumber);
      g.items.push({
        id: d.id,
        po: d.po,
        receipt: d.receipt,
        product: d.product,
        qtyPcs: d.qtyPcs,
        feeKabengPerPcs: d.feeKabengPerPcs,
        totalFeeKabeng: d.totalFeeKabeng,
        pendingPayment: pending,
      });
    }
    res.json({ groups: [...groups.values()].map((g) => ({ ...g, poNumbers: [...g.poNumbers] })) });
  }),
);

// ───────────── Diagnostik kelayakan PO ─────────────

router.get(
  '/eligibility',
  requireRole(...ALL),
  ah(async (req, res) => {
    const { poNumber } = z.object({ poNumber: z.string().trim().min(3) }).parse(req.query);
    const po = await prisma.purchaseOrder.findFirst({
      where: { poNumber, deletedAt: null },
      include: {
        details: { select: { branchId: true, branch: { select: { id: true, namaCabang: true } } } },
        receiptPOs: { include: { receipt: { select: { receiptNo: true, deletedAt: true } } } },
        distributions: {
          where: { receipt: { deletedAt: null } },
          include: { paymentItems: { include: { paymentDetail: { include: { payment: { select: { paymentNo: true, status: true } } } } } } },
        },
      },
    });
    const kb = kbBranch(req);
    if (!po || (kb !== null && !po.details.some((d) => d.branchId === kb))) throw notFound('PO');

    const branches = new Map(po.details.map((d) => [d.branchId, d.branch]));
    if (kb !== null) for (const id of [...branches.keys()]) if (id !== kb) branches.delete(id);
    const kab = await kabengOfBranches([...branches.keys()]);

    const result = [...branches.values()].map((b) => {
      const reasons: string[] = [];
      let ok = false;
      const claimed = po.receiptPOs.find((r) => r.branchId === b.id && !r.receipt.deletedAt);
      const dists = po.distributions.filter((d) => d.branchId === b.id);
      if (!CLAIMABLE_STATUSES.includes(po.status)) {
        reasons.push(`Status PO masih ${PO_STATUS_LABEL[po.status]}; harus minimal Approved lalu diklaim cashback-nya`);
      } else if (!claimed) {
        reasons.push('Klaim cashback vendor untuk PO ini di cabang ini belum diinput');
      } else if (dists.length && dists.every((d) => d.status === 'PAID')) {
        reasons.push(`Sudah dibayar lunas (klaim ${claimed.receipt.receiptNo})`);
      } else {
        const pending = dists
          .flatMap((d) => d.paymentItems.map((i) => i.paymentDetail.payment))
          .find((p) => p.status === 'PENDING');
        if (pending) reasons.push(`Sedang dalam pembayaran ${pending.paymentNo} (menunggu konfirmasi)`);
        else {
          ok = true;
          reasons.push(`Siap dibayar (klaim ${claimed.receipt.receiptNo})`);
        }
      }
      const rec = kab.get(b.id) ?? [];
      if (!rec.length) {
        ok = false;
        reasons.push('Cabang belum punya Kepala Bengkel aktif di data karyawan');
      } else if (!rec[0].nomorRekening) reasons.push('Rekening Kepala Bengkel belum diisi (transfer tidak bisa, tunai bisa)');
      const unpaid = dists.filter((d) => d.status === 'UNPAID').reduce((a, d) => a.add(d.totalFeeKabeng), new Prisma.Decimal(0));
      return { branch: b, ok, reasons, unpaidKabeng: unpaid };
    });
    res.json({ po: { id: po.id, poNumber: po.poNumber, status: po.status, statusLabel: PO_STATUS_LABEL[po.status] }, branches: result });
  }),
);

// ───────────── Daftar & detail pembayaran ─────────────

const detailInclude = {
  createdBy: { select: { nama: true } },
  confirmedBy: { select: { nama: true } },
  buktiFile: { select: { id: true, originalName: true, mimeType: true } },
  details: {
    include: {
      employee: { select: { id: true, nama: true } },
      branch: { select: { id: true, kodeCabang: true, namaCabang: true } },
      items: {
        include: {
          distribution: {
            include: {
              product: { select: { kodeProduk: true, namaProduk: true } },
              po: { select: { poNumber: true } },
            },
          },
        },
      },
    },
  },
} satisfies Prisma.CashbackPaymentInclude;

router.get(
  '/',
  requireRole(...ALL),
  ah(async (req, res) => {
    const q = z
      .object({
        periode: periode.optional(),
        status: z.enum(['PENDING', 'SUCCESS', 'FAILED']).optional(),
        page: z.coerce.number().int().min(1).default(1),
        pageSize: z.coerce.number().int().min(1).max(200).default(20),
      })
      .parse(req.query);
    const kb = kbBranch(req);
    const where: Prisma.CashbackPaymentWhereInput = {
      periode: q.periode,
      status: q.status,
      ...(kb !== null ? { details: { some: { branchId: kb } } } : {}),
    };
    const [items, total] = await Promise.all([
      prisma.cashbackPayment.findMany({
        where,
        include: {
          createdBy: { select: { nama: true } },
          details: {
            where: kb !== null ? { branchId: kb } : {},
            select: { nominal: true, employee: { select: { nama: true } }, branch: { select: { namaCabang: true } } },
          },
        },
        orderBy: [{ tanggalBayar: 'desc' }, { id: 'desc' }],
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      prisma.cashbackPayment.count({ where }),
    ]);
    res.json({ items, total, page: q.page, pageSize: q.pageSize });
  }),
);

async function loadPayment(req: Request, id: number) {
  const kb = kbBranch(req);
  const p = await prisma.cashbackPayment.findFirst({
    where: { id, ...(kb !== null ? { details: { some: { branchId: kb } } } : {}) },
    include: detailInclude,
  });
  if (!p) throw notFound('Pembayaran');
  // Kepala Bengkel hanya melihat rincian untuk cabangnya.
  if (kb !== null) p.details = p.details.filter((d) => d.branchId === kb);
  return p;
}

router.get(
  '/:id',
  requireRole(...ALL),
  ah(async (req, res) => {
    const p = await loadPayment(req, idParam(req));
    res.json({ ...p, canConfirm: req.user!.role === 'SUPER_ADMIN' && p.status === 'PENDING' });
  }),
);

/** Slip pembayaran teks sederhana untuk diunduh / dicetak. */
router.get(
  '/:id/slip.txt',
  requireRole(...ALL),
  ah(async (req, res) => {
    const p = await loadPayment(req, idParam(req));
    const co = await prisma.companySettings.findUnique({ where: { id: 1 } });
    const rp = (v: Prisma.Decimal | string | number) => `Rp ${Number(v).toLocaleString('id-ID', { maximumFractionDigits: 2 })}`;
    const line = '='.repeat(64);
    const out = [
      line,
      (co?.namaPerusahaan ?? '').toUpperCase(),
      'SLIP PEMBAYARAN CASHBACK KEPALA BENGKEL',
      line,
      `No. Pembayaran : ${p.paymentNo}`,
      `Periode        : ${p.periode}`,
      `Tanggal Bayar  : ${p.tanggalBayar.toISOString().slice(0, 10)}`,
      `Metode         : ${METHOD_LABEL[p.metode]}`,
      `Status         : ${STATUS_LABEL[p.status]}`,
      `Dibuat oleh    : ${p.createdBy.nama}`,
      ...(p.confirmedBy ? [`Dikonfirmasi   : ${p.confirmedBy.nama} (${p.confirmedAt?.toISOString().slice(0, 10)})`] : []),
      ...(p.catatan ? [`Catatan        : ${p.catatan}`] : []),
      '',
    ];
    for (const d of p.details) {
      out.push('-'.repeat(64));
      out.push(`Penerima       : ${d.employee.nama}`);
      out.push(`Cabang         : ${d.branch.kodeCabang} - ${d.branch.namaCabang}`);
      if (p.metode === 'TRANSFER_MANUAL') out.push(`Rekening       : ${d.bank ?? '-'} ${d.rekening ?? '-'} a.n. ${d.namaRekening ?? '-'}`);
      if (d.referensiPembayaran) out.push(`Referensi      : ${d.referensiPembayaran}`);
      out.push('Rincian:');
      for (const it of d.items) {
        const dist = it.distribution;
        out.push(`  ${(dist.po?.poNumber ?? 'Manual').padEnd(24)} ${dist.product.kodeProduk.padEnd(10)} ${String(dist.qtyPcs).padStart(6)} pcs  ${rp(it.nominal)}`);
      }
      out.push(`Nominal        : ${rp(d.nominal)}`);
    }
    out.push(line, `TOTAL          : ${rp(p.details.reduce((a, d) => a + Number(d.nominal), 0))}`, line);
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="slip-${p.paymentNo.replace(/\//g, '-')}.txt"`);
    res.send(out.join('\n'));
  }),
);

// ───────────── Proses bayar (Super Admin) ─────────────

const paySchema = z.object({
  periode,
  tanggalBayar: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format tanggal YYYY-MM-DD'),
  metode: z.enum(['TRANSFER_MANUAL', 'CASH']),
  status: z.enum(['PENDING', 'SUCCESS']),
  referensi: optStr(120),
  catatan: optStr(2000),
  buktiFileId: z.coerce.number().int().positive().nullable().optional(),
  distributionIds: z.array(z.coerce.number().int().positive()).min(1, 'Pilih minimal satu item').max(5000),
  /** Penerima per cabang bila cabang punya lebih dari satu Kepala Bengkel aktif. */
  recipients: z.record(z.string(), z.coerce.number().int().positive()).default({}),
});

router.post(
  '/',
  requireRole('SUPER_ADMIN'),
  ah(async (req, res) => {
    const d = paySchema.parse(req.body);
    const ids = [...new Set(d.distributionIds)];
    const user = req.user!;

    const payment = await prisma.$transaction(
      async (tx) => {
        // Kunci baris distribusi agar dua pembayaran bersamaan tidak memakai item yang sama.
        await tx.$queryRaw`SELECT id FROM cashback_distributions WHERE id IN (${Prisma.join(ids)}) FOR UPDATE`;
        const dists = await tx.cashbackDistribution.findMany({
          where: { id: { in: ids }, receipt: { deletedAt: null } },
          include: { paymentItems: { where: { paymentDetail: { status: 'PENDING' } }, select: { id: true } } },
        });
        if (dists.length !== ids.length) throw new HttpError(400, 'Ada item distribusi yang tidak ditemukan');
        for (const x of dists) {
          if (x.status !== 'UNPAID') throw new HttpError(409, `Item #${x.id} sudah dibayar`);
          if (x.paymentItems.length) throw new HttpError(409, `Item #${x.id} sedang dalam pembayaran lain yang menunggu konfirmasi`);
          if (x.periode !== d.periode) throw new HttpError(400, `Item #${x.id} bukan periode ${d.periode}`);
        }

        // Kelompokkan per cabang → satu baris rincian per Kepala Bengkel.
        const byBranch = new Map<number, typeof dists>();
        for (const x of dists) byBranch.set(x.branchId, [...(byBranch.get(x.branchId) ?? []), x]);
        const emps = await tx.employee.findMany({
          where: { branchId: { in: [...byBranch.keys()] }, jabatan: 'KEPALA_BENGKEL', status: 'ACTIVE', deletedAt: null },
          include: { branch: { select: { namaCabang: true } } },
        });

        const detailsData = [...byBranch.entries()].map(([branchId, list]) => {
          const cands = emps.filter((e) => e.branchId === branchId);
          const chosenId = d.recipients[String(branchId)];
          const emp = chosenId ? cands.find((e) => e.id === chosenId) : cands.length === 1 ? cands[0] : undefined;
          if (!emp) {
            throw new HttpError(
              400,
              cands.length
                ? `Cabang #${branchId} punya ${cands.length} Kepala Bengkel aktif; pilih penerimanya`
                : `Cabang #${branchId} belum punya Kepala Bengkel aktif di data karyawan`,
            );
          }
          if (d.metode === 'TRANSFER_MANUAL' && !emp.nomorRekening) {
            throw new HttpError(400, `Rekening ${emp.nama} (${emp.branch.namaCabang}) belum diisi. Lengkapi data karyawan atau bayar tunai.`);
          }
          const nominal = list.reduce((a, x) => a.add(x.totalFeeKabeng), new Prisma.Decimal(0));
          return { branchId, emp, list, nominal };
        });
        const total = detailsData.reduce((a, x) => a.add(x.nominal), new Prisma.Decimal(0));

        if (d.buktiFileId && !(await tx.fileUpload.findUnique({ where: { id: d.buktiFileId } }))) {
          throw new HttpError(400, 'File bukti tidak ditemukan');
        }

        const ym = d.periode.replace('-', '');
        const seq = await nextNumber(tx, `PAY-CB/${ym}`);
        const paymentNo = `PAY-CB/${ym}/${String(seq).padStart(2, '0')}`;
        const success = d.status === 'SUCCESS';

        const p = await tx.cashbackPayment.create({
          data: {
            paymentNo,
            periode: d.periode,
            tanggalBayar: new Date(`${d.tanggalBayar}T00:00:00Z`),
            metode: d.metode,
            totalBayar: total,
            status: d.status,
            catatan: d.catatan,
            buktiFileId: d.buktiFileId ?? null,
            createdById: user.id,
            ...(success ? { confirmedById: user.id, confirmedAt: new Date() } : {}),
            details: {
              create: detailsData.map((x) => ({
                employeeId: x.emp.id,
                branchId: x.branchId,
                bank: x.emp.bank,
                rekening: x.emp.nomorRekening,
                namaRekening: x.emp.namaRekening,
                nominal: x.nominal,
                status: d.status,
                referensiPembayaran: d.referensi,
                buktiFileId: d.buktiFileId ?? null,
                items: { create: x.list.map((it) => ({ distributionId: it.id, nominal: it.totalFeeKabeng })) },
              })),
            },
          },
        });
        if (success) {
          await tx.cashbackDistribution.updateMany({ where: { id: { in: ids } }, data: { status: 'PAID' } });
          for (const x of detailsData) {
            await notify(tx, {
              type: 'CASHBACK_PAID',
              title: `Cashback dibayar ${paymentNo}`,
              message: `Cashback periode ${d.periode} untuk ${x.emp.nama} sebesar Rp ${x.nominal.toFixed(0)} sudah dibayar (${METHOD_LABEL[d.metode]})`,
              refType: 'PAYMENT',
              refId: p.id,
              branchId: x.branchId,
            });
          }
        }
        await audit(req, { aksi: `CREATE_PAYMENT_${d.status}`, modul: 'PAYOUT', refId: paymentNo, dataBaru: { ...p, distributionIds: ids } }, tx);
        return p;
      },
      { timeout: 30_000 },
    );
    res.status(201).json(payment);
  }),
);

/** Konfirmasi pembayaran PENDING: SUCCESS (lunas) atau FAILED (gagal, item kembali ke antrean). */
router.post(
  '/:id/confirm',
  requireRole('SUPER_ADMIN'),
  ah(async (req, res) => {
    const id = idParam(req);
    const { status, catatan } = z.object({ status: z.enum(['SUCCESS', 'FAILED']), catatan: optStr(500) }).parse(req.body);
    const updated = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM cashback_payments WHERE id = ${id} FOR UPDATE`;
      const p = await tx.cashbackPayment.findUnique({ where: { id }, include: { details: { include: { items: true, employee: true } } } });
      if (!p) throw notFound('Pembayaran');
      if (p.status !== 'PENDING') throw new HttpError(400, `Pembayaran sudah berstatus ${STATUS_LABEL[p.status]}`);
      const distIds = p.details.flatMap((x) => x.items.map((i) => i.distributionId));
      if (status === 'SUCCESS') {
        const already = await tx.cashbackDistribution.count({ where: { id: { in: distIds }, status: { not: 'UNPAID' } } });
        if (already) throw new HttpError(409, 'Sebagian item sudah dibayar lewat pembayaran lain');
        await tx.cashbackDistribution.updateMany({ where: { id: { in: distIds } }, data: { status: 'PAID' } });
      }
      await tx.paymentDetail.updateMany({ where: { paymentId: id }, data: { status } });
      const np = await tx.cashbackPayment.update({
        where: { id },
        data: {
          status,
          confirmedById: req.user!.id,
          confirmedAt: new Date(),
          ...(catatan ? { catatan: [p.catatan, `[${STATUS_LABEL[status]}] ${catatan}`].filter(Boolean).join('\n') } : {}),
        },
      });
      if (status === 'SUCCESS') {
        for (const x of p.details) {
          await notify(tx, {
            type: 'CASHBACK_PAID',
            title: `Cashback dibayar ${p.paymentNo}`,
            message: `Pembayaran cashback periode ${p.periode} untuk ${x.employee.nama} sebesar Rp ${x.nominal.toFixed(0)} sudah dikonfirmasi lunas`,
            refType: 'PAYMENT',
            refId: p.id,
            branchId: x.branchId,
          });
        }
      }
      await audit(req, { aksi: `PAYMENT_${status}`, modul: 'PAYOUT', refId: p.paymentNo, dataLama: { status: p.status }, dataBaru: { status, catatan } }, tx);
      return np;
    });
    res.json(updated);
  }),
);

export default router;
