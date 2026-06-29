-- ====================================================================
-- RETAILHUB CLEANUP & DATABASE RESET SCRIPT
-- WARNING: Running this script will DELETE all tables and permanently
-- erase all sales data, user accounts, and product inventory!
-- Target Database: PostgreSQL (Supabase)
-- ====================================================================

-- Disable Row Level Security first (optional, clean practice)
ALTER TABLE IF EXISTS detail_transaksi DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS transaksi DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS barang DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS users DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS keep_alive DISABLE ROW LEVEL SECURITY;

-- Drop all tables using CASCADE to clean up constraints, triggers, and indices
DROP TABLE IF EXISTS detail_transaksi CASCADE;
DROP TABLE IF EXISTS transaksi CASCADE;
DROP TABLE IF EXISTS barang CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS keep_alive CASCADE;

-- Drop custom types
DROP TYPE IF EXISTS user_role CASCADE;

-- Drop trigger functions
DROP FUNCTION IF EXISTS deduct_stock_on_insert() CASCADE;
DROP FUNCTION IF EXISTS update_modified_column() CASCADE;

-- Output confirmation message
DO $$
BEGIN
    RAISE NOTICE 'RetailHub database cleanup complete. All tables, types, and functions have been dropped successfully.';
END $$;
