-- Dynamic fix for trial_duration_days error
-- This script ensures the column exists and updates the RPC to handle missing fields gracefully.

-- 1. Ensure column exists (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'global_config' AND column_name = 'trial_duration_days'
  ) THEN
    ALTER TABLE global_config ADD COLUMN trial_duration_days INTEGER DEFAULT 3;
  END IF;
END $$;

-- 2. Drop and recreate function to refresh execution plan and field metadata
DROP FUNCTION IF EXISTS register_beta_user(text, text, text);

CREATE OR REPLACE FUNCTION register_beta_user(
  p_machine_id TEXT,
  p_version TEXT DEFAULT '1.0.0',
  p_os TEXT DEFAULT 'unknown'
)
RETURNS TABLE (
  is_beta BOOLEAN,
  is_new_user BOOLEAN,
  first_opened TIMESTAMPTZ,
  remaining_days NUMERIC,
  has_license BOOLEAN,
  beta_users_count INTEGER,
  is_beta_period BOOLEAN,
  registered_during_beta BOOLEAN,
  is_service_active BOOLEAN,
  maintenance_message TEXT,
  license_key TEXT
) AS $$
DECLARE
  v_config RECORD;
  v_install RECORD;
  v_is_new BOOLEAN := false;
  v_license_key TEXT;
  v_trial_days INTEGER;
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

  -- Get license key if any (most recent completed)
  SELECT c.license_key INTO v_license_key
  FROM checkout_sessions c
  WHERE c.machine_id = p_machine_id AND c.status = 'completed'
  ORDER BY c.completed_at DESC
  LIMIT 1;

  -- Check for new user
  IF v_install.last_seen_at = v_install.first_opened_at THEN
    v_is_new := true;
    UPDATE global_config
    SET total_beta_users = total_beta_users + 1, updated_at = now()
    WHERE id = 1
    RETURNING * INTO v_config;
  END IF;

  -- Safely extract trial_duration_days using JSONB to avoid runtime field errors
  v_trial_days := COALESCE((to_jsonb(v_config) ->> 'trial_duration_days')::int, 3);

  -- Return everything
  RETURN QUERY SELECT
    v_config.is_beta_active OR v_is_new,
    v_is_new,
    v_install.first_opened_at,
    GREATEST(
      0,
      v_install.has_paid_license::int * 9999 +
      (v_trial_days - EXTRACT(EPOCH FROM (now() - v_install.first_opened_at)) / 86400)
    )::NUMERIC(10,2),
    v_install.has_paid_license,
    v_config.total_beta_users,
    v_config.is_beta_active,
    v_install.first_opened_at <= v_config.updated_at AND v_config.is_beta_active = false,
    v_config.is_service_active,
    v_config.maintenance_message,
    v_license_key;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
