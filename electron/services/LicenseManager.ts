/**
 * LicenseManager - Manages Ghost Writer's licensing, beta tracking, and trial system
 *
 * Licensing States:
 *   'beta'    → Beta is active, user gets free access (temporary, not permanent)
 *   'trial'   → Post-beta user with 3-day free trial
 *   'paid'    → User purchased a Gumroad license key
 *   'expired' → Beta ended (for beta users) or trial expired (for post-beta),
 *              paywall shown — user must pay $9
 *
 * Business Model:
 *   - Beta (users 1-1000): Free ONLY while beta is active
 *   - Once beta ends: ALL users (including 1-1000) must pay
 *   - Post-beta users (1001+): 3-day trial, then paywall
 *
 * Uses Supabase for cloud state (beta counter, checkout sessions)
 * and CredentialsManager for local encrypted caching.
 */

import { app, shell } from 'electron';
import { createClient, SupabaseClient, RealtimeChannel } from '@supabase/supabase-js';
import { CredentialsManager } from './CredentialsManager';
import * as https from 'https';
import * as crypto from 'crypto';

// Supabase configuration
const SUPABASE_URL = 'https://vgsrnsrgfkdssngtpkfg.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZnc3Juc3JnZmtkc3NuZ3Rwa2ZnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIzMTMwNzEsImV4cCI6MjA4Nzg4OTA3MX0.IhJV5T2xOYJBET0bV4fAAYMPBGL7l4RSxNjjpqPaj48';

// Gumroad configuration
const GUMROAD_PRODUCT_PERMALINK = 'uwqkn';
const GUMROAD_VERIFY_URL = 'https://api.gumroad.com/v2/licenses/verify';

export interface LicenseState {
    status: 'beta' | 'trial' | 'paid' | 'expired';
    remainingDays: number;      // Days left in trial (0 if beta/paid/expired)
    isBetaUser: boolean;        // Was this user in the first 1000
    betaUsersCount: number;     // How many beta users so far
    machineId: string;
    licenseKey?: string;        // Gumroad license key if paid
    isServiceActive?: boolean;  // Remote kill switch
    maintenanceMessage?: string; // Custom maintenance alert
}

export class LicenseManager {
    private static instance: LicenseManager;
    private supabase: SupabaseClient;
    private credentials: CredentialsManager;
    private machineId: string = '';
    private currentState: LicenseState | null = null;
    private realtimeChannel: RealtimeChannel | null = null;
    private pollInterval: NodeJS.Timeout | null = null;
    private onLicenseActivated: ((state: LicenseState) => void) | null = null;

    private constructor() {
        this.supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        this.credentials = CredentialsManager.getInstance();
    }

    public static getInstance(): LicenseManager {
        if (!LicenseManager.instance) {
            LicenseManager.instance = new LicenseManager();
        }
        return LicenseManager.instance;
    }

    public setOnLicenseActivated(callback: (state: LicenseState) => void): void {
        this.onLicenseActivated = callback;
    }

    /**
     * Initialize and check license status on app startup.
     * Returns the current license state.
     */
    public async checkLicense(): Promise<LicenseState> {
        try {
            // 1. Get or generate machine ID
            this.machineId = await this.getMachineId();

            // 2. Check for existing paid license locally (fast path)
            const localKey = this.credentials.getLicenseKey();
            if (localKey) {
                const verified = await this.verifyGumroadLicense(localKey);
                if (verified) {
                    this.currentState = {
                        status: 'paid',
                        remainingDays: 0,
                        isBetaUser: false,
                        betaUsersCount: 0,
                        machineId: this.machineId,
                        licenseKey: localKey,
                    };
                    console.log('[LicenseManager] ✅ Paid license verified locally');
                    return this.currentState;
                } else {
                    console.warn('[LicenseManager] Local license key failed verification, checking cloud...');
                }
            }

            // 3. Check with Supabase (beta/trial determination)
            const cloudState = await this.checkCloudLicense();
            this.currentState = cloudState;

            // Cache the status locally
            this.credentials.setLicenseStatus(cloudState.status);
            if (cloudState.licenseKey) {
                this.credentials.setLicenseKey(cloudState.licenseKey);
            }

            console.log(`[LicenseManager] License status: ${cloudState.status} (remaining: ${cloudState.remainingDays.toFixed(1)} days)`);
            return cloudState;

        } catch (err: any) {
            console.error('[LicenseManager] License check failed:', err?.message);

            // Offline fallback: use cached local status
            const cachedStatus = this.credentials.getLicenseStatus();
            const cachedKey = this.credentials.getLicenseKey();

            this.currentState = {
                status: cachedKey ? 'paid' : cachedStatus,
                remainingDays: cachedStatus === 'trial' ? 1 : 0, // Give benefit of doubt offline
                isBetaUser: cachedStatus === 'beta',
                betaUsersCount: 0,
                machineId: this.machineId,
                licenseKey: cachedKey,
            };

            console.log(`[LicenseManager] Using cached status: ${this.currentState.status}`);
            return this.currentState;
        }
    }

