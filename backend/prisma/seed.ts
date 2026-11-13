/**
 * Seed data awal.
 *   npm run db:seed            → Super Admin + area default + pengaturan perusahaan
 *   SEED_DEMO=true npm run db:seed → ditambah contoh cabang, vendor, produk, karyawan, user
 */
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const email = (process.env.SEED_ADMIN_EMAIL ?? 'admin@example.com').toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!password || password.length < 8) throw new Error('Isi SEED_ADMIN_PASSWORD (min 8 karakter) di .env');

  await prisma.user.upsert({
    where: { email },
    update: {},
    create: {
      nama: 'Super Admin',
      email,
      role: 'SUPER_ADMIN',
      passwordHash: await bcrypt.hash(password, 12),
    },
  });

  const jawa = await prisma.area.upsert({
    where: { kodeArea: 'JAWA' },
    update: {},
    create: { kodeArea: 'JAWA', namaArea: 'Jawa' },
  });
  const sks = await prisma.area.upsert({
    where: { kodeArea: 'SKS' },
    update: {},
    create: { kodeArea: 'SKS', namaArea: 'SKS' },
  });

  await prisma.companySettings.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1, namaPerusahaan: 'Nama Perusahaan Anda' },
  });

  if (process.env.SEED_DEMO !== 'true') return;

  const b1 = await prisma.branch.upsert({
    where: { kodeCabang: 'CBG-JKT' },
    update: {},
    create: { kodeCabang: 'CBG-JKT', namaCabang: 'Cabang Jakarta', kota: 'Jakarta', provinsi: 'DKI Jakarta', areaId: jawa.id },
  });
  const b2 = await prisma.branch.upsert({
    where: { kodeCabang: 'CBG-PLB' },
    update: {},
    create: { kodeCabang: 'CBG-PLB', namaCabang: 'Cabang Palembang', kota: 'Palembang', provinsi: 'Sumatera Selatan', areaId: sks.id },
  });
  const v = await prisma.vendor.upsert({
    where: { kodeVendor: 'VND-001' },
    update: {},
    create: { kodeVendor: 'VND-001', namaVendor: 'PT Contoh Chemical', pic: 'Budi', noHp: '0811111111' },
  });
  const existing = await prisma.product.findUnique({ where: { kodeProduk: 'CHM-001' } });
  if (!existing) {
    await prisma.product.create({
      data: {
        kodeProduk: 'CHM-001',
        namaProduk: 'Engine Flush 300ml',
        merek: 'Contoh',
        vendorId: v.id,
        isiPerDus: 24,
        hargaBeli: '25000',
        feeVendorPerPcs: '3000',
        feeKabengPerPcs: '2000',
        feePerusahaanPerPcs: '1000',
        areaFees: {
          create: [{ areaId: sks.id, feeVendorPerPcs: '3500', feeKabengPerPcs: '2500', feePerusahaanPerPcs: '1000' }],
        },
      },
    });
  }
  const kabengExisting = await prisma.employee.findFirst({ where: { nama: 'Andi Kabeng', branchId: b1.id } });
  const kabeng =
    kabengExisting ??
    (await prisma.employee.create({
      data: { nama: 'Andi Kabeng', branchId: b1.id, jabatan: 'KEPALA_BENGKEL', bank: 'BCA', nomorRekening: '1234567890', namaRekening: 'Andi' },
    }));
  const demoPass = await bcrypt.hash('Demo12345', 12);
  await prisma.user.upsert({
    where: { email: 'admin.jkt@example.com' },
    update: {},
    create: { nama: 'Admin Jakarta', email: 'admin.jkt@example.com', role: 'ADMIN', branchId: b1.id, passwordHash: demoPass },
  });
  await prisma.user.upsert({
    where: { email: 'kabeng.jkt@example.com' },
    update: {},
    create: {
      nama: 'Andi Kabeng',
      email: 'kabeng.jkt@example.com',
      role: 'KEPALA_BENGKEL',
      branchId: b1.id,
      employeeId: kabeng.id,
      passwordHash: demoPass,
    },
  });
  void b2;
}

main()
  .then(() => console.log('Seed selesai'))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
