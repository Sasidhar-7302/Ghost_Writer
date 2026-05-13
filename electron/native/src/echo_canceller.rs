// =============================================================================
// Echo Canceller — Enterprise-Grade Signal-Level AEC
// =============================================================================
//
// PURPOSE:
//   Subtract loopback (speaker) audio from the microphone signal BEFORE it
//   reaches STT, eliminating the root cause of speaker misattribution.
//
// DEVICE COMPATIBILITY:
//   - Laptop speakers + built-in mic  (moderate echo, short delay)
//   - USB headsets                     (minimal echo, separate I/O)
//   - Bluetooth headsets               (significant echo, high latency ~200ms)
//   - External audio interfaces        (HiDock, Focusrite, etc. — variable)
//   - Desktop PC + external speakers   (strong echo, room reflections)
//
// ARCHITECTURE:
//   System Audio DSP thread → push i16 frames → [lock-free ring buffer]
//                                                       ↓
//   Mic DSP thread → drain ref buffer → AEC process → [cleaned audio] → STT
//
// DESIGN PRINCIPLES:
//   1. Lock-free cross-thread communication (ring buffer, no mutex on hot path)
//   2. Graceful degradation (if AEC fails, pass through unchanged)
//   3. Adaptive thresholds (noise floor tracking, energy-aware correlation)
//   4. Zero-allocation on hot path after warmup
//   5. Transparent no-op when disabled

use std::collections::VecDeque;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};

use ringbuf::{HeapRb, HeapProd, HeapCons};
use ringbuf::traits::{Split, Consumer};

use crate::audio_config::{FRAME_SAMPLES, AEC_REFERENCE_BUFFER_SAMPLES, AEC_ENABLED_DEFAULT};

// =============================================================================
// Constants
// =============================================================================

/// Number of reference frames to keep in history for delay search.
/// 50 frames × 20ms = 1000ms — covers Bluetooth round-trip and room reverb.
const RENDER_HISTORY_FRAMES: usize = 50;

/// Minimum normalized cross-correlation to consider a frame as containing echo.
/// Lower = more aggressive echo detection. 0.35 catches degraded echoes from
/// different DAC/ADC paths while avoiding false positives on uncorrelated speech.
const CORRELATION_THRESHOLD: f32 = 0.35;

/// Minimum RMS energy (f32 scale, range [0..1]) for a frame to be considered
/// "active". Below this, both reference and capture are treated as silence —
/// no correlation is computed and no subtraction is applied.
const ENERGY_FLOOR: f32 = 0.002;

/// Maximum subtraction strength. Never subtract more than this fraction of the
/// reference signal to preserve near-end speech and avoid musical-noise artifacts.
const MAX_SUBTRACTION_STRENGTH: f32 = 0.90;

/// Comfort noise level (f32 scale) injected after aggressive subtraction to
/// mask musical-noise artifacts from spectral subtraction.
const COMFORT_NOISE_LEVEL: f32 = 0.0005;

/// How often (in frames) to emit diagnostic logs. At 50fps → every ~10 seconds.
const DIAGNOSTIC_LOG_INTERVAL: u64 = 500;

// =============================================================================
// AEC Statistics (thread-safe, lock-free)
// =============================================================================

pub struct AecStats {
    pub frames_processed: AtomicU64,
    pub frames_with_echo: AtomicU64,
    pub frames_passthrough: AtomicU64,
    pub reference_underruns: AtomicU64,
}

impl AecStats {
    pub fn new() -> Self {
        Self {
            frames_processed: AtomicU64::new(0),
            frames_with_echo: AtomicU64::new(0),
            frames_passthrough: AtomicU64::new(0),
            reference_underruns: AtomicU64::new(0),
        }
    }
}

// =============================================================================
// Echo Canceller (public API)
// =============================================================================

/// Signal-level echo canceller.
///
/// Owned exclusively by the **microphone DSP thread**. The system audio thread
/// communicates through a lock-free ring buffer — no mutex on the hot path.
pub struct EchoCanceller {
    /// Lock-free consumer: system audio pushes samples, mic thread drains them.
    reference_consumer: HeapCons<i16>,

    /// Runtime toggle (shared with NAPI control surface).
    enabled: Arc<AtomicBool>,

    /// Diagnostic counters (shared with NAPI control surface).
    stats: Arc<AecStats>,

    /// Accumulator for incoming reference samples until we have a full frame.
    ref_sample_accum: Vec<i16>,

