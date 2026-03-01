
const { exec } = require('child_process');
const util = require('util');
const fs = require('fs');
const execAsync = util.promisify(exec);

async function detectGPU() {
    try {
        if (process.platform === 'win32') {
            const { stdout } = await execAsync('nvidia-smi --query-gpu=name,memory.total --format=csv,noheader,nounits');
            const [name, memory] = stdout.trim().split(', ');
            const vramGB = Math.floor(parseInt(memory.trim()) / 1024);
            return {
                name: name.trim(),
                vramGB,
                tier: vramGB >= 12 ? 'high' : (vramGB >= 8 ? 'medium' : 'low')
            };
        }
    } catch (e) { return { name: 'CPU', vramGB: 0, tier: 'low' }; }
}

async function testOllamaVision() {
    console.log("--- GPU Detection Test ---");
    const gpu = await detectGPU();
    console.log("Detected GPU:", JSON.stringify(gpu, null, 2));

    console.log("\n--- Hardware-Aware Model Selection Logic ---");
    let selectedModel = "qwen2.5:7b"; // default
    if (gpu.vramGB >= 10) {
        console.log("Tier detected: HIGH. Mapping to larger models...");
        selectedModel = "qwen2.5:7b (High-Performance)";
    }
    console.log("Simulated Model Selection:", selectedModel);

    console.log("\n--- Ollama Vision Capability Test ---");
    // We'll check if any vision model is installed
    try {
        const { stdout } = await execAsync('ollama list');
        const models = stdout.split('\n');
        const visionModels = models.filter(m => m.includes('llava') || m.includes('minicpm-v') || m.includes('moondream') || m.includes('qwen2-vl'));

        if (visionModels.length > 0) {
            console.log("Vision models found:", visionModels.map(m => m.split('\t')[0]).join(', '));
            console.log("READY for screenshot analysis without API keys!");
        } else {
            console.log("WARNING: No vision models (llava, minicpm-v, etc.) detected in Ollama.");
            console.log("Recommendation: Run 'ollama pull llava' for local screenshot analysis.");
        }
    } catch (e) {
        console.log("Ollama not found or not running.");
    }
}

testOllamaVision();
