-- ============================================================
-- Ghost Writer Monetization Schema v2 (FINAL)
-- Run this in Supabase SQL Editor (https://supabase.com/dashboard)
-- ============================================================

-- This script replaces the previous v2 migration. 
-- It implements the "Beta = Temporary" logic and 3-day trials,
-- but excludes the custom promo code system (use Gumroad instead).

-- 1. Replace the register_beta_user function with CORRECT business logic:
--    - Beta users (1-1000): FREE only while is_beta_active=true
--    - Once beta ends: ALL users (including 1-1000) must pay
--    - Post-beta users (1001+): 3-day free trial, then paywall
DROP FUNCTION IF EXISTS register_beta_user(text,text,text);
CREATE OR REPLACE FUNCTION register_beta_user(
  p_machine_id TEXT,
  p_version TEXT DEFAULT NULL,
  p_os TEXT DEFAULT NULL
)
RETURNS TABLE(
  is_beta BOOLEAN,
  is_new_user BOOLEAN,
  first_opened TIMESTAMPTZ,
  remaining_days NUMERIC,
  has_license BOOLEAN,
  beta_users_count INTEGER,
  is_beta_period BOOLEAN,
  registered_during_beta BOOLEAN
) AS $$
DECLARE
  v_config RECORD;
  v_install RECORD;
  v_is_new BOOLEAN := false;
  v_registered_during_beta BOOLEAN := false;
BEGIN
  -- Get current config
  SELECT * INTO v_config FROM global_config WHERE id = 1;

  -- Upsert installation
  INSERT INTO installations (machine_id, app_version, os_info, last_seen_at)
  VALUES (p_machine_id, p_version, p_os, now())
  ON CONFLICT (machine_id) DO UPDATE SET
    last_seen_at = now(),
    app_version = COALESCE(p_version, installations.app_version)
  RETURNING * INTO v_install;

  -- Check if genuinely new user
  IF v_install.last_seen_at = v_install.first_opened_at THEN
    v_is_new := true;
    -- Atomically increment beta counter
    UPDATE global_config
    SET total_beta_users = total_beta_users + 1, updated_at = now()
    WHERE id = 1
    RETURNING * INTO v_config;
    -- Auto-disable beta if limit reached
    IF v_config.total_beta_users >= v_config.beta_limit THEN
      UPDATE global_config SET is_beta_active = false WHERE id = 1;
    END IF;
  END IF;

  -- Was this user registered during the beta period?
  -- (user number <= beta_limit at time of registration)
  v_registered_during_beta := (
    SELECT COUNT(*) FROM installations WHERE first_opened_at <= v_install.first_opened_at
  ) <= v_config.beta_limit;

  -- Return status
  RETURN QUERY SELECT
    v_config.is_beta_active,                -- is_beta: only true while beta is running
    v_is_new,
    v_install.first_opened_at,
    -- remaining_days: for post-beta users, 3-day trial from first open
    CASE 
      WHEN v_registered_during_beta THEN 0::NUMERIC(5,2) -- Beta users: no trial, direct pay to unlock after beta
      ELSE GREATEST(0, 3 - EXTRACT(EPOCH FROM (now() - v_install.first_opened_at)) / 86400)::NUMERIC(5,2)
    END,
    v_install.has_paid_license,
    v_config.total_beta_users,
    v_config.is_beta_active,                -- is_beta_period: is beta currently active?
    v_registered_during_beta;               -- registered_during_beta: was this user in the first 1000?
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