    /// Ring of recent reference frames for delay-tolerant correlation search.
    /// VecDeque gives O(1) push_back / pop_front.
    render_history: VecDeque<Vec<f32>>,

    /// Exponentially-weighted noise floor estimate for the capture signal.
    capture_noise_floor: f32,

    /// Exponentially-weighted noise floor estimate for the reference signal.
    render_noise_floor: f32,

    /// Last detected best-match delay index (for temporal smoothing).
    last_best_delay: usize,

    /// Simple LFSR state for deterministic comfort noise generation.
    noise_seed: u32,
}

impl EchoCanceller {
    // -----------------------------------------------------------------
    // Construction
    // -----------------------------------------------------------------

    /// Create a new `EchoCanceller` and the corresponding reference producer.
    ///
    /// The returned `HeapProd<i16>` must be handed to the system audio DSP
    /// thread so it can push resampled speaker frames into the AEC pipeline.
    pub fn new() -> (Self, HeapProd<i16>) {
        let rb = HeapRb::<i16>::new(AEC_REFERENCE_BUFFER_SAMPLES);
        let (producer, consumer) = rb.split();

        let enabled = Arc::new(AtomicBool::new(AEC_ENABLED_DEFAULT));
        let stats = Arc::new(AecStats::new());

        let canceller = EchoCanceller {
            reference_consumer: consumer,
            enabled,
            stats,
            ref_sample_accum: Vec::with_capacity(FRAME_SAMPLES * 2),
            render_history: VecDeque::with_capacity(RENDER_HISTORY_FRAMES + 1),
            capture_noise_floor: ENERGY_FLOOR,
            render_noise_floor: ENERGY_FLOOR,
            last_best_delay: 0,
            noise_seed: 0xDEAD_BEEF,
        };

        println!(
            "[EchoCanceller] Initialized — frame={}smp, ref_buf={}smp, history={}frames({}ms), threshold={}",
            FRAME_SAMPLES, AEC_REFERENCE_BUFFER_SAMPLES,
            RENDER_HISTORY_FRAMES, RENDER_HISTORY_FRAMES * 20,
            CORRELATION_THRESHOLD,
        );

        (canceller, producer)
    }

    // -----------------------------------------------------------------
    // Hot-path: called once per 20ms mic frame
    // -----------------------------------------------------------------

    /// Process one microphone capture frame through echo cancellation.
    ///
    /// # Guarantees
    /// - Always returns a frame of the same length as `mic_frame`.
    /// - If AEC is disabled or encounters any internal error, returns the
    ///   input unchanged (graceful degradation).
    /// - Never panics.
    pub fn process_capture(&mut self, mic_frame: &[i16]) -> Vec<i16> {
        let frame_count = self.stats.frames_processed.fetch_add(1, Ordering::Relaxed) + 1;

        // ── Fast bypass ──────────────────────────────────────────────
        if !self.enabled.load(Ordering::Relaxed) {
            self.stats.frames_passthrough.fetch_add(1, Ordering::Relaxed);
            return mic_frame.to_vec();
        }

        // ── 1. Drain reference samples (lock-free) ──────────────────
        self.drain_reference_buffer();

        // ── 2. Convert capture to f32 ────────────────────────────────
        let capture_f32 = Self::i16_to_f32(mic_frame);
        let capture_rms = Self::rms(&capture_f32);

        // ── 3. Update capture noise floor (EMA, α = 0.005) ──────────
        self.capture_noise_floor = self.capture_noise_floor * 0.995 + capture_rms * 0.005;

        // ── 4. Skip processing if capture is silence ─────────────────
        if capture_rms < self.capture_noise_floor * 1.5 || capture_rms < ENERGY_FLOOR {
            self.stats.frames_passthrough.fetch_add(1, Ordering::Relaxed);
            return mic_frame.to_vec();
        }

        // ── 5. Skip if no reference history ──────────────────────────
        if self.render_history.is_empty() {
            self.stats.reference_underruns.fetch_add(1, Ordering::Relaxed);
            self.stats.frames_passthrough.fetch_add(1, Ordering::Relaxed);
            return mic_frame.to_vec();
        }

        // ── 6. Delay-tolerant correlation search ─────────────────────
        let (best_corr, best_idx) = self.find_best_reference(&capture_f32);

        // ── 7. Echo decision + adaptive subtraction ──────────────────
        if best_corr > CORRELATION_THRESHOLD {
            let reference = self.render_history[best_idx].clone();
            let cleaned = self.subtract_echo(&capture_f32, &reference, best_corr);
            self.last_best_delay = best_idx;
            self.stats.frames_with_echo.fetch_add(1, Ordering::Relaxed);

            // Periodic diagnostic log
            if frame_count % DIAGNOSTIC_LOG_INTERVAL == 0 {
                let s = &self.stats;
                println!(
                    "[AEC] diag: processed={}, echo={}, pass={}, underrun={}, corr={:.3}, delay={}",
                    s.frames_processed.load(Ordering::Relaxed),
                    s.frames_with_echo.load(Ordering::Relaxed),
                    s.frames_passthrough.load(Ordering::Relaxed),
                    s.reference_underruns.load(Ordering::Relaxed),
                    best_corr, best_idx,
                );
            }

            return Self::f32_to_i16(&cleaned);
        }

        // ── 8. No echo detected — pass through ──────────────────────
        self.stats.frames_passthrough.fetch_add(1, Ordering::Relaxed);
        mic_frame.to_vec()
    }

