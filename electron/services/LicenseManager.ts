/**
 * LicenseManager - Manages Ghost Writer's licensing, beta tracking, and trial system
 */

import { app, shell } from 'electron';
import { createClient, SupabaseClient, RealtimeChannel } from '@supabase/supabase-js';
import { isBetaFreeLaunch, launchConfig } from '../config/launchConfig';
import type { LicenseVerificationRecord } from '../llm/promptTypes';
import { CredentialsManager } from './CredentialsManager';
import { AnalyticsManager } from './AnalyticsManager';
import { DatabaseManager } from '../db/DatabaseManager';
import * as https from 'https';
import * as crypto from 'crypto';

const LICENSE_GRACE_PERIOD_DAYS = 7;

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
        this.supabase = createClient(
            launchConfig.remoteServices.supabaseUrl,
            launchConfig.remoteServices.supabaseAnonKey
        );
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
     */
    public async checkLicense(): Promise<LicenseState> {
        try {
            this.machineId = await this.getMachineId();

            if (isBetaFreeLaunch()) {
                const betaState = await this.getBetaLaunchState();
                this.currentState = betaState;
                this.credentials.setLicenseStatus('beta');
                this.credentials.setLicenseVerificationRecord({
                    status: 'disabled',
                    verifiedAt: new Date().toISOString(),
                    source: 'beta-free'
                });
                return betaState;
            }

            const localKey = this.credentials.getLicenseKey();
            if (localKey) {
                const verification = await this.verifyGumroadLicense(localKey);
                if (verification.valid) {
                    this.cacheVerifiedLicense('gumroad');
                    this.currentState = {
                        status: 'paid',
                        remainingDays: 0,
                        isBetaUser: false,
                        betaUsersCount: 0,
                        machineId: this.machineId,
                        licenseKey: localKey,
                    };
                    return this.currentState;
                }
            }

            const cloudState = await this.checkCloudLicense();
            this.currentState = cloudState;
            this.credentials.setLicenseStatus(cloudState.status);
            if (cloudState.licenseKey) {
                this.credentials.setLicenseKey(cloudState.licenseKey);
                this.cacheVerifiedLicense('supabase');
            }

            return cloudState;
        } catch (err: any) {
            const cachedStatus = this.credentials.getLicenseStatus();
            const cachedKey = this.credentials.getLicenseKey();
            this.currentState = {
                status: cachedKey ? 'paid' : cachedStatus,
                remainingDays: cachedStatus === 'trial' ? 1 : 0,
                isBetaUser: cachedStatus === 'beta',
                betaUsersCount: 0,
                machineId: this.machineId,
                licenseKey: cachedKey,
            };
            return this.currentState;
        }
    }

    public getState(): LicenseState | null {
        return this.currentState;
    }

    public async initiateCheckout(): Promise<string> {
        if (isBetaFreeLaunch()) throw new Error('Checkout is disabled.');
        const sessionId = crypto.randomUUID();
        await this.supabase.from('checkout_sessions').insert({
            session_id: sessionId,
            machine_id: this.machineId,
            status: 'pending',
        });
        const checkoutUrl = `https://sasiwave04.gumroad.com/l/${launchConfig.remoteServices.gumroadProductPermalink}?wanted=true&session_id=${sessionId}&machine_id=${this.machineId}&select_session_id=${sessionId}&select_machine_id=${this.machineId}`;
        await shell.openExternal(checkoutUrl);
        this.subscribeToCheckout(sessionId, (licenseKey) => {
            if (licenseKey) AnalyticsManager.getInstance().reportBusinessEvent('checkout_completed', { source: 'auto_monitor' });
        });
        AnalyticsManager.getInstance().reportBusinessEvent('checkout_started', { sessionId });
        return sessionId;
    }

    public subscribeToCheckout(sessionId: string, onComplete: (licenseKey: string) => void): void {
        this.stopCheckoutMonitoring();
        const timeout = setTimeout(() => {
            this.stopCheckoutMonitoring();
            onComplete('');
        }, 120000);

        this.realtimeChannel = this.supabase
            .channel(`checkout-${sessionId}`)
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'checkout_sessions', filter: `session_id=eq.${sessionId}` }, (payload: any) => {
                const { status, license_key } = payload.new;
                if (status === 'completed' && license_key) {
                    clearTimeout(timeout);
                    this.stopCheckoutMonitoring();
                    this.activateLicense(license_key);
                    onComplete(license_key);
                }
            })
            .subscribe();

        this.pollInterval = setInterval(async () => {
            try {
                const { data } = await this.supabase.from('checkout_sessions').select('status, license_key').eq('session_id', sessionId).maybeSingle();
                if (data && data.status === 'completed' && data.license_key) {
                    clearTimeout(timeout);
                    this.stopCheckoutMonitoring();
                    this.activateLicense(data.license_key);
                    onComplete(data.license_key);
                }
            } catch (err) {}
        }, 5000);
    }

    private stopCheckoutMonitoring(): void {
        if (this.realtimeChannel) { this.supabase.removeChannel(this.realtimeChannel); this.realtimeChannel = null; }
        if (this.pollInterval) { clearInterval(this.pollInterval); this.pollInterval = null; }
    }

    public async activateLicense(licenseKey: string): Promise<boolean> {
        try {
            if (isBetaFreeLaunch()) return false;
            const verification = await this.verifyGumroadLicense(licenseKey);
            if (!verification.valid) return false;

            this.credentials.setLicenseKey(licenseKey);
            this.credentials.setLicenseStatus('paid');
            this.cacheVerifiedLicense('manual');

            await this.supabase.from('installations').update({ has_paid_license: true }).eq('machine_id', this.machineId);
            AnalyticsManager.getInstance().reportBusinessEvent('checkout_completed', { source: 'activation', licenseKey: licenseKey.substring(0, 8) + '...' });

            this.currentState = {
                status: 'paid',
                remainingDays: 0,
                isBetaUser: this.currentState?.isBetaUser || false,
                betaUsersCount: this.currentState?.betaUsersCount || 0,
                machineId: this.machineId,
                licenseKey,
            };

            if (this.onLicenseActivated && this.currentState) this.onLicenseActivated(this.currentState);
            return true;
        } catch (err: any) { return false; }
    }

    private async getMachineId(): Promise<string> {
        const cached = this.credentials.getMachineId();
        if (cached) return cached;
        try {
            const { machineIdSync } = require('node-machine-id');
            const id = machineIdSync(true);
            this.credentials.setMachineId(id);
            return id;
        } catch (err) {
            const fallbackId = `gw-${crypto.randomUUID()}`;
            this.credentials.setMachineId(fallbackId);
            return fallbackId;
        }
    }

    private async checkCloudLicense(): Promise<LicenseState> {
        const appVersion = app.getVersion();
        const osInfo = `${process.platform}-${process.arch}`;
        
        const profile = DatabaseManager.getInstance().getUserProfile();
        const fullName = profile?.fullName || '';
        const email = profile?.email || '';

        const { data, error } = await this.supabase.rpc('register_beta_user', {
            p_machine_id: this.machineId,
            p_version: appVersion,
            p_os: osInfo,
            p_full_name: fullName,
            p_email: email,
        });

        if (error) throw new Error(`Supabase RPC failed: ${error.message}`);
        const result = data?.[0] || data;
        if (!result) throw new Error('No data returned.');

        const { is_new_user, first_opened, remaining_days, has_license, beta_users_count, is_beta_period, registered_during_beta, is_service_active, maintenance_message, license_key } = result;

        let status: LicenseState['status'];
        let reportedRemainingDays = parseFloat(remaining_days) || 0;

        if (has_license) { status = 'paid'; }
        else if (is_beta_period) { status = 'beta'; reportedRemainingDays = 3; }
        else if (reportedRemainingDays > 0) { status = 'trial'; }
        else { status = 'expired'; }

        if (is_new_user) this.credentials.setBetaRegisteredAt(first_opened);

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

    private async getBetaLaunchState(): Promise<LicenseState> {
        try {
            return await this.checkCloudLicense();
        } catch {
            return { status: 'beta', remainingDays: 0, isBetaUser: true, betaUsersCount: 0, machineId: this.machineId, isServiceActive: true, maintenanceMessage: '' };
        }
    }

    private verifyGumroadLicense(licenseKey: string): Promise<{ valid: boolean; failureReason?: string }> {
        return new Promise((resolve) => {
            const postData = `product_id=${launchConfig.remoteServices.gumroadProductPermalink}&license_key=${encodeURIComponent(licenseKey)}`;
            const options: https.RequestOptions = {
                hostname: 'api.gumroad.com',
                path: '/v2/licenses/verify',
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(postData) },
                timeout: 10000,
            };
            const req = https.request(options, (res) => {
                const chunks: Buffer[] = [];
                res.on('data', (chunk: Buffer) => chunks.push(chunk));
                res.on('end', () => {
                    try {
                        const body = JSON.parse(Buffer.concat(chunks).toString());
                        if (body.success === true) resolve({ valid: true });
                        else resolve({ valid: false, failureReason: body.message || 'invalid_license' });
                    } catch { resolve({ valid: false, failureReason: 'invalid_response' }); }
                });
            });
            req.on('error', () => resolve({ valid: false, failureReason: 'network' }));
            req.on('timeout', () => { req.destroy(); resolve({ valid: false, failureReason: 'timeout' }); });
            req.write(postData);
            req.end();
        });
    }

    private cacheVerifiedLicense(source: LicenseVerificationRecord['source']): void {
        const now = new Date();
        this.credentials.setLicenseVerificationRecord({
            status: 'verified',
            verifiedAt: now.toISOString(),
            graceUntil: new Date(now.getTime() + LICENSE_GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000).toISOString(),
            source
        });
    }
}
