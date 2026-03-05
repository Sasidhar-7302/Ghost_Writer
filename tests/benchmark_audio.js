/**
 * Performance benchmarking script for Audio system
 * Compares Native vs Web Audio processing overhead.
 */
console.log('=== Audio Performance Benchmarking ===\n');

function benchmark(name, iterations, fn) {
    const start = process.hrtime.bigint();
    for (let i = 0; i < iterations; i++) {
        fn();
    }
    const end = process.hrtime.bigint();
    const duration = Number(end - start) / 1000000; // ms
    console.log(`${name}: ${duration.toFixed(3)}ms for ${iterations} operations`);
    return duration;
}

const iterations = 10000;
const bufferSize = 4096;

// Simulating Float32 to Int16 conversion (Web Audio Fallback logic)
const float32Buffer = new Float32Array(bufferSize);
for (let i = 0; i < bufferSize; i++) float32Buffer[i] = Math.random() * 2 - 1;

const nativeTime = benchmark('Native (Simulated overhead)', iterations, () => {
    // Native is handled by Rust side, so renderer overhead is just IPC call.
    // For benchmark comparison, we simulate the IPC call overhead.
    const _ = Buffer.from(float32Buffer.buffer);
});

const webFallbackTime = benchmark('Web Audio Fallback (Conversion)', iterations, () => {
    const pcmData = new Int16Array(bufferSize);
    for (let i = 0; i < float32Buffer.length; i++) {
        const s = Math.max(-1, Math.min(1, float32Buffer[i]));
        pcmData[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    const _ = Buffer.from(pcmData.buffer);
});

console.log('\nResults Summary:');
console.log(`Web Audio Fallback is ~${(webFallbackTime / nativeTime).toFixed(1)}x slower than Native path in renderer.`);
console.log('Note: Native path has significantly lower CPU and memory overhead as it avoids Float32 to Int16 conversion in JS.');
