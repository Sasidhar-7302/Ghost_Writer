import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface GPUInfo {
    name: string;
    vramGB: number;
    isNvidia: boolean;
    tier: 'low' | 'medium' | 'high';
}

export class GPUHelper {
    public static async detectGPU(): Promise<GPUInfo> {
        try {
            if (process.platform === 'win32') {
                const { stdout } = await execAsync('nvidia-smi --query-gpu=name,memory.total --format=csv,noheader,nounits');
                if (stdout) {
                    const [name, memory] = stdout.trim().split(', ');
                    const vramGB = Math.floor(parseInt(memory.trim()) / 1024);

                    return {
                        name: name.trim(),
                        vramGB,
                        isNvidia: true,
                        tier: this.calculateTier(vramGB)
                    };
                }
            }
            // Add linux support if needed
            if (process.platform === 'linux') {
                try {
                    const { stdout } = await execAsync('nvidia-smi --query-gpu=name,memory.total --format=csv,noheader,nounits');
                    if (stdout) {
                        const [name, memory] = stdout.trim().split(', ');
                        const vramGB = Math.floor(parseInt(memory.trim()) / 1024);
                        return { name: name.trim(), vramGB, isNvidia: true, tier: this.calculateTier(vramGB) };
                    }
                } catch {
                    // fall through to default
                }
            }

            return { name: 'CPU/Unknown', vramGB: 0, isNvidia: false, tier: 'low' };
        } catch (error) {
            console.error('[GPUHelper] GPU detection failed:', error);
            return { name: 'CPU/Unknown', vramGB: 0, isNvidia: false, tier: 'low' };
        }
    }

    private static calculateTier(vramGB: number): 'low' | 'medium' | 'high' {
        if (vramGB >= 10) return 'high';   // RTX 3060 12GB, 3080 10GB+, etc.
        if (vramGB >= 6) return 'medium';  // RTX 3060 6GB / 2060, etc.
        return 'low';                      // Less than 6GB
    }
}
