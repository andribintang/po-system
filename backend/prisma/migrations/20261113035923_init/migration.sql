-- CreateTable
CREATE TABLE `users` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `nama` VARCHAR(120) NOT NULL,
    `email` VARCHAR(160) NOT NULL,
    `password_hash` VARCHAR(100) NOT NULL,
    `no_hp` VARCHAR(30) NULL,
    `role` ENUM('SUPER_ADMIN', 'ADMIN', 'KEPALA_BENGKEL') NOT NULL,
    `branch_id` INTEGER NULL,
    `employee_id` INTEGER NULL,
    `status` ENUM('ACTIVE', 'INACTIVE') NOT NULL DEFAULT 'ACTIVE',
    `last_login_at` DATETIME(3) NULL,
    `token_version` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    UNIQUE INDEX `users_email_key`(`email`),
    UNIQUE INDEX `users_employee_id_key`(`employee_id`),
    INDEX `users_role_idx`(`role`),
    INDEX `users_branch_id_idx`(`branch_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `areas` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `kode_area` VARCHAR(30) NOT NULL,
    `nama_area` VARCHAR(100) NOT NULL,
    `status` ENUM('ACTIVE', 'INACTIVE') NOT NULL DEFAULT 'ACTIVE',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    UNIQUE INDEX `areas_kode_area_key`(`kode_area`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `branches` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `kode_cabang` VARCHAR(30) NOT NULL,
    `nama_cabang` VARCHAR(120) NOT NULL,
    `alamat` TEXT NULL,
    `kota` VARCHAR(80) NULL,
    `provinsi` VARCHAR(80) NULL,
    `npwp` VARCHAR(40) NULL,
    `area_id` INTEGER NOT NULL,
    `status` ENUM('ACTIVE', 'INACTIVE') NOT NULL DEFAULT 'ACTIVE',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    UNIQUE INDEX `branches_kode_cabang_key`(`kode_cabang`),
    INDEX `branches_area_id_idx`(`area_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `vendors` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `kode_vendor` VARCHAR(30) NOT NULL,
    `nama_vendor` VARCHAR(150) NOT NULL,
    `alamat` TEXT NULL,
    `pic` VARCHAR(100) NULL,
    `no_hp` VARCHAR(30) NULL,
    `email` VARCHAR(160) NULL,
    `status` ENUM('ACTIVE', 'INACTIVE') NOT NULL DEFAULT 'ACTIVE',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    UNIQUE INDEX `vendors_kode_vendor_key`(`kode_vendor`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `employees` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `nama` VARCHAR(120) NOT NULL,
    `no_hp` VARCHAR(30) NULL,
    `branch_id` INTEGER NOT NULL,
    `jabatan` ENUM('KEPALA_BENGKEL', 'SERVICE_ADVISOR', 'LAINNYA') NOT NULL,
    `bank` VARCHAR(60) NULL,
    `nomor_rekening` VARCHAR(40) NULL,
    `nama_rekening` VARCHAR(120) NULL,
    `status` ENUM('ACTIVE', 'INACTIVE') NOT NULL DEFAULT 'ACTIVE',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    INDEX `employees_branch_id_jabatan_idx`(`branch_id`, `jabatan`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `products` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `kode_produk` VARCHAR(40) NOT NULL,
    `nama_produk` VARCHAR(150) NOT NULL,
    `merek` VARCHAR(80) NULL,
    `vendor_id` INTEGER NOT NULL,
    `unit` VARCHAR(20) NOT NULL DEFAULT 'PCS',
    `isi_per_dus` INTEGER NOT NULL,
    `harga_beli` DECIMAL(15, 2) NOT NULL,
    `fee_vendor_per_pcs` DECIMAL(15, 2) NOT NULL,
    `fee_kabeng_per_pcs` DECIMAL(15, 2) NOT NULL,
    `fee_perusahaan_per_pcs` DECIMAL(15, 2) NOT NULL,
    `status` ENUM('ACTIVE', 'INACTIVE') NOT NULL DEFAULT 'ACTIVE',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    UNIQUE INDEX `products_kode_produk_key`(`kode_produk`),
    INDEX `products_vendor_id_idx`(`vendor_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `product_area_fees` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `product_id` INTEGER NOT NULL,
    `area_id` INTEGER NOT NULL,
    `fee_vendor_per_pcs` DECIMAL(15, 2) NOT NULL,
    `fee_kabeng_per_pcs` DECIMAL(15, 2) NOT NULL,
    `fee_perusahaan_per_pcs` DECIMAL(15, 2) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `product_area_fees_product_id_area_id_key`(`product_id`, `area_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `company_settings` (
    `id` INTEGER NOT NULL DEFAULT 1,
    `nama_perusahaan` VARCHAR(150) NOT NULL,
    `alamat_pusat` TEXT NULL,
    `telepon` VARCHAR(40) NULL,
    `fax` VARCHAR(40) NULL,
    `email` VARCHAR(160) NULL,
    `website` VARCHAR(160) NULL,
    `npwp` VARCHAR(40) NULL,
    `pic_default_penyetuju` VARCHAR(120) NULL,
    `logo_file_id` INTEGER NULL,
    `signature_file_id` INTEGER NULL,
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `purchase_orders` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `po_number` VARCHAR(40) NOT NULL,
    `tanggal_po` DATE NOT NULL,
    `vendor_id` INTEGER NOT NULL,
    `branch_id` INTEGER NULL,
    `is_multi` BOOLEAN NOT NULL DEFAULT false,
    `status` ENUM('DRAFT', 'MENUNGGU_APPROVAL', 'APPROVED', 'DIKIRIM_VENDOR', 'DIKIRIM', 'DITERIMA', 'SELESAI', 'CANCEL') NOT NULL DEFAULT 'DRAFT',
    `total_dus` INTEGER NOT NULL DEFAULT 0,
    `total_pcs` INTEGER NOT NULL DEFAULT 0,
    `grand_total` DECIMAL(15, 2) NOT NULL DEFAULT 0,
    `catatan` TEXT NULL,
    `created_by` INTEGER NOT NULL,
    `approved_by` INTEGER NULL,
    `approved_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    UNIQUE INDEX `purchase_orders_po_number_key`(`po_number`),
    INDEX `purchase_orders_status_idx`(`status`),
    INDEX `purchase_orders_vendor_id_idx`(`vendor_id`),
    INDEX `purchase_orders_branch_id_idx`(`branch_id`),
    INDEX `purchase_orders_tanggal_po_idx`(`tanggal_po`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `po_details` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `po_id` INTEGER NOT NULL,
    `product_id` INTEGER NOT NULL,
    `branch_id` INTEGER NOT NULL,
    `nama_produk` VARCHAR(150) NOT NULL,
    `qty_dus` INTEGER NOT NULL,
    `isi_per_dus` INTEGER NOT NULL,
    `total_pcs` INTEGER NOT NULL,
    `harga` DECIMAL(15, 2) NOT NULL,
    `subtotal` DECIMAL(15, 2) NOT NULL,

    INDEX `po_details_po_id_idx`(`po_id`),
    INDEX `po_details_branch_id_idx`(`branch_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `po_status_histories` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `po_id` INTEGER NOT NULL,
    `from_status` ENUM('DRAFT', 'MENUNGGU_APPROVAL', 'APPROVED', 'DIKIRIM_VENDOR', 'DIKIRIM', 'DITERIMA', 'SELESAI', 'CANCEL') NULL,
    `to_status` ENUM('DRAFT', 'MENUNGGU_APPROVAL', 'APPROVED', 'DIKIRIM_VENDOR', 'DIKIRIM', 'DITERIMA', 'SELESAI', 'CANCEL') NOT NULL,
    `user_id` INTEGER NOT NULL,
    `catatan` VARCHAR(255) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `po_status_histories_po_id_idx`(`po_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `cashback_receipts` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `receipt_no` VARCHAR(40) NOT NULL,
    `vendor_id` INTEGER NOT NULL,
    `periode` CHAR(7) NOT NULL,
    `tanggal` DATE NOT NULL,
    `metode_pengiriman` ENUM('TRANSFER', 'CASH') NOT NULL,
    `total_cashback` DECIMAL(15, 2) NOT NULL,
    `bukti_file_id` INTEGER NULL,
    `catatan` TEXT NULL,
    `created_by` INTEGER NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    UNIQUE INDEX `cashback_receipts_receipt_no_key`(`receipt_no`),
    INDEX `cashback_receipts_periode_idx`(`periode`),
    INDEX `cashback_receipts_vendor_id_idx`(`vendor_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `cashback_receipt_pos` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `receipt_id` INTEGER NOT NULL,
    `po_id` INTEGER NOT NULL,
    `branch_id` INTEGER NOT NULL,

    INDEX `cashback_receipt_pos_receipt_id_idx`(`receipt_id`),
    UNIQUE INDEX `cashback_receipt_pos_po_id_branch_id_key`(`po_id`, `branch_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `cashback_receipt_details` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `receipt_id` INTEGER NOT NULL,
    `po_id` INTEGER NULL,
    `product_id` INTEGER NOT NULL,
    `branch_id` INTEGER NOT NULL,
    `qty_pcs` INTEGER NOT NULL,
    `fee_vendor_per_pcs` DECIMAL(15, 2) NOT NULL,
    `total_fee` DECIMAL(15, 2) NOT NULL,

    INDEX `cashback_receipt_details_receipt_id_idx`(`receipt_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `cashback_distributions` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `periode` CHAR(7) NOT NULL,
    `receipt_id` INTEGER NOT NULL,
    `po_id` INTEGER NULL,
    `branch_id` INTEGER NOT NULL,
    `product_id` INTEGER NOT NULL,
    `qty_pcs` INTEGER NOT NULL,
    `fee_kabeng_per_pcs` DECIMAL(15, 2) NOT NULL,
    `total_fee_kabeng` DECIMAL(15, 2) NOT NULL,
    `fee_perusahaan_per_pcs` DECIMAL(15, 2) NOT NULL,
    `total_fee_perusahaan` DECIMAL(15, 2) NOT NULL,
    `status` ENUM('UNPAID', 'PAID', 'REFUND') NOT NULL DEFAULT 'UNPAID',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `cashback_distributions_status_periode_branch_id_idx`(`status`, `periode`, `branch_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `cashback_payments` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `payment_no` VARCHAR(40) NOT NULL,
    `periode` CHAR(7) NOT NULL,
    `tanggal_bayar` DATE NOT NULL,
    `metode` ENUM('TRANSFER_MANUAL', 'CASH') NOT NULL,
    `total_bayar` DECIMAL(15, 2) NOT NULL,
    `status` ENUM('PENDING', 'SUCCESS', 'FAILED') NOT NULL DEFAULT 'PENDING',
    `catatan` TEXT NULL,
    `bukti_file_id` INTEGER NULL,
    `created_by` INTEGER NOT NULL,
    `confirmed_by` INTEGER NULL,
    `confirmed_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `cashback_payments_payment_no_key`(`payment_no`),
    INDEX `cashback_payments_status_periode_idx`(`status`, `periode`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `payment_details` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `payment_id` INTEGER NOT NULL,
    `employee_id` INTEGER NOT NULL,
    `branch_id` INTEGER NOT NULL,
    `bank` VARCHAR(60) NULL,
    `rekening` VARCHAR(40) NULL,
    `nama_rekening` VARCHAR(120) NULL,
    `nominal` DECIMAL(15, 2) NOT NULL,
    `status` ENUM('PENDING', 'SUCCESS', 'FAILED') NOT NULL DEFAULT 'PENDING',
    `referensi_pembayaran` VARCHAR(120) NULL,
    `bukti_file_id` INTEGER NULL,

    INDEX `payment_details_payment_id_idx`(`payment_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `payment_detail_items` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `payment_detail_id` INTEGER NOT NULL,
    `distribution_id` INTEGER NOT NULL,
    `nominal` DECIMAL(15, 2) NOT NULL,

    INDEX `payment_detail_items_distribution_id_idx`(`distribution_id`),
    UNIQUE INDEX `payment_detail_items_payment_detail_id_distribution_id_key`(`payment_detail_id`, `distribution_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `file_uploads` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `original_name` VARCHAR(255) NOT NULL,
    `stored_path` VARCHAR(255) NOT NULL,
    `mime_type` VARCHAR(100) NOT NULL,
    `size` INTEGER NOT NULL,
    `uploaded_by` INTEGER NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `notifications` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `type` ENUM('PO_CREATED', 'PO_APPROVED', 'GOODS_SHIPPED', 'GOODS_RECEIVED', 'CASHBACK_RECEIVED', 'CASHBACK_PAID') NOT NULL,
    `title` VARCHAR(150) NOT NULL,
    `message` VARCHAR(500) NOT NULL,
    `ref_type` VARCHAR(40) NULL,
    `ref_id` INTEGER NULL,
    `target_role` ENUM('SUPER_ADMIN', 'ADMIN', 'KEPALA_BENGKEL') NULL,
    `branch_id` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `notifications_created_at_idx`(`created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `notification_reads` (
    `notification_id` INTEGER NOT NULL,
    `user_id` INTEGER NOT NULL,
    `read_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`notification_id`, `user_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `audit_logs` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `user_id` INTEGER NULL,
    `nama_user` VARCHAR(120) NOT NULL,
    `aksi` VARCHAR(60) NOT NULL,
    `modul` VARCHAR(30) NOT NULL,
    `ref_id` VARCHAR(60) NULL,
    `data_lama` JSON NULL,
    `data_baru` JSON NULL,
    `ip_address` VARCHAR(45) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `audit_logs_modul_created_at_idx`(`modul`, `created_at`),
    INDEX `audit_logs_user_id_idx`(`user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `users` ADD CONSTRAINT `users_branch_id_fkey` FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `users` ADD CONSTRAINT `users_employee_id_fkey` FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `branches` ADD CONSTRAINT `branches_area_id_fkey` FOREIGN KEY (`area_id`) REFERENCES `areas`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `employees` ADD CONSTRAINT `employees_branch_id_fkey` FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `products` ADD CONSTRAINT `products_vendor_id_fkey` FOREIGN KEY (`vendor_id`) REFERENCES `vendors`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `product_area_fees` ADD CONSTRAINT `product_area_fees_product_id_fkey` FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `product_area_fees` ADD CONSTRAINT `product_area_fees_area_id_fkey` FOREIGN KEY (`area_id`) REFERENCES `areas`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `company_settings` ADD CONSTRAINT `company_settings_logo_file_id_fkey` FOREIGN KEY (`logo_file_id`) REFERENCES `file_uploads`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `company_settings` ADD CONSTRAINT `company_settings_signature_file_id_fkey` FOREIGN KEY (`signature_file_id`) REFERENCES `file_uploads`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `purchase_orders` ADD CONSTRAINT `purchase_orders_vendor_id_fkey` FOREIGN KEY (`vendor_id`) REFERENCES `vendors`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `purchase_orders` ADD CONSTRAINT `purchase_orders_branch_id_fkey` FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `purchase_orders` ADD CONSTRAINT `purchase_orders_created_by_fkey` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `purchase_orders` ADD CONSTRAINT `purchase_orders_approved_by_fkey` FOREIGN KEY (`approved_by`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `po_details` ADD CONSTRAINT `po_details_po_id_fkey` FOREIGN KEY (`po_id`) REFERENCES `purchase_orders`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `po_details` ADD CONSTRAINT `po_details_product_id_fkey` FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `po_details` ADD CONSTRAINT `po_details_branch_id_fkey` FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `po_status_histories` ADD CONSTRAINT `po_status_histories_po_id_fkey` FOREIGN KEY (`po_id`) REFERENCES `purchase_orders`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `po_status_histories` ADD CONSTRAINT `po_status_histories_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `cashback_receipts` ADD CONSTRAINT `cashback_receipts_vendor_id_fkey` FOREIGN KEY (`vendor_id`) REFERENCES `vendors`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `cashback_receipts` ADD CONSTRAINT `cashback_receipts_bukti_file_id_fkey` FOREIGN KEY (`bukti_file_id`) REFERENCES `file_uploads`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `cashback_receipts` ADD CONSTRAINT `cashback_receipts_created_by_fkey` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `cashback_receipt_pos` ADD CONSTRAINT `cashback_receipt_pos_receipt_id_fkey` FOREIGN KEY (`receipt_id`) REFERENCES `cashback_receipts`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `cashback_receipt_pos` ADD CONSTRAINT `cashback_receipt_pos_po_id_fkey` FOREIGN KEY (`po_id`) REFERENCES `purchase_orders`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `cashback_receipt_pos` ADD CONSTRAINT `cashback_receipt_pos_branch_id_fkey` FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `cashback_receipt_details` ADD CONSTRAINT `cashback_receipt_details_receipt_id_fkey` FOREIGN KEY (`receipt_id`) REFERENCES `cashback_receipts`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `cashback_receipt_details` ADD CONSTRAINT `cashback_receipt_details_po_id_fkey` FOREIGN KEY (`po_id`) REFERENCES `purchase_orders`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `cashback_receipt_details` ADD CONSTRAINT `cashback_receipt_details_product_id_fkey` FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `cashback_receipt_details` ADD CONSTRAINT `cashback_receipt_details_branch_id_fkey` FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `cashback_distributions` ADD CONSTRAINT `cashback_distributions_receipt_id_fkey` FOREIGN KEY (`receipt_id`) REFERENCES `cashback_receipts`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `cashback_distributions` ADD CONSTRAINT `cashback_distributions_po_id_fkey` FOREIGN KEY (`po_id`) REFERENCES `purchase_orders`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `cashback_distributions` ADD CONSTRAINT `cashback_distributions_branch_id_fkey` FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `cashback_distributions` ADD CONSTRAINT `cashback_distributions_product_id_fkey` FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `cashback_payments` ADD CONSTRAINT `cashback_payments_bukti_file_id_fkey` FOREIGN KEY (`bukti_file_id`) REFERENCES `file_uploads`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `cashback_payments` ADD CONSTRAINT `cashback_payments_created_by_fkey` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `cashback_payments` ADD CONSTRAINT `cashback_payments_confirmed_by_fkey` FOREIGN KEY (`confirmed_by`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `payment_details` ADD CONSTRAINT `payment_details_payment_id_fkey` FOREIGN KEY (`payment_id`) REFERENCES `cashback_payments`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `payment_details` ADD CONSTRAINT `payment_details_employee_id_fkey` FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `payment_details` ADD CONSTRAINT `payment_details_branch_id_fkey` FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `payment_details` ADD CONSTRAINT `payment_details_bukti_file_id_fkey` FOREIGN KEY (`bukti_file_id`) REFERENCES `file_uploads`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `payment_detail_items` ADD CONSTRAINT `payment_detail_items_payment_detail_id_fkey` FOREIGN KEY (`payment_detail_id`) REFERENCES `payment_details`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `payment_detail_items` ADD CONSTRAINT `payment_detail_items_distribution_id_fkey` FOREIGN KEY (`distribution_id`) REFERENCES `cashback_distributions`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `file_uploads` ADD CONSTRAINT `file_uploads_uploaded_by_fkey` FOREIGN KEY (`uploaded_by`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `notification_reads` ADD CONSTRAINT `notification_reads_notification_id_fkey` FOREIGN KEY (`notification_id`) REFERENCES `notifications`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `notification_reads` ADD CONSTRAINT `notification_reads_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `audit_logs` ADD CONSTRAINT `audit_logs_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
