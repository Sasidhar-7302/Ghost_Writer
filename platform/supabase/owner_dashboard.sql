-- ==========================================
-- GHOST WRITER OWNER DASHBOARD
-- Business Intelligence & Conversion Funnel
-- ==========================================

-- 1. View for Conversion Funnel Analytics
-- tracks: installations -> checkout_started -> checkout_completed (conversion_rate)
CREATE OR REPLACE VIEW v_conversion_funnel AS
WITH stats AS (
    SELECT 
        (SELECT count(*) FROM installations) as total_installs,
        (SELECT count(DISTINCT machine_id) FROM activity_logs WHERE event_type = 'checkout_started') as checkout_starts,
        (SELECT count(*) FROM installations WHERE has_paid_license = true) as total_paid_users
)
SELECT 
    total_installs,
    checkout_starts,
    total_paid_users,
    CASE 
        WHEN total_installs > 0 THEN ROUND((total_paid_users::numeric / total_installs::numeric) * 100, 2)
        ELSE 0 
    END as conversion_rate_percent,
    CASE 
        WHEN checkout_starts > 0 THEN ROUND((total_paid_users::numeric / checkout_starts::numeric) * 100, 2)
        ELSE 0 
    END as checkout_to_paid_rate_percent
FROM stats;

-- 2. View for User Activity Engagement
-- tracks: minutes_active, tokens_used, meetings_summarized
CREATE OR REPLACE VIEW v_user_engagement AS
SELECT 
    machine_id,
    has_paid_license,
    total_active_minutes,
    total_tokens_used,
    total_meetings_summarized,
    last_seen_at,
    first_opened_at as created_at
FROM installations
ORDER BY last_seen_at DESC;

-- 3. View for Token Consumption Trends (Last 30 Days)
CREATE OR REPLACE VIEW v_token_usage_trends AS
SELECT 
    date_trunc('day', created_at) as usage_date,
    provider,
    sum(input_tokens + output_tokens) as total_tokens,
    sum(estimated_cost_usd) as total_cost_estimated
FROM activity_logs
WHERE event_type = 'ai_interaction'
  AND created_at > now() - interval '30 days'
GROUP BY 1, 2
ORDER BY 1 DESC;

-- 4. Helper Function to get Owner Stats directly
CREATE OR REPLACE FUNCTION get_owner_summary()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    result json;
BEGIN
    SELECT json_build_object(
        'total_users', (SELECT count(*) FROM installations),
        'paid_users', (SELECT count(*) FROM installations WHERE has_paid_license = true),
        'total_meetings', (SELECT sum(total_meetings_summarized) FROM installations),
        'total_tokens', (SELECT sum(total_tokens_used) FROM installations)
    ) INTO result;
    RETURN result;
END;
$$;
