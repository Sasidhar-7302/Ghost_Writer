-- ============================================================
-- Ghost Writer Analytics Schema (Phase 6)
-- Run this in Supabase SQL Editor
-- ============================================================

-- 1. Add analytics columns to installations
ALTER TABLE global_config 
ADD COLUMN IF NOT EXISTS is_service_active BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS maintenance_message TEXT DEFAULT 'Ghost Writer is currently undergoing scheduled maintenance. Please try again later.';

ALTER TABLE installations 
ADD COLUMN IF NOT EXISTS open_count BIGINT DEFAULT 1,
ADD COLUMN IF NOT EXISTS total_active_minutes BIGINT DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMPTZ DEFAULT now();

-- 2. Update register_beta_user to increment open_count
-- We need to DROP it again because the signature is same but we're adding logic
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
  registered_during_beta BOOLEAN,
  is_service_active BOOLEAN,
  maintenance_message TEXT
) AS $$
DECLARE
  v_config RECORD;
  v_install RECORD;
  v_is_new BOOLEAN := false;
  v_registered_during_beta BOOLEAN := false;
BEGIN
  -- Get current config
  SELECT * INTO v_config FROM global_config WHERE id = 1;

  -- Upsert installation and increment open_count if it's a re-open
  INSERT INTO installations (machine_id, app_version, os_info, last_seen_at, open_count)
  VALUES (p_machine_id, p_version, p_os, now(), 1)
  ON CONFLICT (machine_id) DO UPDATE SET
    last_seen_at = now(),
    open_count = installations.open_count + 1,
    app_version = COALESCE(p_version, installations.app_version)
  RETURNING * INTO v_install;

  -- Check if genuinely new user
  IF v_install.last_seen_at = v_install.first_opened_at THEN
    v_is_new := true;
    UPDATE global_config
    SET total_beta_users = total_beta_users + 1, updated_at = now()
    WHERE id = 1
    RETURNING * INTO v_config;
    
    IF v_config.total_beta_users >= v_config.beta_limit THEN
      UPDATE global_config SET is_beta_active = false WHERE id = 1;
    END IF;
  END IF;

  v_registered_during_beta := (
    SELECT COUNT(*) FROM installations WHERE first_opened_at <= v_install.first_opened_at
  ) <= v_config.beta_limit;

  RETURN QUERY SELECT
    v_config.is_beta_active,
    v_is_new,
    v_install.first_opened_at,
    CASE 
      WHEN v_registered_during_beta THEN 0::NUMERIC(5,2)
      ELSE GREATEST(0, 3 - EXTRACT(EPOCH FROM (now() - v_install.first_opened_at)) / 86400)::NUMERIC(5,2)
    END,
    v_install.has_paid_license,
    v_config.total_beta_users,
    v_config.is_beta_active,
    v_registered_during_beta,
    v_config.is_service_active,
    v_config.maintenance_message;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Create heartbeat function to track active time
CREATE OR REPLACE FUNCTION update_analytics_heartbeat(
  p_machine_id TEXT,
  p_minutes_to_add INTEGER
)
RETURNS VOID AS $$
BEGIN
  UPDATE installations
  SET 
    total_active_minutes = total_active_minutes + p_minutes_to_add,
    last_active_at = now(),
    last_seen_at = now()
  WHERE machine_id = p_machine_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
