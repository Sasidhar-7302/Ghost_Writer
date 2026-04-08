-- ============================================================
-- Ghost Writer Enterprise Analytics (Phase 7)
-- Run this in Supabase SQL Editor to enable monetization tracking
-- ============================================================

-- 1. Create a detailed activity log table
CREATE TABLE IF NOT EXISTS activity_logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    machine_id TEXT REFERENCES installations(machine_id),
    event_type TEXT NOT NULL, -- 'ai_interaction', 'meeting_summary', 'app_launch'
    provider TEXT,            -- 'groq', 'gemini', 'anthropic', 'openai'
    model_id TEXT,            -- e.g., 'llama3-70b-8192'
    input_tokens INTEGER DEFAULT 0,
    output_tokens INTEGER DEFAULT 0,
    estimated_cost_usd NUMERIC(10, 6) DEFAULT 0,
    duration_ms INTEGER DEFAULT 0,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Index for fast querying by machine_id (user activity)
CREATE INDEX IF NOT EXISTS idx_activity_machine_id ON activity_logs(machine_id);
CREATE INDEX IF NOT EXISTS idx_activity_event_type ON activity_logs(event_type);

-- 3. Add summary_stats metadata to installations for at-a-glance usage
ALTER TABLE installations 
ADD COLUMN IF NOT EXISTS total_tokens_used BIGINT DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_meetings_summarized INTEGER DEFAULT 0;

-- 4. RPC to log an interaction and update stats atomically
CREATE OR REPLACE FUNCTION log_enterprise_interaction(
    p_machine_id TEXT,
    p_event_type TEXT,
    p_provider TEXT,
    p_model_id TEXT,
    p_input_tokens INTEGER,
    p_output_tokens INTEGER,
    p_cost NUMERIC,
    p_duration_ms INTEGER,
    p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS VOID AS $$
BEGIN
    -- 1. Insert into detailed logs
    INSERT INTO activity_logs (
        machine_id, event_type, provider, model_id, 
        input_tokens, output_tokens, estimated_cost_usd, 
        duration_ms, metadata
    ) VALUES (
        p_machine_id, p_event_type, p_provider, p_model_id, 
        p_input_tokens, p_output_tokens, p_cost, 
        p_duration_ms, p_metadata
    );

    -- 2. Update aggregate stats on the installation
    UPDATE installations SET 
        total_tokens_used = total_tokens_used + p_input_tokens + p_output_tokens,
        total_meetings_summarized = CASE 
            WHEN p_event_type = 'meeting_summary' THEN total_meetings_summarized + 1 
            ELSE total_meetings_summarized 
        END,
        last_active_at = now()
    WHERE machine_id = p_machine_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
