import { SupabaseClient, createClient } from '@supabase/supabase-js';
import { LicenseManager } from './LicenseManager';

const SUPABASE_URL = 'https://vgsrnsrgfkdssngtpkfg.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZnc3Juc3JnZmtkc3NuZ3Rwa2ZnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIzMTMwNzEsImV4cCI6MjA4Nzg4OTA3MX0.IhJV5T2xOYJBET0bV4fAAYMPBGL7l4RSxNjjpqPaj48';

const HEARTBEAT_INTERVAL_MS = 1000 * 60 * 5; // 5 minutes

export class AnalyticsManager {
    private static instance: AnalyticsManager;
    private supabase: SupabaseClient;
    private heartbeatInterval: NodeJS.Timeout | null = null;
    private isMeetingInProgress: boolean = false;
    private meetingStartTime: number | null = null;

    private constructor() {
        this.supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    }

    public static getInstance(): AnalyticsManager {
        if (!AnalyticsManager.instance) {
            AnalyticsManager.instance = new AnalyticsManager();
        }
        return AnalyticsManager.instance;
    }

    /**
     * Start the analytics tracking (heartbeat)
     */
    public startTracking(): void {
        if (this.heartbeatInterval) return;

        console.log('[AnalyticsManager] Starting usage tracking heartbeat...');

        // Initial heartbeat (doesn't add time, just updates last_seen)
        this.sendHeartbeat(0);

        this.heartbeatInterval = setInterval(() => {
            const minutesToAdd = 5;
            this.sendHeartbeat(minutesToAdd);
        }, HEARTBEAT_INTERVAL_MS);
    }

    /**
     * Stop tracking (cleanup)
     */
    public stopTracking(): void {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }
    }

    /**
     * Notify analytics that a meeting has started
     */
    public onMeetingStarted(): void {
        this.isMeetingInProgress = true;
        this.meetingStartTime = Date.now();
        console.log('[AnalyticsManager] Meeting started tracking...');
    }

    /**
     * Notify analytics that a meeting has ended
     */
    public onMeetingEnded(): void {
        if (!this.isMeetingInProgress || !this.meetingStartTime) return;

        const durationSeconds = (Date.now() - this.meetingStartTime) / 1000;
        const durationMinutes = Math.round(durationSeconds / 60);

        console.log(`[AnalyticsManager] Meeting ended. Duration: ${durationMinutes} minutes.`);

        // Report to Enterprise Analytics (metadata only)
        this.reportMeetingSession({
            duration_ms: Math.round(durationSeconds * 1000),
            summary_status: 'complete'
        });

        this.isMeetingInProgress = false;
        this.meetingStartTime = null;
    }

    /**
     * Report an LLM interaction (tokens, provider, cost)
     */
    public async reportInteraction(params: {
        eventType?: string;
        provider: string;
        modelId: string;
        inputTokens: number;
        outputTokens: number;
        cost: number;
        durationMs: number;
        metadata?: any;
    }): Promise<void> {
        try {
            const license = LicenseManager.getInstance();
            const state = license.getState();
            if (!state || !state.machineId) return;

            const { error } = await this.supabase.rpc('log_enterprise_interaction', {
                p_machine_id: state.machineId,
                p_event_type: params.eventType || 'ai_interaction',
                p_provider: params.provider,
                p_model_id: params.modelId,
                p_input_tokens: params.inputTokens,
                p_output_tokens: params.outputTokens,
                p_cost: params.cost,
                p_duration_ms: params.durationMs,
                p_metadata: params.metadata || {}
            });

            if (error) {
                // If RPC doesn't exist yet, we fail silently to not disrupt the app
                if (error.code === 'P0001' || error.message.includes('function does not exist')) {
                    console.warn('[AnalyticsManager] log_enterprise_interaction RPC not found. Skipping.');
                } else {
                    console.error('[AnalyticsManager] Interaction logging failed:', error.message);
                }
            }
        } catch (err: any) {
            console.error('[AnalyticsManager] Interaction logging error:', err?.message);
        }
    }

    /**
     * Report a meeting session summary event
     */
    public async reportMeetingSession(params: {
        duration_ms: number;
        summary_status: string;
        metadata?: any;
    }): Promise<void> {
        try {
            const license = LicenseManager.getInstance();
            const state = license.getState();
            if (!state || !state.machineId) return;

            await this.supabase.rpc('log_enterprise_interaction', {
                p_machine_id: state.machineId,
                p_event_type: 'meeting_summary',
                p_provider: 'none',
                p_model_id: 'none',
                p_input_tokens: 0,
                p_output_tokens: 0,
                p_cost: 0,
                p_duration_ms: params.duration_ms,
                p_metadata: {
                    ...params.metadata,
                    status: params.summary_status
                }
            });
        } catch (err) {
            // Silently fail if DB not prepared
        }
    }

    /**
     * Report a business event (e.g., checkout_started, checkout_completed)
     */
    public async reportBusinessEvent(eventType: string, metadata?: any): Promise<void> {
        try {
            const license = LicenseManager.getInstance();
            const state = license.getState();
            if (!state || !state.machineId) return;

            await this.supabase.rpc('log_enterprise_interaction', {
                p_machine_id: state.machineId,
                p_event_type: eventType,
                p_provider: 'none',
                p_model_id: 'none',
                p_input_tokens: 0,
                p_output_tokens: 0,
                p_cost: 0,
                p_duration_ms: 0,
                p_metadata: metadata || {}
            });
            console.log(`[AnalyticsManager] Business event reported: ${eventType}`);
        } catch (err) {
            // Silently fail to protect user experience
        }
    }

    /**
     * Send heartbeat to Supabase RPC
     */
    private async sendHeartbeat(minutes: number): Promise<void> {
        try {
            const license = LicenseManager.getInstance();
            const state = license.getState();

            if (!state || !state.machineId) {
                // If license manager hasn't initialized yet, try to wait or skip
                return;
            }

            const { error } = await this.supabase.rpc('update_analytics_heartbeat', {
                p_machine_id: state.machineId,
                p_minutes_to_add: minutes
            });

            if (error) {
                console.error('[AnalyticsManager] Heartbeat failed:', error.message);
            } else {
                console.log(`[AnalyticsManager] Heartbeat sent (+${minutes}m)`);
            }
        } catch (err: any) {
            console.error('[AnalyticsManager] Heartbeat error:', err?.message);
        }
    }
}
