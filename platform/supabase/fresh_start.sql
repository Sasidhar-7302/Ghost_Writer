-- ==========================================
-- GHOST WRITER: FRESH START / RESET SCRIPT
-- Run this in Supabase SQL Editor to clear test data
-- ==========================================

-- 1. Wipe all activity and session data (CASCADE handles dependencies)
TRUNCATE TABLE activity_logs CASCADE;
TRUNCATE TABLE checkout_sessions CASCADE;
TRUNCATE TABLE installations CASCADE;

-- 2. Reset global counters to zero
UPDATE global_config 
SET total_beta_users = 0, 
    updated_at = now() 
WHERE id = 1;

-- 3. Verify clean state
SELECT 'Success: Data wiped. Ready for Production Launch.' as status;
