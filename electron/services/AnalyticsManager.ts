import { SupabaseClient, createClient } from '@supabase/supabase-js';
import { launchConfig } from '../config/launchConfig';
import { CredentialsManager } from './CredentialsManager';
import { LicenseManager } from './LicenseManager';

const HEARTBEAT_INTERVAL_MS = 1000 * 60 * 5; // 5 minutes

export class AnalyticsManager {
    private static instance: AnalyticsManager;
    private supabase: SupabaseClient;
    private heartbeatInterval: NodeJS.Timeout | null = null;
    private isMeetingInProgress: boolean = false;
    private meetingStartTime: number | null = null;
    private currentMode: 'meeting' | 'interview' = 'meeting';

    private constructor() {
        this.supabase = createClient(
            launchConfig.remoteServices.supabaseUrl,
            launchConfig.remoteServices.supabaseAnonKey
        );
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
        if (!this.isTelemetryEnabled()) {
            this.stopTracking();
            return;
        }

        if (this.heartbeatInterval) return;

        console.log('[AnalyticsManager] Starting usage tracking heartbeat...');

        // Initial heartbeat (doesn't add time, just updates last_seen)
        this.sendHeartbeat(0);

        this.heartbeatInterval = setInterval(() => {
            const minutesToAdd = 5;
            const mode = this.isMeetingInProgress ? this.currentMode : undefined;
            this.sendHeartbeat(minutesToAdd, mode);
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
    public onMeetingStarted(mode: 'meeting' | 'interview' = 'meeting'): void {
        if (!this.isTelemetryEnabled()) return;
        this.isMeetingInProgress = true;
        this.currentMode = mode;
        this.meetingStartTime = Date.now();
        console.log(`[AnalyticsManager] ${mode} started tracking...`);
    }

    /**
     * Notify analytics that a meeting has ended
     */
    public onMeetingEnded(): void {
        if (!this.isTelemetryEnabled()) return;
        if (!this.isMeetingInProgress || !this.meetingStartTime) return;

        const durationSeconds = (Date.now() - this.meetingStartTime) / 1000;
        const durationMinutes = Math.round(durationSeconds / 60);

        console.log(`[AnalyticsManager] ${this.currentMode} ended. Duration: ${durationMinutes} minutes.`);

        // Report to Enterprise Analytics (metadata only)
        this.reportMeetingSession({
            duration_ms: Math.round(durationSeconds * 1000),
            summary_status: 'complete',
            metadata: { mode: this.currentMode }
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
        if (!this.isTelemetryEnabled()) return;
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
        if (!this.isTelemetryEnabled()) return;
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
        if (!this.isTelemetryEnabled()) return;
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
    private async sendHeartbeat(minutes: number, mode?: string): Promise<void> {
        if (!this.isTelemetryEnabled()) return;
        try {
            const license = LicenseManager.getInstance();
            const state = license.getState();

            if (!state || !state.machineId) {
                // If license manager hasn't initialized yet, try to wait or skip
                return;
            }

            const { error } = await this.supabase.rpc('update_analytics_heartbeat', {
                p_machine_id: state.machineId,
                p_minutes_to_add: minutes,
                p_mode: mode || null
            });

            if (error) {
                console.error('[AnalyticsManager] Heartbeat failed:', error.message);
            } else {
                console.log(`[AnalyticsManager] Heartbeat sent (+${minutes}m${mode ? `, mode: ${mode}` : ''})`);
            }
        } catch (err: any) {
            console.error('[AnalyticsManager] Heartbeat error:', err?.message);
        }
    }

    private isTelemetryEnabled(): boolean {
        try {
            return CredentialsManager.getInstance().getTelemetryEnabled();
        } catch {
            return launchConfig.telemetryDefaultEnabled;
        }
    }
}
