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

            if (process.platform === 'darwin') {
                // macOS: Check for Apple Silicon or dedicated GPU
                try {
                    const { stdout } = await execAsync('system_profiler SPDisplaysDataType');
                    const isAppleSilicon = stdout.includes('Apple M');

                    if (isAppleSilicon) {
                        const modelMatch = stdout.match(/Chip: (Apple M[1234]\s?\w*)/);
                        const vramMatch = stdout.match(/Memory: (\d+) GB/); // Apple Silicon uses Unified Memory
                        const vramGB = vramMatch ? parseInt(vramMatch[1]) : 8; // Default 8GB if not found

                        return {
                            name: modelMatch ? modelMatch[1] : 'Apple Silicon',
                            vramGB,
                            isNvidia: false,
                            tier: vramGB >= 16 ? 'high' : 'medium'
                        };
                    }

                    // Intel Mac with AMD/NVIDIA
                    const modelMatch = stdout.match(/Chipset Model: (.*)/);
                    const vramMatch = stdout.match(/VRAM \(Total\): (\d+) GB/);
                    const vramGB = vramMatch ? parseInt(vramMatch[1]) : 0;

                    return {
                        name: modelMatch ? modelMatch[1].trim() : 'Intel Iris/HD Graphics',
                        vramGB,
                        isNvidia: stdout.includes('NVIDIA'),
                        tier: this.calculateTier(vramGB)
                    };
                } catch (e) {
                    console.warn('[GPUHelper] macOS system_profiler failed:', e);
                }
            }

            if (process.platform === 'linux') {
                try {
                    const { stdout } = await execAsync('nvidia-smi --query-gpu=name,memory.total --format=csv,noheader,nounits').catch(() => ({ stdout: '' }));
                    if (stdout) {
                        const [name, memory] = stdout.trim().split(', ');
                        const vramGB = Math.floor(parseInt(memory.trim()) / 1024);
                        return { name: name.trim(), vramGB, isNvidia: true, tier: this.calculateTier(vramGB) };
                    }
                } catch { }
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