    /**
     * Get the current license state (cached, no network call)
     */
    public getState(): LicenseState | null {
        return this.currentState;
    }

    /**
     * Initiate a checkout session.
     * Creates a session in Supabase and opens the Gumroad checkout URL.
     * Returns the session ID for Realtime listening.
     */
    public async initiateCheckout(): Promise<string> {
        const sessionId = crypto.randomUUID();

        // Insert checkout session into Supabase
        const { error } = await this.supabase
            .from('checkout_sessions')
            .insert({
                session_id: sessionId,
                machine_id: this.machineId,
                status: 'pending',
            });

        if (error) {
            console.error('[LicenseManager] Failed to create checkout session:', error.message);
            throw new Error('Failed to create checkout session');
        }

        // Open Gumroad checkout in default browser with session_id and machine_id as URL params
        // We use both standard params and select_ fields for triple redundancy
        const checkoutUrl = `https://sasiwave04.gumroad.com/l/${GUMROAD_PRODUCT_PERMALINK}?wanted=true&session_id=${sessionId}&machine_id=${this.machineId}&select_session_id=${sessionId}&select_machine_id=${this.machineId}`;
        console.log(`[LicenseManager] Opening checkout: ${checkoutUrl}`);
        await shell.openExternal(checkoutUrl);

        // Start background monitoring automatically so that banners/buttons 
        // outside the Paywall component still trigger an instant unlock.
        this.subscribeToCheckout(sessionId, (licenseKey) => {
            if (licenseKey) {
                console.log('[LicenseManager] Background checkout auto-unlock successful');
            }
        });

        return sessionId;
    }

    /**
     * Subscribe to Realtime updates for a checkout session.
     * When Gumroad webhook fires, the Edge Function updates the session,
     * which triggers this callback.
     */
    public subscribeToCheckout(sessionId: string, onComplete: (licenseKey: string) => void): void {
        this.stopCheckoutMonitoring();

        // Safety timeout - 2 mins total
        const timeout = setTimeout(() => {
            console.warn(`[LicenseManager] Checkout monitoring timed out for ${sessionId}`);
            this.stopCheckoutMonitoring();
            onComplete('');
        }, 120000);

        // 1. Realtime (Instant)
        this.realtimeChannel = this.supabase
            .channel(`checkout-${sessionId}`)
            .on(
                'postgres_changes',
                {
                    event: 'UPDATE',
                    schema: 'public',
                    table: 'checkout_sessions',
                    filter: `session_id=eq.${sessionId}`,
                },
                (payload: any) => {
                    const { status, license_key } = payload.new;
                    if (status === 'completed' && license_key) {
                        console.log('[LicenseManager] ✅ Checkout completed (via Realtime)!');
                        clearTimeout(timeout);
                        this.stopCheckoutMonitoring();
                        this.activateLicense(license_key);
                        onComplete(license_key);
                    }
                }
            )
            .subscribe((subStatus) => {
                console.log(`[LicenseManager] Realtime status for ${sessionId}: ${subStatus}`);
            });

        // 2. Polling (Reliable Fallback - every 5s)
        this.pollInterval = setInterval(async () => {
            console.log(`[LicenseManager] Polling session: ${sessionId.substring(0, 8)}...`);
            try {
                const { data, error } = await this.supabase
                    .from('checkout_sessions')
                    .select('status, license_key')
                    .eq('session_id', sessionId)
                    .maybeSingle();

                if (!error && data && data.status === 'completed' && data.license_key) {
                    console.log('[LicenseManager] ✅ Checkout completed (via Polling)!');
                    clearTimeout(timeout);
                    this.stopCheckoutMonitoring();
                    this.activateLicense(data.license_key);
                    onComplete(data.license_key);
                }
            } catch (err) {
                console.error('[LicenseManager] Polling error:', err);
            }
        }, 5000);

        console.log(`[LicenseManager] Monitoring checkout: ${sessionId}`);
    }

    /**
     * Stop all checkout monitoring (Realtime + Polling)
     */
    private stopCheckoutMonitoring(): void {
        if (this.realtimeChannel) {
            this.supabase.removeChannel(this.realtimeChannel);
            this.realtimeChannel = null;
        }
        if (this.pollInterval) {
            clearInterval(this.pollInterval);
            this.pollInterval = null;
        }
    }

    /**
     * Unsubscribe from Realtime updates (legacy compatibility)
     */
    public unsubscribeFromCheckout(): void {
        this.stopCheckoutMonitoring();
    }

    /**
     * Activate a license key (save locally + update cloud)
     */
    public async activateLicense(licenseKey: string): Promise<boolean> {
        try {
            // Verify with Gumroad first
            const isValid = await this.verifyGumroadLicense(licenseKey);
            if (!isValid) {
                console.warn('[LicenseManager] License key verification failed');
                return false;
            }

            // Save locally
            this.credentials.setLicenseKey(licenseKey);
            this.credentials.setLicenseStatus('paid');

            // Update cloud
            await this.supabase
                .from('installations')
                .update({ has_paid_license: true })
                .eq('machine_id', this.machineId);

            // Update in-memory state
            this.currentState = {
                status: 'paid',
                remainingDays: 0,
                isBetaUser: this.currentState?.isBetaUser || false,
                betaUsersCount: this.currentState?.betaUsersCount || 0,
                machineId: this.machineId,
                licenseKey,
            };

            console.log('[LicenseManager] ✅ License activated successfully');

            // Notify callback if registered
            if (this.onLicenseActivated && this.currentState) {
                this.onLicenseActivated(this.currentState);
            }

            return true;
        } catch (err: any) {
            console.error('[LicenseManager] License activation error:', err?.message);
            return false;
        }
    }