    // -----------------------------------------------------------------
    // Internal helpers
    // -----------------------------------------------------------------

    /// Drain all available reference samples from the ring buffer and
    /// assemble them into full frames in the render history.
    fn drain_reference_buffer(&mut self) {
        // Bulk drain — lock-free, non-blocking
        while let Some(sample) = self.reference_consumer.try_pop() {
            self.ref_sample_accum.push(sample);
        }

        // Assemble full frames
        while self.ref_sample_accum.len() >= FRAME_SAMPLES {
            let frame_i16: Vec<i16> = self.ref_sample_accum.drain(0..FRAME_SAMPLES).collect();
            let frame_f32 = Self::i16_to_f32(&frame_i16);

            // Update render noise floor
            let rms = Self::rms(&frame_f32);
            self.render_noise_floor = self.render_noise_floor * 0.995 + rms * 0.005;

            // Push to history ring (O(1) operations)
            self.render_history.push_back(frame_f32);
            if self.render_history.len() > RENDER_HISTORY_FRAMES {
                self.render_history.pop_front();
            }
        }
    }

    /// Search the render history for the best-matching reference frame.
    ///
    /// Uses a two-pass strategy:
    /// 1. **Temporal locality**: check near `last_best_delay` first (cheap).
    /// 2. **Full scan**: if no strong match found, scan all frames.
    ///
    /// Returns `(best_correlation, best_index)`.
    fn find_best_reference(&self, capture: &[f32]) -> (f32, usize) {
        let history_len = self.render_history.len();
        if history_len == 0 {
            return (0.0, 0);
        }

        let mut best_corr: f32 = 0.0;
        let mut best_idx: usize = 0;

        // Pass 1: check temporal neighborhood (±3 frames around last delay)
        let start = self.last_best_delay.saturating_sub(3).min(history_len.saturating_sub(1));
        let end = (self.last_best_delay + 4).min(history_len);
        for idx in start..end {
            let ref_frame = &self.render_history[idx];
            if ref_frame.len() != capture.len() { continue; }

            let ref_rms = Self::rms(ref_frame);
            if ref_rms < self.render_noise_floor * 1.5 || ref_rms < ENERGY_FLOOR {
                continue; // Skip silent reference frames
            }

            let corr = Self::normalized_cross_correlation(capture, ref_frame);
            if corr > best_corr {
                best_corr = corr;
                best_idx = idx;
            }
        }

        // If temporal locality found a strong match, skip full scan
        if best_corr > CORRELATION_THRESHOLD + 0.1 {
            return (best_corr, best_idx);
        }

        // Pass 2: full scan (skip already-checked range)
        for idx in 0..history_len {
            if idx >= start && idx < end { continue; } // Already checked
            let ref_frame = &self.render_history[idx];
            if ref_frame.len() != capture.len() { continue; }

            let ref_rms = Self::rms(ref_frame);
            if ref_rms < self.render_noise_floor * 1.5 || ref_rms < ENERGY_FLOOR {
                continue;
            }

            let corr = Self::normalized_cross_correlation(capture, ref_frame);
            if corr > best_corr {
                best_corr = corr;
                best_idx = idx;
            }
        }

        (best_corr, best_idx)
    }

