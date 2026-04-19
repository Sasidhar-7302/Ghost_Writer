/**
 * License IPC Handlers — Bridge between React UI and LicenseManager
 */
import { ipcMain, BrowserWindow } from 'electron';
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

    // Notify all windows when license is activated
    license.setOnLicenseActivated((state) => {
        BrowserWindow.getAllWindows().forEach((win) => {
            if (!win.isDestroyed()) {
                win.webContents.send('license-status-updated', state);
            }
        });
    });

    // Get the current license state (always refreshed from cloud/cache)
    safeHandle('get-license-status', async () => {
        return await license.checkLicense();
    });

    // Initiate Gumroad checkout flow
    safeHandle('initiate-checkout', async () => {
        try {
            const sessionId = await license.initiateCheckout();
            return { success: true, sessionId };
        } catch (error: any) {
            return { success: false, error: error.message };
        }
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
        return { success, error: success ? undefined : 'License activation failed or is disabled for this launch mode.' };
    });

    // Force refresh license status
    safeHandle('refresh-license', async () => {
        return await license.checkLicense();
    });
}
