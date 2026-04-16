/**
 * Quick test: does SystemAudioCapture.start() succeed on this machine?
 */
const path = require('path');

// Load the native module
const nativeModulePath = path.join(__dirname, '..', 'native-module');
const native = require(nativeModulePath);

console.log('=== System Audio Capture Diagnostic ===\n');

// List output devices first
console.log('Output devices:');
const devices = native.getOutputDevices();
devices.forEach((d, i) => {
    console.log(`  [${i}] ${d.name} (${d.id})`);
});
console.log();

// Try to create SystemAudioCapture with no specific device (use default)
try {
    console.log('Creating SystemAudioCapture (default device)...');
    const capture = new native.SystemAudioCapture(null);
    console.log('  ✅ SystemAudioCapture created');

    // Try starting (with a dummy callback)
    let gotData = false;
    let dataCount = 0;

    console.log('Starting capture...');
    capture.start((pcmBuffer) => {
        if (!gotData) {
            gotData = true;
            console.log(`  ✅ First audio data received! (${pcmBuffer.length} bytes)`);
        }
        dataCount++;
    });
    console.log('  ✅ capture.start() succeeded — NO WASAPI ERROR!');

    // Wait 3 seconds to see if data flows
    console.log('  Waiting 3 seconds for audio data...');
    setTimeout(() => {
        capture.stop();
        console.log(`  ✅ Stopped. Received ${dataCount} audio frames in 3 seconds.`);
        if (dataCount > 0) {
            console.log('\n🎉 SYSTEM AUDIO CAPTURE IS WORKING!');
            console.log('   The interviewer\'s voice will now be captured.');
        } else {
            console.log('\n⚠️  Capture started but no audio data received.');
            console.log('   This might mean no audio is playing, or the stream is silent.');
            console.log('   Try playing some audio (YouTube, music) and re-run this test.');
        }
        process.exit(0);
    }, 3000);

} catch (e) {
    console.log(`  ❌ Failed: ${e.message}`);

    if (e.message.includes('0x88890003') || e.message.includes('WRONG_ENDPOINT')) {
        console.log('\n  The WASAPI loopback fix did NOT resolve the issue on this device.');
        console.log('  Possible causes:');
        console.log('  - HiDock USB driver does not support WASAPI loopback at all');
        console.log('  - Try setting a different default output device in Windows Sound Settings');
    }
    process.exit(1);
}