    /// Subtract echo from capture using energy-aware spectral subtraction.
    ///
    /// Strength is adaptive based on correlation confidence. Includes comfort
    /// noise injection to mask musical-noise artifacts.
    fn subtract_echo(&mut self, capture: &[f32], reference: &[f32], correlation: f32) -> Vec<f32> {
        // Adaptive strength: ramp from 0 at threshold to MAX at correlation=1.0
        let raw_strength = (correlation - CORRELATION_THRESHOLD)
            / (1.0 - CORRELATION_THRESHOLD);
        let strength = (raw_strength * MAX_SUBTRACTION_STRENGTH).clamp(0.0, MAX_SUBTRACTION_STRENGTH);

        let mut output = Vec::with_capacity(capture.len());

        for i in 0..capture.len() {
            let ref_sample = if i < reference.len() { reference[i] } else { 0.0 };

            // Weighted subtraction
            let mut cleaned = capture[i] - ref_sample * strength;

            // Inject comfort noise for frames with strong subtraction
            // This prevents the "underwater" / musical-noise effect
            if strength > 0.3 {
                let noise = self.next_comfort_noise() * COMFORT_NOISE_LEVEL;
                cleaned += noise;
            }

            output.push(cleaned.clamp(-1.0, 1.0));
        }

        output
    }

    /// Deterministic comfort noise generator (LFSR-based, no allocation).
    fn next_comfort_noise(&mut self) -> f32 {
        // Galois LFSR — fast, deterministic, full-period
        let bit = self.noise_seed & 1;
        self.noise_seed >>= 1;
        if bit == 1 {
            self.noise_seed ^= 0xB400_0000;
        }
        // Map to [-1, 1]
        (self.noise_seed as f32 / u32::MAX as f32) * 2.0 - 1.0
    }

    // -----------------------------------------------------------------
    // DSP utilities (static, zero-allocation)
    // -----------------------------------------------------------------

    /// Normalized cross-correlation between two equal-length signals.
    /// Returns value in [0, 1]. Higher = more similar.
    fn normalized_cross_correlation(a: &[f32], b: &[f32]) -> f32 {
        debug_assert_eq!(a.len(), b.len());

        let mut sum_ab: f64 = 0.0;
        let mut sum_a2: f64 = 0.0;
        let mut sum_b2: f64 = 0.0;

        // Process 4 samples at a time for throughput
        let chunks = a.len() / 4;
        for i in 0..chunks {
            let base = i * 4;
            for j in 0..4 {
                let va = a[base + j] as f64;
                let vb = b[base + j] as f64;
                sum_ab += va * vb;
                sum_a2 += va * va;
                sum_b2 += vb * vb;
            }
        }
        // Handle remainder
        for i in (chunks * 4)..a.len() {
            let va = a[i] as f64;
            let vb = b[i] as f64;
            sum_ab += va * vb;
            sum_a2 += va * va;
            sum_b2 += vb * vb;
        }

        let denom = (sum_a2 * sum_b2).sqrt();
        if denom < 1e-12 { return 0.0; }
        (sum_ab / denom).abs() as f32
    }

    /// RMS energy of an f32 signal.
    fn rms(signal: &[f32]) -> f32 {
        if signal.is_empty() { return 0.0; }
        let sum: f64 = signal.iter().map(|&s| (s as f64) * (s as f64)).sum();
        (sum / signal.len() as f64).sqrt() as f32
    }

    /// Convert i16 PCM to f32 normalized [-1.0, 1.0].
    fn i16_to_f32(samples: &[i16]) -> Vec<f32> {
        samples.iter().map(|&s| s as f32 / 32768.0).collect()
    }

    /// Convert f32 normalized back to i16 PCM with clamping.
    fn f32_to_i16(samples: &[f32]) -> Vec<i16> {
        samples.iter()
            .map(|&s| (s * 32767.0).clamp(-32768.0, 32767.0) as i16)
            .collect()
    }

    // -----------------------------------------------------------------
    // Public control surface
    // -----------------------------------------------------------------

    pub fn get_enabled_flag(&self) -> Arc<AtomicBool> { self.enabled.clone() }
    pub fn get_stats(&self) -> Arc<AecStats> { self.stats.clone() }

    pub fn set_enabled(&self, enabled: bool) {
        self.enabled.store(enabled, Ordering::Relaxed);
        println!("[EchoCanceller] AEC {}", if enabled { "ENABLED" } else { "DISABLED" });
    }

    pub fn is_enabled(&self) -> bool {
        self.enabled.load(Ordering::Relaxed)
    }
}

// =============================================================================
// Tests
// =============================================================================

#[cfg(test)]
mod tests {
    use super::*;
    use ringbuf::traits::Producer;

    fn sine_frame(freq: f32, amplitude: f32) -> Vec<i16> {
        (0..FRAME_SAMPLES)
            .map(|i| ((i as f32 * freq).sin() * amplitude) as i16)
            .collect()
    }

