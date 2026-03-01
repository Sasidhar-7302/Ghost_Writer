
const { exec } = require('child_process');
const util = require('util');
const execAsync = util.promisify(exec);

async function detectGPU() {
    try {
        if (process.platform === 'win32') {
            const { stdout } = await execAsync('nvidia-smi --query-gpu=name,memory.total --format=csv,noheader,nounits');
            const [name, memory] = stdout.trim().split(', ');
            return {
                name: name.trim(),
                vramGB: Math.floor(parseInt(memory.trim()) / 1024),
                isNvidia: true
            };
        }
        return { name: 'Unknown', vramGB: 0, isNvidia: false };
    } catch (error) {
        console.error('Error detecting GPU:', error.message);
        return { name: 'CPU/Unknown', vramGB: 0, isNvidia: false };
    }
}

detectGPU().then(gpu => {
    console.log(JSON.stringify(gpu, null, 2));
});
