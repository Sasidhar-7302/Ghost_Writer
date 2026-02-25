import { ipcMain } from 'electron';
import { CostTracker } from '../utils/costTracker';
import { AppState } from '../main';

export function registerCostHandlers(appState: AppState): void {
    ipcMain.handle('get-usage-stats', async (_, days?: number) => {
        try {
            const costTracker = CostTracker.getInstance();
            const stats = await costTracker.getUsageStats(days || 30);
            return { success: true, stats };
        } catch (error: any) {
            console.error('Error getting usage stats:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('get-session-cost', async (_, sessionId: string) => {
        try {
            const costTracker = CostTracker.getInstance();
            const cost = await costTracker.getSessionCost(sessionId);
            return { success: true, cost };
        } catch (error: any) {
            console.error('Error getting session cost:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('format-cost', async (_, cost: number, currency?: string) => {
        try {
            const costTracker = CostTracker.getInstance();
            const formatted = costTracker.formatCost(cost, currency);
            return { success: true, formatted };
        } catch (error: any) {
            console.error('Error formatting cost:', error);
            return { success: false, error: error.message };
        }
    });
}