    // =========================================================================
    // Private Methods
    // =========================================================================

    /**
     * Generate or retrieve a stable machine ID.
     */
    private async getMachineId(): Promise<string> {
        // Check cached first
        const cached = this.credentials.getMachineId();
        if (cached) return cached;

        try {
            const { machineIdSync } = require('node-machine-id');
            const id = machineIdSync(true); // true = original (not hashed)
            this.credentials.setMachineId(id);
            return id;
        } catch (err) {
            // Fallback: generate a persistent UUID
            console.warn('[LicenseManager] node-machine-id failed, generating fallback ID');
            const fallbackId = `gw-${crypto.randomUUID()}`;
            this.credentials.setMachineId(fallbackId);
            return fallbackId;
        }
    }

    /**
     * Check license status via Supabase RPC
     */
    private async checkCloudLicense(): Promise<LicenseState> {
        // Force version to 2.0.1 to avoid Electron-version reporting in dev
        const appVersion = app.getVersion();
        const osInfo = `${process.platform}-${process.arch}`;

        const { data, error } = await this.supabase.rpc('register_beta_user', {
            p_machine_id: this.machineId,
            p_version: appVersion,
            p_os: osInfo,
        });

        if (error) {
            console.error('[LicenseManager] Supabase RPC failed:', error.message);
            throw new Error(`Supabase RPC failed: ${error.message}`);
        }

        const result = data?.[0] || data;

        if (!result) {
            throw new Error('No data returned from register_beta_user');
        }

        const {
            is_beta,
            is_new_user,
            first_opened,
            remaining_days,
            has_license,
            beta_users_count,
            is_beta_period,
            registered_during_beta,
            is_service_active,
            maintenance_message,
            license_key,
        } = result;

        // Determine status — corrected business logic:
        // - Beta users get free access ONLY while beta is active
        // - Once beta ends, ALL users (including 1-1000) must pay
        // - Post-beta users get 3-day trial before paywall
        let status: LicenseState['status'];
        let reportedRemainingDays = parseFloat(remaining_days) || 0;

        if (has_license) {
            status = 'paid';
        } else if (is_beta_period) {
            // Beta is still running — full free access for everyone
            status = 'beta';
            reportedRemainingDays = 3;
        } else if (reportedRemainingDays > 0) {
            // Beta ended, or they are a new user. 
            // Give them the standard 3-day trial period.
            status = 'trial';
        } else {
            // Trial has fully expired, show paywall
            status = 'expired';
        }

        if (is_new_user) {
            this.credentials.setBetaRegisteredAt(first_opened);
            console.log(`[LicenseManager] New user registered! Beta users: ${beta_users_count}`);
        }

        return {
            status,
            remainingDays: reportedRemainingDays,
            isBetaUser: registered_during_beta || false,
            betaUsersCount: beta_users_count || 0,
            machineId: this.machineId,
            licenseKey: license_key,
            isServiceActive: is_service_active ?? true,
            maintenanceMessage: maintenance_message || 'Service is currently unavailable.'
        };
    }

    /**
     * Verify a Gumroad license key via their API
     */
    private verifyGumroadLicense(licenseKey: string): Promise<boolean> {
        return new Promise((resolve) => {
            const postData = `product_id=${GUMROAD_PRODUCT_PERMALINK}&license_key=${encodeURIComponent(licenseKey)}`;

            const options: https.RequestOptions = {
                hostname: 'api.gumroad.com',
                path: '/v2/licenses/verify',
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Content-Length': Buffer.byteLength(postData),
                },
                timeout: 10000,
            };

            const req = https.request(options, (res) => {
                const chunks: Buffer[] = [];
                res.on('data', (chunk: Buffer) => chunks.push(chunk));
                res.on('end', () => {
                    try {
                        const body = JSON.parse(Buffer.concat(chunks).toString());
                        if (body.success === true) {
                            console.log('[LicenseManager] Gumroad license verified ✅');
                            resolve(true);
                        } else {
                            console.warn('[LicenseManager] Gumroad license invalid:', body.message);
                            resolve(false);
                        }
                    } catch {
                        resolve(false);
                    }
                });
            });

            req.on('error', (err) => {
                console.warn('[LicenseManager] Gumroad verification failed (network):', err.message);
                // Be generous on network failure — accept the key
                resolve(true);
            });

            req.on('timeout', () => {
                req.destroy();
                resolve(true); // Accept on timeout
            });

            req.write(postData);
            req.end();
        });
    }
}
