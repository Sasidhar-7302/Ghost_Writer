import { ipcMain } from 'electron';
import { GPUHelper } from '../utils/GPUHelper';
import axios from 'axios';

export function setupSystemHandlers() {
    // 1. GPU Information
    ipcMain.handle('get-gpu-info', async () => {
        try {
            const gpu = await GPUHelper.detectGPU();
            return {
                success: true,
                info: gpu
            };
        } catch (error: any) {
            return {
                success: false,
                error: error.message
            };
        }
    });

    // 2. Ollama Status
    ipcMain.handle('check-ollama-status', async () => {
        try {
            // Check if Ollama is responding on default port
            const response = await axios.get('http://127.0.0.1:11434/api/tags', { timeout: 2000 });
            return {
                success: true,
                running: true,
                models: response.data.models || []
            };
        } catch (error) {
            return {
                success: true,
                running: false,
                error: 'Ollama not found on http://localhost:11434'
            };
        }
    });
}
