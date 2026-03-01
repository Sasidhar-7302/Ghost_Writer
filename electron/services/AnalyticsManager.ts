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

        // We could log specific meeting duration events here if needed
        this.isMeetingInProgress = false;
        this.meetingStartTime = null;
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
