/**
 * License IPC Handlers — Bridge between React UI and LicenseManager
 */
import { ipcMain } from 'electron';
import { LicenseManager } from '../services/LicenseManager';

export function registerLicenseHandlers(): void {
    const safeHandle = (channel: string, handler: (...args: any[]) => any) => {
        try {
            ipcMain.handle(channel, handler);
        } catch (error: any) {
            if (error.message?.includes('Attempted to register a second handler')) {
                console.log(`[IPC] Handler for '${channel}' already registered, skipping`);
            }
        }
    };

    const license = LicenseManager.getInstance();

    // Get the current license state
    safeHandle('get-license-status', async () => {
        const state = license.getState();
        if (state) return state;
        // If not checked yet, do a full check
        return await license.checkLicense();
    });

    // Initiate Gumroad checkout flow
    safeHandle('initiate-checkout', async () => {
        const sessionId = await license.initiateCheckout();
        return { sessionId };
    });

    // Subscribe to checkout completion (called from React after initiateCheckout)
    safeHandle('subscribe-checkout', async (_event, sessionId: string) => {
        return new Promise<{ licenseKey: string }>((resolve) => {
            license.subscribeToCheckout(sessionId, (licenseKey) => {
                resolve({ licenseKey });
            });
        });
    });

    // Manually activate a license key (if user pastes one)
    safeHandle('activate-license', async (_event, licenseKey: string) => {
        const success = await license.activateLicense(licenseKey);
        return { success };
    });

    // Force refresh license status
    safeHandle('refresh-license', async () => {
        return await license.checkLicense();
    });
}
