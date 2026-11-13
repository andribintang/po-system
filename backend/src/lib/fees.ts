import { Prisma } from '@prisma/client';

export interface FeeSet {
  feeVendorPerPcs: Prisma.Decimal;
  feeKabengPerPcs: Prisma.Decimal;
  feePerusahaanPerPcs: Prisma.Decimal;
}

/**
 * Tentukan tarif cashback produk untuk area cabang tertentu.
 * Pakai tarif khusus area bila ada, jika tidak pakai tarif default produk.
 */
export function resolveFee(
  product: FeeSet & { areaFees?: (FeeSet & { areaId: number })[] },
  areaId: number,
): FeeSet & { source: 'AREA' | 'DEFAULT' } {
  const af = product.areaFees?.find((f) => f.areaId === areaId);
  const s = af ?? product;
  return {
    feeVendorPerPcs: s.feeVendorPerPcs,
    feeKabengPerPcs: s.feeKabengPerPcs,
    feePerusahaanPerPcs: s.feePerusahaanPerPcs,
    source: af ? 'AREA' : 'DEFAULT',
  };
}

/** Hitung pembagian cashback untuk sejumlah pcs. Semua hitungan memakai Decimal, bukan float. */
export function splitCashback(fee: FeeSet, qtyPcs: number) {
  const q = new Prisma.Decimal(qtyPcs);
  return {
    totalVendor: fee.feeVendorPerPcs.mul(q),
    totalKabeng: fee.feeKabengPerPcs.mul(q),
    totalPerusahaan: fee.feePerusahaanPerPcs.mul(q),
  };
}