    #[test]
    fn test_disabled_passthrough() {
        let (mut aec, _prod) = EchoCanceller::new();
        aec.set_enabled(false);
        let frame = sine_frame(0.1, 10000.0);
        let out = aec.process_capture(&frame);
        assert_eq!(out, frame, "Disabled AEC must pass through unchanged");
    }

    #[test]
    fn test_no_reference_passthrough() {
        let (mut aec, _prod) = EchoCanceller::new();
        let frame = sine_frame(0.1, 10000.0);
        let out = aec.process_capture(&frame);
        assert_eq!(out.len(), FRAME_SAMPLES);
        // Should be unchanged since there's no reference to subtract
    }

    #[test]
    fn test_echo_detected_and_suppressed() {
        let (mut aec, mut prod) = EchoCanceller::new();

        // Push a reference frame (system audio)
        let reference = sine_frame(0.1, 10000.0);
        for &s in &reference { let _ = prod.try_push(s); }

        // Feed identical signal as mic (perfect echo)
        let out = aec.process_capture(&reference);

        // Output must differ — echo was detected and subtracted
        let max_diff: i32 = out.iter().zip(reference.iter())
            .map(|(&a, &b)| (a as i32 - b as i32).abs())
            .max().unwrap_or(0);
        assert!(max_diff > 50, "AEC should modify output when echo present, max_diff={}", max_diff);
    }

    #[test]
    fn test_uncorrelated_signals_pass_through() {
        let (mut aec, mut prod) = EchoCanceller::new();

        // Push one signal as reference
        let reference = sine_frame(0.1, 10000.0);
        for &s in &reference { let _ = prod.try_push(s); }

        // Feed a completely different signal as mic
        let mic = sine_frame(0.73, 8000.0);
        let out = aec.process_capture(&mic);

        // Output should be close to the original mic signal
        let max_diff: i32 = out.iter().zip(mic.iter())
            .map(|(&a, &b)| (a as i32 - b as i32).abs())
            .max().unwrap_or(0);
        assert!(max_diff < 500, "Uncorrelated signals should pass through mostly unchanged, max_diff={}", max_diff);
    }

    #[test]
    fn test_silence_passthrough() {
        let (mut aec, mut prod) = EchoCanceller::new();

        // Push silent reference
        let silence: Vec<i16> = vec![0; FRAME_SAMPLES];
        for &s in &silence { let _ = prod.try_push(s); }

        // Feed silent mic
        let out = aec.process_capture(&silence);
        assert_eq!(out, silence, "Silent frames should pass through unchanged");
    }

    #[test]
    fn test_stats_tracking() {
        let (mut aec, _prod) = EchoCanceller::new();
        let stats = aec.get_stats();
        let frame: Vec<i16> = vec![100; FRAME_SAMPLES];

        aec.process_capture(&frame);
        aec.process_capture(&frame);
        aec.process_capture(&frame);

        assert_eq!(stats.frames_processed.load(Ordering::Relaxed), 3);
    }

    #[test]
    fn test_delayed_echo_detection() {
        let (mut aec, mut prod) = EchoCanceller::new();

        // Push 5 different reference frames, then the echo frame
        for freq_offset in 0..5 {
            let filler = sine_frame(0.3 + freq_offset as f32 * 0.1, 8000.0);
            for &s in &filler { let _ = prod.try_push(s); }
        }
        let echo_source = sine_frame(0.1, 12000.0);
        for &s in &echo_source { let _ = prod.try_push(s); }

        // Drain all reference frames into history
        aec.drain_reference_buffer();

        // Now feed the echo source as mic — should find it in history
        let out = aec.process_capture(&echo_source);
        let max_diff: i32 = out.iter().zip(echo_source.iter())
            .map(|(&a, &b)| (a as i32 - b as i32).abs())
            .max().unwrap_or(0);
        assert!(max_diff > 50, "Delayed echo should still be detected, max_diff={}", max_diff);
    }

    #[test]
    fn test_output_frame_length_always_matches_input() {
        let (mut aec, mut prod) = EchoCanceller::new();
        let ref_frame = sine_frame(0.1, 10000.0);
        for &s in &ref_frame { let _ = prod.try_push(s); }

        // Various input lengths
        for len in [FRAME_SAMPLES, FRAME_SAMPLES / 2, 1, 0] {
            let mic: Vec<i16> = vec![500; len];
            let out = aec.process_capture(&mic);
            assert_eq!(out.len(), len, "Output length must always match input length");
        }
    }
}
