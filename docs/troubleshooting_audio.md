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

## 3. Capture Profiles
Settings -> Audio exposes an explicit Capture Profile. Use this instead of relying on automatic device guessing.

| Profile | Captures | Best for | Notes |
|---------|----------|----------|-------|
| Dual Stream | System loopback + microphone | Normal meetings, interviews, headphones, speakers, speakerphones | Default. Echo suppression delays local mic text briefly so loopback transcripts can suppress duplicates. |
| Listen Only | System loopback only | Meetings where you are muted, watching a recording, or only need other speakers | Prevents false `You` turns because the microphone stream is not started. |
| Mic Only | Microphone only | Local dictation, in-person interview capture, or environments where loopback is unavailable | Remote meeting audio will not be transcribed unless it reaches the microphone. |

If the transcript shows `You` while you are not speaking, switch to **Listen Only** for that session. If other speakers are not captured while using earbuds or a separate headset, keep **Dual Stream** and verify the Output Device is the same endpoint used by the meeting app.

### Troubleshooting Fallback:
- **No Sound**: Ensure "Share System Audio" was checked in the browser dialog.
- **Quiet Audio**: Check if Ducking (Communication mode) is active in Windows Sound Settings.

---

## 4. Speaker Labels and Diarization
Speaker labels are provider-dependent:

- Cloud providers that return stable speaker tags are trusted directly.
- Local Whisper tiny-diarize is treated as speaker-turn information, not a stable identity system. It can mark `(speaker ?)` inside each short chunk but does not reliably cluster a full meeting into `Person 1`, `Person 2`, etc.
- Ghost Writer no longer creates a new person only because there was a silence gap. This avoids runaway labels such as `Person 20` in a two-person meeting.

For the best labels in two-person interviews, use a provider with explicit diarization and set the meeting context as tightly as possible. Known speaker count constraints generally improve diarization quality when the provider supports them.

---

## 5. Common Error Codes (WASAPI)
If checking logs, you might see these hex codes:
- `0x88890008` (**AUDCLNT_E_ALREADY_INITIALIZED**): Audio device is busy.
- `0x8889000A` (**AUDCLNT_E_DEVICE_INVALIDATED**): Device was unplugged.
- `0x88890003` (**AUDCLNT_E_WRONG_ENDPOINT_TYPE**): Usually fixed by the internal loopback logic.

## 6. Resetting the Audio System
If audio capture hangs:
1.  Go to Settings -> Audio.
2.  Switch Capture Profile to Listen Only, then back to Dual Stream if you need both streams.
3.  Switch to another Speech Provider and back (this re-initializes the STT stream).
4.  Restart Ghost Writer if the issue persists.
