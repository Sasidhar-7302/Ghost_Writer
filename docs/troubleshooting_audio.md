# Troubleshooting: Audio Capture & Fallback System

This guide helps resolve issues with audio capture in Ghost Writer.

## 1. Native Audio Module Status
Ghost Writer uses a specialized Rust-based native module for high-performance, low-latency audio capture on Windows (via WASAPI).

### Symptoms of Failure:
- **Status Indicator**: Settings -> Audio shows "Running in Web Audio Fallback mode".
- **Action Required**: A "Share screen" dialog appears when starting a meeting.

### Common Causes:
- **Build Missing**: The native module wasn't built correctly (`npm run build:native`).
- **Dependency Issues**: Missing VC++ Redistributables on Windows.
- **Access Denied**: Another application has exclusive control over the audio device.

---

## 2. Web Audio Fallback
If the native module fails, Ghost Writer automatically activates the Web Audio API fallback.

### How it works:
1.  **System Audio**: Uses `getDisplayMedia`. You must select the "System Audio" checkbox in the "Share screen" dialog.
2.  **Microphone**: Uses `getUserMedia` for standard mic capture.
3.  **Performance**: Web Audio has slightly higher latency and CPU overhead compared to Native (approx. 2-5x slower processing in JS).

### Troubleshooting Fallback:
- **No Sound**: Ensure "Share System Audio" was checked in the browser dialog.
- **Quiet Audio**: Check if Ducking (Communication mode) is active in Windows Sound Settings.

---

## 3. Common Error Codes (WASAPI)
If checking logs, you might see these hex codes:
- `0x88890008` (**AUDCLNT_E_ALREADY_INITIALIZED**): Audio device is busy.
- `0x8889000A` (**AUDCLNT_E_DEVICE_INVALIDATED**): Device was unplugged.
- `0x88890003` (**AUDCLNT_E_WRONG_ENDPOINT_TYPE**): Usually fixed by the internal loopback logic.

## 4. Resetting the Audio System
If audio capture hangs:
1.  Go to Settings -> Audio.
2.  Switch to another Speech Provider and back (this re-initializes the stream).
3.  Restart Ghost Writer if the issue persists.
