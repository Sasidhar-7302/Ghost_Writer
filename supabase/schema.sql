-- ============================================================
-- Ghost Writer Monetization Schema
-- Run this in Supabase SQL Editor (https://supabase.com/dashboard)
-- ============================================================

-- 1. Global configuration (single row)
CREATE TABLE IF NOT EXISTS global_config (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  is_beta_active BOOLEAN DEFAULT true,
  total_beta_users INTEGER DEFAULT 0,
  beta_limit INTEGER DEFAULT 1000,
  trial_duration_days INTEGER DEFAULT 3,
  is_service_active BOOLEAN DEFAULT true,
  maintenance_message TEXT DEFAULT 'Ghost Writer is currently undergoing maintenance.',
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Ensure trial_duration_days exists if table was created before this version
DO $$ 
BEGIN 
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='global_config' AND column_name='trial_duration_days') THEN
    ALTER TABLE global_config ADD COLUMN trial_duration_days INTEGER DEFAULT 3;
  END IF;
END $$;

INSERT INTO global_config (id) VALUES (1) ON CONFLICT DO NOTHING;

-- 2. Installation tracking
CREATE TABLE IF NOT EXISTS installations (
  machine_id TEXT PRIMARY KEY,
  first_opened_at TIMESTAMPTZ DEFAULT now(),
  has_paid_license BOOLEAN DEFAULT false,
  app_version TEXT,
  os_info TEXT,
  last_seen_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Checkout session bridge (desktop ↔ web ↔ Gumroad)
CREATE TABLE IF NOT EXISTS checkout_sessions (
  session_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  machine_id TEXT REFERENCES installations(machine_id),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'expired')),
  license_key TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ
);

-- 4. Atomic beta registration function
--    Prevents race conditions when multiple users register simultaneously
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
  maintenance_message TEXT,
  license_key TEXT
) AS $$
DECLARE
  v_config RECORD;
  v_install RECORD;
  v_is_new BOOLEAN := false;
  v_license_key TEXT;
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

  -- Return everything needed by the app
  -- Use COALESCE(v_config.trial_duration_days, 3) to protect against runtime issues if the column was somehow missed
  RETURN QUERY SELECT
    v_config.is_beta_active OR v_is_new, -- is_beta
    v_is_new,                            -- is_new_user
    v_install.first_opened_at,           -- first_opened
    GREATEST(0, v_install.has_paid_license::int * 9999 + (COALESCE(v_config.trial_duration_days, 3) - EXTRACT(EPOCH FROM (now() - v_install.first_opened_at)) / 86400))::NUMERIC(10,2), -- remaining_days (large if paid)
    v_install.has_paid_license,          -- has_license
    v_config.total_beta_users,           -- beta_users_count
    v_config.is_beta_active,             -- is_beta_period
    v_install.first_opened_at <= v_config.updated_at AND v_config.is_beta_active = false, -- registered_during_beta
    v_config.is_service_active,          -- is_service_active
    v_config.maintenance_message,        -- maintenance_message
    v_license_key;                       -- license_key
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Row Level Security
ALTER TABLE global_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE installations ENABLE ROW LEVEL SECURITY;
ALTER TABLE checkout_sessions ENABLE ROW LEVEL SECURITY;

-- Public read for config
DROP POLICY IF EXISTS "Anyone can read config" ON global_config;
CREATE POLICY "Anyone can read config"
  ON global_config FOR SELECT USING (true);

-- Allow the RPC function to manage installations (SECURITY DEFINER handles this)
DROP POLICY IF EXISTS "Service can manage installations" ON installations;
CREATE POLICY "Service can manage installations"
  ON installations FOR ALL USING (true);

-- Allow anyone to manage checkout sessions (needed for Realtime + Edge Function)
DROP POLICY IF EXISTS "Anyone can manage checkout sessions" ON checkout_sessions;
CREATE POLICY "Anyone can manage checkout sessions"
  ON checkout_sessions FOR ALL USING (true);

-- 6. Enable Realtime for checkout_sessions
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
    AND schemaname = 'public' 
    AND tablename = 'checkout_sessions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE checkout_sessions;
  END IF;
END $$;

-- 7. Performance Indexes (Enterprise Grade)
CREATE INDEX IF NOT EXISTS idx_installations_paid ON installations(has_paid_license);
CREATE INDEX IF NOT EXISTS idx_checkout_machine ON checkout_sessions(machine_id);
CREATE INDEX IF NOT EXISTS idx_checkout_status ON checkout_sessions(status);
CREATE INDEX IF NOT EXISTS idx_installations_last_seen ON installations(last_seen_at);
