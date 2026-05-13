export type AudioCaptureMode = 'dual-stream' | 'system-only' | 'mic-only';

export const DEFAULT_AUDIO_CAPTURE_MODE: AudioCaptureMode = 'dual-stream';

const VALID_AUDIO_CAPTURE_MODES = new Set<AudioCaptureMode>([
  'dual-stream',
  'system-only',
  'mic-only',
]);

export function normalizeAudioCaptureMode(value: unknown): AudioCaptureMode {
  return typeof value === 'string' && VALID_AUDIO_CAPTURE_MODES.has(value as AudioCaptureMode)
    ? value as AudioCaptureMode
    : DEFAULT_AUDIO_CAPTURE_MODE;
}

export function shouldCaptureSystemAudio(mode: unknown): boolean {
  return normalizeAudioCaptureMode(mode) !== 'mic-only';
}

export function shouldCaptureMicrophoneAudio(mode: unknown): boolean {
  return normalizeAudioCaptureMode(mode) !== 'system-only';
}
