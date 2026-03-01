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

        // Open Gumroad checkout in default browser with session_id as URL param
        // Gumroad includes URL params in the webhook payload under 'url_params'
        const checkoutUrl = `https://sasiwave04.gumroad.com/l/${GUMROAD_PRODUCT_PERMALINK}?wanted=true&session_id=${sessionId}`;
        console.log(`[LicenseManager] Opening checkout: ${checkoutUrl}`);
        await shell.openExternal(checkoutUrl);

        return sessionId;
    }

    /**
     * Subscribe to Realtime updates for a checkout session.
     * When Gumroad webhook fires, the Edge Function updates the session,
     * which triggers this callback.
     */
    public subscribeToCheckout(sessionId: string, onComplete: (licenseKey: string) => void): void {
        // Clean up any existing subscription
        if (this.realtimeChannel) {
            this.supabase.removeChannel(this.realtimeChannel);
        }

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
                        console.log('[LicenseManager] ✅ Checkout completed! License key received.');
                        this.activateLicense(license_key);
                        onComplete(license_key);
                    }
                }
            )
            .subscribe();

        console.log(`[LicenseManager] Listening for checkout completion: ${sessionId}`);
    }

    /**
     * Unsubscribe from Realtime updates
     */
    public unsubscribeFromCheckout(): void {
        if (this.realtimeChannel) {
            this.supabase.removeChannel(this.realtimeChannel);
            this.realtimeChannel = null;
        }
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
        const appVersion = '2.0.1';
        const osInfo = `${process.platform}-${process.arch}`;

        const { data, error } = await this.supabase.rpc('register_beta_user', {
            p_machine_id: this.machineId,
            p_version: appVersion,
            p_os: osInfo,
        });

        if (error) {
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
        } = result;

        // Determine status — corrected business logic:
        // - Beta users get free access ONLY while beta is active
        // - Once beta ends, ALL users (including 1-1000) must pay
        // - Post-beta users get 3-day trial before paywall
        let status: LicenseState['status'];
        if (has_license) {
            status = 'paid';
        } else if (is_beta_period) {
            // Beta is still running — free for everyone
            status = 'beta';
        } else if (registered_during_beta) {
            // Beta user but beta ended — must pay (no trial, direct paywall)
            status = 'expired';
        } else if (remaining_days > 0) {
            // Post-beta user with trial days remaining
            status = 'trial';
        } else {
            // Post-beta user with trial expired
            status = 'expired';
        }

        if (is_new_user) {
            this.credentials.setBetaRegisteredAt(first_opened);
            console.log(`[LicenseManager] New user registered! Beta users: ${beta_users_count}`);
        }

        return {
            status,
            remainingDays: parseFloat(remaining_days) || 0,
            isBetaUser: registered_during_beta || false,
            betaUsersCount: beta_users_count || 0,
            machineId: this.machineId,
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
