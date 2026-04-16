// Test whisper-cli.exe with clean args (no --device, no --flash-attn, no --no-prints)
const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');

// Generate a 3-second WAV with a 440Hz tone + noise
const sr = 16000, dur = 3, ns = sr * dur;
const buf = Buffer.alloc(44 + ns * 2);
buf.write('RIFF', 0);
buf.writeUInt32LE(36 + ns * 2, 4);
buf.write('WAVE', 8);
buf.write('fmt ', 12);
buf.writeUInt32LE(16, 16);
buf.writeUInt16LE(1, 20);
buf.writeUInt16LE(1, 22);
buf.writeUInt32LE(sr, 24);
buf.writeUInt32LE(sr * 2, 28);
buf.writeUInt16LE(2, 32);
buf.writeUInt16LE(16, 34);
buf.write('data', 36);
buf.writeUInt32LE(ns * 2, 40);
for (let i = 0; i < ns; i++) {
    const v = Math.floor(Math.sin(2 * Math.PI * 440 * i / sr) * 3000 + (Math.random() - 0.5) * 1000);
    buf.writeInt16LE(Math.max(-32768, Math.min(32767, v)), 44 + i * 2);
}
const wavPath = path.join(__dirname, 'test_audio.wav');
fs.writeFileSync(wavPath, buf);
console.log('Created test WAV:', wavPath);

// Check BOTH paths (dev mode uses Electron, production uses Ghost Writer)
const paths = [
    { label: 'Ghost Writer', bin: String.raw`C:\Users\yepur\AppData\Roaming\Ghost Writer\whisper\bin\Release\whisper-cli.exe`, models: String.raw`C:\Users\yepur\AppData\Roaming\Ghost Writer\whisper\models` },
    { label: 'Electron (dev)', bin: String.raw`C:\Users\yepur\AppData\Roaming\Electron\whisper\bin\Release\whisper-cli.exe`, models: String.raw`C:\Users\yepur\AppData\Roaming\Electron\whisper\models` },
];

// The EXACT same args as the fixed LocalWhisperSTT.ts
const CLEAN_ARGS = ['--language', 'en', '--no-timestamps', '--threads', '4'];

async function testModel(binPath, modelsDir, modelName, label) {
    const modelPath = path.join(modelsDir, `ggml-${modelName}.bin`);
    if (!fs.existsSync(modelPath)) {
        const stats = '(file does not exist)';
        console.log(`\n[${label}/${modelName}] SKIPPED - ${stats}`);
        return;
    }
    const fileSize = fs.statSync(modelPath).size;
    const sizeMB = (fileSize / 1024 / 1024).toFixed(1);
    console.log(`\n[${label}/${modelName}] Testing (${sizeMB} MB)...`);

    const args = ['--model', modelPath, '--file', wavPath, ...CLEAN_ARGS];
    console.log(`[${label}/${modelName}] Args: ${args.join(' ')}`);

    return new Promise((resolve) => {
        const start = Date.now();
        execFile(binPath, args, { timeout: 60000, cwd: path.dirname(binPath) }, (err, stdout, stderr) => {
            const elapsed = Date.now() - start;
            if (err) {
                console.log(`[${label}/${modelName}] ❌ ERROR (${elapsed}ms): ${err.message.substring(0, 200)}`);
                if (stderr) console.log(`[${label}/${modelName}] STDERR: ${stderr.substring(0, 300)}`);
            } else {
                console.log(`[${label}/${modelName}] ✅ SUCCESS (${elapsed}ms)`);
                console.log(`[${label}/${modelName}] Output: "${stdout.trim() || '(empty)'}"`);
                if (stderr && stderr.includes('error')) {
                    console.log(`[${label}/${modelName}] ⚠️ STDERR has errors: ${stderr.substring(0, 300)}`);
                }
            }
            resolve();
        });
    });
}

(async () => {
    for (const p of paths) {
        if (!fs.existsSync(p.bin)) {
            console.log(`\n=== ${p.label}: Binary NOT FOUND ===`);
            continue;
        }
        console.log(`\n=== ${p.label} ===`);
        console.log(`Binary: ${p.bin}`);

        // List available models
        if (fs.existsSync(p.models)) {
            const files = fs.readdirSync(p.models);
            console.log(`Models dir: ${p.models}`);
            console.log(`Available: ${files.join(', ') || '(empty)'}`);
        } else {
            console.log(`Models dir: ${p.models} (NOT FOUND)`);
        }

        await testModel(p.bin, p.models, 'small', p.label);
        await testModel(p.bin, p.models, 'medium', p.label);
    }

    // Cleanup
    try { fs.unlinkSync(wavPath); } catch { }
    console.log('\n=== DONE ===');
})();
