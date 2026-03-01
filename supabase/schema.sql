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
  updated_at TIMESTAMPTZ DEFAULT now()
);
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
  beta_users_count INTEGER
) AS $$
DECLARE
  v_config RECORD;
  v_install RECORD;
  v_is_new BOOLEAN := false;
BEGIN
  -- Get current config
  SELECT * INTO v_config FROM global_config WHERE id = 1;

  -- Upsert installation (insert if new, update last_seen if existing)
  INSERT INTO installations (machine_id, app_version, os_info, last_seen_at)
  VALUES (p_machine_id, p_version, p_os, now())
  ON CONFLICT (machine_id) DO UPDATE SET
    last_seen_at = now(),
    app_version = COALESCE(p_version, installations.app_version)
  RETURNING * INTO v_install;

  -- Check if this is a genuinely new user (first_opened_at == last_seen_at means just inserted)
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

  -- Return status
  RETURN QUERY SELECT
    -- is_beta: true if beta is still active OR user registered during beta
    v_config.is_beta_active OR v_is_new,
    v_is_new,
    v_install.first_opened_at,
    -- remaining_days: how many trial days remain (3-day trial)
    GREATEST(0, 3 - EXTRACT(EPOCH FROM (now() - v_install.first_opened_at)) / 86400)::NUMERIC(5,2),
    v_install.has_paid_license,
    v_config.total_beta_users;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Row Level Security
ALTER TABLE global_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE installations ENABLE ROW LEVEL SECURITY;
ALTER TABLE checkout_sessions ENABLE ROW LEVEL SECURITY;

-- Public read for config
CREATE POLICY "Anyone can read config"
  ON global_config FOR SELECT USING (true);

-- Allow the RPC function to manage installations (SECURITY DEFINER handles this)
CREATE POLICY "Service can manage installations"
  ON installations FOR ALL USING (true);

-- Allow anyone to manage checkout sessions (needed for Realtime + Edge Function)
CREATE POLICY "Anyone can manage checkout sessions"
  ON checkout_sessions FOR ALL USING (true);

-- 6. Enable Realtime for checkout_sessions
ALTER PUBLICATION supabase_realtime ADD TABLE checkout_sessions;
