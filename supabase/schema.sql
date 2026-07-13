-- ==========================================
-- RETAILHUB DATABASE SCHEMA
-- Target Database: PostgreSQL (Supabase)
-- Created At: 2026-06-28
-- ==========================================

-- 1. DROP EXISTING TABLES & TYPES (CASCADE DROPS TRIGGERS AUTOMATICALLY)
DROP TABLE IF EXISTS detail_transaksi CASCADE;
DROP TABLE IF EXISTS transaksi CASCADE;
DROP TABLE IF EXISTS keep_alive CASCADE;
DROP TABLE IF EXISTS barcode CASCADE;
DROP TABLE IF EXISTS barang CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TYPE IF EXISTS user_role CASCADE;
DROP FUNCTION IF EXISTS deduct_stock_on_insert() CASCADE;
DROP FUNCTION IF EXISTS update_modified_column() CASCADE;

-- 2. CREATE CUSTOM ENUM TYPE FOR ROLES
CREATE TYPE user_role AS ENUM ('admin', 'pemilik', 'staff');
-- Migration (existing DBs that still have 'kasir'): ALTER TYPE user_role RENAME VALUE 'kasir' TO 'staff';

-- 3. CREATE AUTOMATIC UPDATE TIMESTAMP TRIGGER FUNCTION
CREATE OR REPLACE FUNCTION update_modified_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- 3b. CREATE TOKO (STORES) TABLE
CREATE TABLE toko (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    address TEXT,
    phone TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE toko IS 'Tabel data toko/cabang RetailHub.';
COMMENT ON COLUMN toko.id IS 'ID Unik toko (UUID).';
COMMENT ON COLUMN toko.name IS 'Nama toko atau cabang.';
COMMENT ON COLUMN toko.address IS 'Alamat lengkap toko.';
COMMENT ON COLUMN toko.phone IS 'Nomor telepon toko.';

CREATE TRIGGER update_toko_modtime
    BEFORE UPDATE ON toko
    FOR EACH ROW
    EXECUTE FUNCTION update_modified_column();

-- 3c. SEED DEFAULT STORE
INSERT INTO toko (id, name, address, phone)
VALUES ('550e8400-e29b-41d4-a716-446655440000', 'Toko RetailHub Pusat', 'Jl. Raya Utama No. 1', '021-12345678');

-- 4. CREATE USERS TABLE (with toko_id reference)
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role user_role NOT NULL,
    fullname TEXT NOT NULL,
    toko_id UUID REFERENCES toko(id) ON DELETE SET NULL,
    phone TEXT,
    shift TEXT CHECK (shift IN ('Pagi', 'Siang', 'Malam', 'Full Time')),
    status TEXT NOT NULL DEFAULT 'Offline' CHECK (status IN ('Aktif', 'Offline')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5. ADD USERS TABLE & COLUMN COMMENTS (METADATA)
COMMENT ON TABLE users IS 'Tabel data karyawan, pemilik, dan staf RetailHub sembako.';
COMMENT ON COLUMN users.id IS 'ID Unik pengguna (UUID).';
COMMENT ON COLUMN users.username IS 'Username unik untuk login staf.';
COMMENT ON COLUMN users.password IS 'Password terenkripsi/hash atau plain-text untuk login.';
COMMENT ON COLUMN users.role IS 'Peran otorisasi sistem: admin, pemilik, atau staff.';
COMMENT ON COLUMN users.fullname IS 'Nama lengkap karyawan/pemilik.';
COMMENT ON COLUMN users.phone IS 'Nomor telepon/whatsapp aktif.';
COMMENT ON COLUMN users.shift IS 'Jadwal shift kerja karyawan.';
COMMENT ON COLUMN users.status IS 'Status kehadiran / login aktif.';
COMMENT ON COLUMN users.created_at IS 'Tanggal akun dibuat.';
COMMENT ON COLUMN users.updated_at IS 'Tanggal akun terakhir diubah.';

-- 6. REGISTER TRIGGER FOR USERS TABLE
CREATE TRIGGER update_users_modtime
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION update_modified_column();

-- 6b. ALTER TOKO TO ADD FOREIGN KEY TO USERS (ONE-TO-MANY RELATIONSHIP)
ALTER TABLE toko ADD COLUMN pemilik_id UUID REFERENCES users(id) ON DELETE SET NULL;
COMMENT ON COLUMN toko.pemilik_id IS 'ID Pemilik toko (referensi ke tabel users).';

-- 7. SEED INITIAL USERS DATA (PRODUCTION ADMIN ONLY)
INSERT INTO users (username, password, role, fullname, toko_id, phone, shift, status)
VALUES
    (
        'louiscalvin',
        'fireflies2244',
        'admin',
        'Louis Calvin (Admin)',
        '550e8400-e29b-41d4-a716-446655440000',
        NULL,
        'Full Time',
        'Offline'
    );

-- 8. CREATE BARANG (PRODUCTS) TABLE
CREATE TABLE barang (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sku TEXT NOT NULL,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    toko_id UUID NOT NULL REFERENCES toko(id) ON DELETE CASCADE,
    harga_beli NUMERIC(12,2) NOT NULL CHECK (harga_beli >= 0),
    harga_jual NUMERIC(12,2) NOT NULL CHECK (harga_jual >= 0),
    stock INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
    min_stock INTEGER NOT NULL DEFAULT 5 CHECK (min_stock >= 0),
    supplier TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (sku, toko_id)
);

-- 9. ADD BARANG TABLE & COLUMN COMMENTS
COMMENT ON TABLE barang IS 'Tabel data barang dagangan sembako RetailHub.';
COMMENT ON COLUMN barang.id IS 'ID Unik produk/barang (UUID).';
COMMENT ON COLUMN barang.sku IS 'Stock Keeping Unit atau nomor Barcode barang.';
COMMENT ON COLUMN barang.name IS 'Nama produk/barang sembako.';
COMMENT ON COLUMN barang.category IS 'Kategori produk (e.g. Bahan Pokok, Kebersihan).';
COMMENT ON COLUMN barang.harga_beli IS 'Harga beli modal dari supplier.';
COMMENT ON COLUMN barang.harga_jual IS 'Harga jual eceran ke pelanggan.';
COMMENT ON COLUMN barang.stock IS 'Jumlah persediaan fisik barang di rak/gudang.';
COMMENT ON COLUMN barang.min_stock IS 'Batas minimum stok sebelum peringatan restock.';
COMMENT ON COLUMN barang.supplier IS 'Supplier atau distributor penyedia barang.';
COMMENT ON COLUMN barang.created_at IS 'Tanggal produk didaftarkan.';
COMMENT ON COLUMN barang.updated_at IS 'Tanggal produk terakhir diubah.';

-- 10. REGISTER TRIGGER FOR BARANG TABLE
CREATE TRIGGER update_barang_modtime
    BEFORE UPDATE ON barang
    FOR EACH ROW
    EXECUTE FUNCTION update_modified_column();


-- 11. CREATE BARCODE TABLE
CREATE TABLE barcode (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    barang_id UUID NOT NULL REFERENCES barang(id) ON DELETE CASCADE,
    barcode TEXT UNIQUE NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ADD BARCODE TABLE & COLUMN COMMENTS
COMMENT ON TABLE barcode IS 'Tabel pemetaan barcode tambahan untuk produk sembako.';
COMMENT ON COLUMN barcode.id IS 'ID Unik barcode (UUID).';
COMMENT ON COLUMN barcode.barang_id IS 'Referensi ID produk pada tabel barang.';
COMMENT ON COLUMN barcode.barcode IS 'Nomor barcode unik yang dipetakan ke produk.';
COMMENT ON COLUMN barcode.created_at IS 'Tanggal barcode ditambahkan.';
COMMENT ON COLUMN barcode.updated_at IS 'Tanggal barcode terakhir diubah.';

-- REGISTER TRIGGER FOR BARCODE TABLE
CREATE TRIGGER update_barcode_modtime
    BEFORE UPDATE ON barcode
    FOR EACH ROW
    EXECUTE FUNCTION update_modified_column();


-- 12. CREATE TRANSAKSI (SALES INVOICES) TABLE
CREATE TABLE transaksi (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_number TEXT NOT NULL,
    toko_id UUID NOT NULL REFERENCES toko(id) ON DELETE CASCADE,
    cashier_name TEXT NOT NULL,
    customer_name TEXT,
    payment_method TEXT NOT NULL, -- Cash, QRIS, Debit
    total_price NUMERIC(12,2) NOT NULL CHECK (total_price >= 0),
    tax NUMERIC(12,2) NOT NULL DEFAULT 0.00 CHECK (tax >= 0),
    grand_total NUMERIC(12,2) NOT NULL CHECK (grand_total >= 0),
    cash_received NUMERIC(12,2) CHECK (cash_received >= 0),
    change_returned NUMERIC(12,2) CHECK (change_returned >= 0),
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'voided')),
    voided_at TIMESTAMPTZ,
    voided_by TEXT,
    void_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (invoice_number, toko_id)
);

-- 13. CREATE DETAIL_TRANSAKSI (TRANSACTION DETAIL ITEMS) TABLE
CREATE TABLE detail_transaksi (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_id UUID NOT NULL REFERENCES transaksi(id) ON DELETE CASCADE,
    product_id UUID REFERENCES barang(id) ON DELETE SET NULL,
    product_name TEXT NOT NULL,
    sku TEXT NOT NULL,
    price NUMERIC(12,2) NOT NULL CHECK (price >= 0),
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    total NUMERIC(12,2) NOT NULL CHECK (total >= 0)
);

-- 14. CREATE STOCK DEDUCTION TRIGGER FUNCTION
CREATE OR REPLACE FUNCTION deduct_stock_on_insert()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE barang
    SET stock = stock - NEW.quantity
    WHERE id = NEW.product_id;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- 15. REGISTER TRIGGER ON DETAIL_TRANSAKSI
CREATE TRIGGER trigger_deduct_stock
    AFTER INSERT ON detail_transaksi
    FOR EACH ROW
    EXECUTE FUNCTION deduct_stock_on_insert();


-- 16. VOID TRANSACTION FUNCTION
CREATE OR REPLACE FUNCTION void_transaction(
  p_transaction_id UUID,
  p_voided_by TEXT,
  p_reason TEXT
) RETURNS JSONB
SECURITY DEFINER
AS $$
DECLARE
  v_detail RECORD;
  v_current_status TEXT;
BEGIN
  -- Check if transaction exists and status
  SELECT status INTO v_current_status FROM transaksi WHERE id = p_transaction_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Transaksi tidak ditemukan');
  END IF;
  IF v_current_status = 'voided' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Transaksi sudah di-void sebelumnya');
  END IF;

  -- Restore stock for each item in the transaction
  FOR v_detail IN
    SELECT * FROM detail_transaksi WHERE transaction_id = p_transaction_id
  LOOP
    UPDATE barang
    SET stock = stock + v_detail.quantity
    WHERE id = v_detail.product_id;
  END LOOP;

  -- Mark transaction as voided
  UPDATE transaksi
  SET status = 'voided',
      voided_at = now(),
      voided_by = p_voided_by,
      void_reason = p_reason
  WHERE id = p_transaction_id;

  RETURN jsonb_build_object(
    'success', true,
    'transaction_id', p_transaction_id
  );
END;
$$ LANGUAGE plpgsql;


-- 17. CREATE KEEP ALIVE DUMMY TABLE (PREVENTS AUTOPAUSE)
CREATE TABLE keep_alive (
    id INT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    last_ping TIMESTAMPTZ NOT NULL DEFAULT now(),
    message TEXT NOT NULL DEFAULT 'RetailHub Active'
);

-- 18. ADD KEEP ALIVE TABLE & COLUMN COMMENTS
COMMENT ON TABLE keep_alive IS 'Tabel dummy keep-alive untuk mencegah Supabase free tier ter-pause akibat inaktivitas.';
COMMENT ON COLUMN keep_alive.id IS 'ID Unik ping counter.';
COMMENT ON COLUMN keep_alive.last_ping IS 'Waktu ping terakhir.';
COMMENT ON COLUMN keep_alive.message IS 'Pesan ping status.';

-- 19. SEED KEEP ALIVE DATA
INSERT INTO keep_alive (message) VALUES ('RetailHub Keep Alive Active');

-- 20. OPTIONAL: AUTOMATED INTERNAL PG_CRON SCHEDULER
-- CREATE EXTENSION IF NOT EXISTS pg_cron;
-- SELECT cron.schedule(
--   'retailhub-keep-alive-ping',
--   '0 */6 * * *', -- Runs every 6 hours
--   'UPDATE keep_alive SET last_ping = now() WHERE id = 1'
-- );

-- ==========================================
-- 21. PRODUCTION PERFORMANCE INDEXES
-- ==========================================
CREATE INDEX IF NOT EXISTS idx_toko_name ON toko(name);
CREATE INDEX IF NOT EXISTS idx_users_toko_id ON users(toko_id);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_barang_sku ON barang(sku);
CREATE INDEX IF NOT EXISTS idx_barang_toko_id ON barang(toko_id);
CREATE INDEX IF NOT EXISTS idx_barang_category ON barang(category);
CREATE INDEX IF NOT EXISTS idx_barang_name ON barang(name);
CREATE INDEX IF NOT EXISTS idx_barcode_code ON barcode(barcode);
CREATE INDEX IF NOT EXISTS idx_barcode_barang_id ON barcode(barang_id);
CREATE INDEX IF NOT EXISTS idx_transaksi_toko_id ON transaksi(toko_id);
CREATE INDEX IF NOT EXISTS idx_transaksi_created_at ON transaksi(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_transaksi_invoice_number ON transaksi(invoice_number);
CREATE INDEX IF NOT EXISTS idx_detail_transaksi_transaction_id ON detail_transaksi(transaction_id);
CREATE INDEX IF NOT EXISTS idx_detail_transaksi_product_id ON detail_transaksi(product_id);

-- ==========================================
-- 22. ROW-LEVEL SECURITY & ACCESS POLICIES
-- ==========================================

-- Enable Row Level Security (RLS)
ALTER TABLE toko ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE barang ENABLE ROW LEVEL SECURITY;
ALTER TABLE barcode ENABLE ROW LEVEL SECURITY;
ALTER TABLE transaksi ENABLE ROW LEVEL SECURITY;
ALTER TABLE detail_transaksi ENABLE ROW LEVEL SECURITY;
ALTER TABLE keep_alive ENABLE ROW LEVEL SECURITY;

-- 22a. TOKO TABLE SECURITY
-- Everyone can read toko list (for store selector)
CREATE POLICY "Enable read access for all users" ON toko
    FOR SELECT USING (true);

-- Only pemilik can create/edit/delete stores (one-to-many filtering)
CREATE POLICY "Enable manage toko for pemilik" ON toko
    FOR ALL USING (
        (auth.jwt() ->> 'user_role' = 'pemilik' AND (pemilik_id IS NULL OR pemilik_id::text = auth.jwt() ->> 'sub')) OR
        (auth.jwt() ->> 'user_role' = 'admin')
    );

-- 22b. USERS TABLE SECURITY
-- Allow reading user accounts (needed for login check & employee listings)
CREATE POLICY "Enable read access for all users" ON users
    FOR SELECT USING (true);

-- Restrict user creation, modification, and deletion to admin & pemilik roles,
-- OR allow the logged-in user to modify their own account (needed for self-service password changes)
CREATE POLICY "Enable modify for admin, pemilik, or self" ON users
    FOR ALL USING (
        (auth.jwt() ->> 'user_role' IN ('admin', 'pemilik')) OR
        (auth.jwt() ->> 'sub' = id::text)
    );

-- 22c. BARANG (PRODUCTS) TABLE SECURITY
-- Allow anyone to browse products and see stock/pricing (filtered by toko)
CREATE POLICY "Enable select access for all users" ON barang
    FOR SELECT USING (true);

-- Allow updates to product stock levels (needed for POS checkout & restock mutations)
CREATE POLICY "Enable stock updates for staff" ON barang
    FOR UPDATE USING (true);

-- Restrict full catalog management (new items, price updates, deletion) to admin & pemilik
CREATE POLICY "Enable full edit for admin and pemilik" ON barang
    FOR ALL USING (
        auth.jwt() ->> 'user_role' IN ('admin', 'pemilik')
    );

-- 22d. TRANSAKSI (SALES) TABLE SECURITY
-- Allow reading transaction history
CREATE POLICY "Enable select access for transactions" ON transaksi
    FOR SELECT USING (true);

-- Allow cashiers and system to insert new sale invoices
CREATE POLICY "Enable insert access for sales" ON transaksi
    FOR INSERT WITH CHECK (true);

-- Restrict modifying or deleting transaction history to admin & pemilik
CREATE POLICY "Enable modify sales for admin and pemilik" ON transaksi
    FOR ALL USING (
        auth.jwt() ->> 'user_role' IN ('admin', 'pemilik')
    );

-- 22e. DETAIL_TRANSAKSI SECURITY
-- Allow reading transaction details
CREATE POLICY "Enable select access for detail_transaksi" ON detail_transaksi
    FOR SELECT USING (true);

-- Allow inserting transaction item details
CREATE POLICY "Enable insert access for detail_transaksi" ON detail_transaksi
    FOR INSERT WITH CHECK (true);

-- Restrict modifying transaction details to admin & pemilik
CREATE POLICY "Enable modify details for admin and pemilik" ON detail_transaksi
    FOR ALL USING (
        auth.jwt() ->> 'user_role' IN ('admin', 'pemilik')
    );

-- 22f. KEEP_ALIVE TABLE SECURITY
CREATE POLICY "Enable all access for keep_alive" ON keep_alive
    FOR ALL USING (true);

-- 22g. BARCODE TABLE SECURITY
CREATE POLICY "Enable select access for all users" ON barcode
    FOR SELECT USING (true);

CREATE POLICY "Enable full edit for admin and pemilik" ON barcode
    FOR ALL USING (
        auth.jwt() ->> 'user_role' IN ('admin', 'pemilik')
    );

