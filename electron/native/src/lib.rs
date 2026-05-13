#![deny(clippy::all)]

#[macro_use]
extern crate napi_derive;

use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::thread;
use std::time::Duration;

use napi::bindgen_prelude::*;
use napi::threadsafe_function::{ThreadsafeFunction, ThreadsafeFunctionCallMode, ErrorStrategy};
use ringbuf::traits::{Consumer, Producer};
use once_cell::sync::Lazy;

pub mod vad; 
pub mod microphone;
pub mod speaker;
pub mod streaming_resampler;
pub mod audio_config;
pub mod silence_suppression;
pub mod echo_canceller;

// Keep old resampler module for compatibility
pub mod resampler;

use crate::streaming_resampler::StreamingResampler;
use crate::audio_config::{FRAME_SAMPLES, DSP_POLL_MS};
use crate::silence_suppression::{
    SilenceSuppressor, SilenceSuppressionConfig, FrameAction, generate_silence_frame
};
use crate::echo_canceller::{EchoCanceller, AecStats};

// =============================================================================
// GLOBAL AEC STATE
// =============================================================================
//
// DESIGN: The Mutex is held ONLY during:
//   1. Initialization (ensure_aec_initialized) — once per session
//   2. take_reference_producer() — once when SystemAudioCapture.start() is called
//   3. take_canceller()          — once when MicrophoneCapture.start() is called
//   4. setAecEnabled / getAecStats NAPI calls — infrequent control-plane calls
//
// The Mutex is NEVER held inside DSP frame-processing loops.
// The HeapProd and EchoCanceller are moved out of the mutex into their
// respective threads, communicating through the lock-free ring buffer.
// =============================================================================

struct GlobalAecState {
    /// Reference producer — taken once by SystemAudioCapture.start()
    reference_producer: Option<ringbuf::HeapProd<i16>>,
    /// Echo canceller — taken once by MicrophoneCapture.start()
    canceller: Option<EchoCanceller>,
    /// Shared enabled flag (survives after canceller is taken)
    enabled_flag: Option<Arc<AtomicBool>>,
    /// Shared stats (survives after canceller is taken)
    stats: Option<Arc<AecStats>>,
    /// Track whether AEC was initialized
    initialized: bool,
}

static GLOBAL_AEC: Lazy<Mutex<GlobalAecState>> = Lazy::new(|| {
    Mutex::new(GlobalAecState {
        reference_producer: None,
        canceller: None,
        enabled_flag: None,
        stats: None,
        initialized: false,
    })
});

/// Initialize global AEC state. Called once when either capture stream starts.
fn ensure_aec_initialized() {
    let mut state = GLOBAL_AEC.lock().unwrap();
    if state.initialized {
        return;
    }

    println!("[AEC] Initializing global echo canceller...");
    let (canceller, producer) = EchoCanceller::new();
    state.enabled_flag = Some(canceller.get_enabled_flag());
    state.stats = Some(canceller.get_stats());
    state.reference_producer = Some(producer);
    state.canceller = Some(canceller);
    state.initialized = true;
    println!("[AEC] Global echo canceller ready.");
}

/// Take the reference producer out of global state (called once by SystemAudioCapture).
/// Returns None if already taken or not initialized.
fn take_reference_producer() -> Option<ringbuf::HeapProd<i16>> {
    GLOBAL_AEC.lock().ok()?.reference_producer.take()
}

/// Take the echo canceller out of global state (called once by MicrophoneCapture).
/// Returns None if already taken or not initialized.
fn take_canceller() -> Option<EchoCanceller> {
    GLOBAL_AEC.lock().ok()?.canceller.take()
}

// ============================================================================
// SYSTEM AUDIO CAPTURE
// ============================================================================

#[napi]
pub struct SystemAudioCapture {
    stop_signal: Arc<AtomicBool>,
    capture_thread: Option<thread::JoinHandle<()>>,
    sample_rate: u32,
    device_id: Option<String>,
    input: Option<speaker::SpeakerInput>,
    stream: Option<speaker::SpeakerStream>,
}

#[napi]
impl SystemAudioCapture {
    #[napi(constructor)]
    pub fn new(device_id: Option<String>) -> napi::Result<Self> {
        println!("[SystemAudioCapture] Created with lazy init (device: {:?})", device_id);
        
        Ok(SystemAudioCapture {
            stop_signal: Arc::new(AtomicBool::new(false)),
            capture_thread: None,
            sample_rate: 16000,
            device_id,
            input: None,
            stream: None,
        })
    }

    #[napi]
    pub fn get_sample_rate(&self) -> u32 {
        self.sample_rate
    }

    #[napi]
    pub fn start(&mut self, callback: JsFunction) -> napi::Result<()> {
        let tsfn: ThreadsafeFunction<Vec<i16>, ErrorStrategy::Fatal> = callback
            .create_threadsafe_function(0, |ctx| {
                let vec: Vec<i16> = ctx.value;
                let mut pcm_bytes = Vec::with_capacity(vec.len() * 2);
                for sample in vec {
                    pcm_bytes.extend_from_slice(&sample.to_le_bytes());
                }
                Ok(vec![pcm_bytes])
            })?;

        self.stop_signal.store(false, Ordering::SeqCst);
        let stop_signal = self.stop_signal.clone();
        
        // Lazy init: Create SpeakerInput now
        let input = if let Some(existing) = self.input.take() {
            existing
        } else {
            println!("[SystemAudioCapture] Creating system audio stream...");
            match speaker::SpeakerInput::new(self.device_id.take()) {
                Ok(i) => i,
                Err(e) => {
                    println!("[SystemAudioCapture] Failed: {}. Trying default...", e);
                    match speaker::SpeakerInput::new(None) {
                        Ok(i) => i,
                        Err(e2) => return Err(napi::Error::from_reason(format!("Failed: {}", e2))),
                    }
                }
            }
        };
        
        let mut stream = input.stream();
        let input_sample_rate = stream.sample_rate() as f64;
        let mut consumer = stream.take_consumer()
            .ok_or_else(|| napi::Error::from_reason("Failed to get consumer"))?;
        
        self.stream = Some(stream);

        // Ensure AEC is initialized so we can push reference frames
        ensure_aec_initialized();
        // Take the reference producer ONCE — moved into the DSP thread (no mutex on hot path)
        let aec_producer = take_reference_producer();

        // DSP thread with silence suppression + AEC reference feed
        self.capture_thread = Some(thread::spawn(move || {
            let mut resampler = StreamingResampler::new(input_sample_rate, 16000.0);
            let mut frame_buffer: Vec<i16> = Vec::with_capacity(FRAME_SAMPLES * 4);
            let mut raw_batch: Vec<f32> = Vec::with_capacity(4096);
            
            // Use system audio config (lower threshold for quieter system audio)
            let mut suppressor = SilenceSuppressor::new(
                SilenceSuppressionConfig::for_system_audio()
            );

            // AEC reference producer (lock-free, owned by this thread)
            let mut ref_producer = aec_producer;
            let has_aec = ref_producer.is_some();

            println!("[SystemAudioCapture] DSP thread started (suppression={}, AEC_ref={})",
                true, has_aec);

            loop {
                if stop_signal.load(Ordering::Relaxed) {
                    break;
                }
                
                // 1. Drain ring buffer (lock-free)
                let mut _batch_count = 0;
                while let Some(sample) = consumer.try_pop() {
                    raw_batch.push(sample);
                    _batch_count += 1;
                    if raw_batch.len() >= 480 {
                        break;
                    }
                }
                
                // 2. Resample
                if !raw_batch.is_empty() {
                    let resampled = resampler.resample(&raw_batch);
                    frame_buffer.extend(resampled);
                    raw_batch.clear();
                }

                // 3. Process frames with Silence Suppression + AEC reference push
                while frame_buffer.len() >= FRAME_SAMPLES {
                    let frame: Vec<i16> = frame_buffer.drain(0..FRAME_SAMPLES).collect();
                    
                    // === AEC REFERENCE FEED (lock-free, no mutex) ===
                    if let Some(ref mut producer) = ref_producer {
                        for &sample in &frame {
                            let _ = producer.try_push(sample);
                        }
                    }
                    
                    match suppressor.process(&frame) {
                        FrameAction::Send(audio) => {
                             tsfn.call(audio, ThreadsafeFunctionCallMode::NonBlocking);
                        },
                        FrameAction::SendSilence => {
                             tsfn.call(generate_silence_frame(FRAME_SAMPLES), ThreadsafeFunctionCallMode::NonBlocking);
                        },
                        FrameAction::Suppress => {
                            // Do nothing (bandwidth saving)
                        }
                    }
                }
                
                // 4. Short sleep
                if frame_buffer.len() < FRAME_SAMPLES {
                    thread::sleep(Duration::from_millis(DSP_POLL_MS));
                }
            }
            
            println!("[SystemAudioCapture] DSP thread stopped.");
        }));

        Ok(())
    }

    #[napi]
    pub fn stop(&mut self) {
        self.stop_signal.store(true, Ordering::SeqCst);
        if let Some(handle) = self.capture_thread.take() {
            let _ = handle.join();
        }
        self.stream = None;
    }
}

// ============================================================================
// MICROPHONE CAPTURE (CPAL)
// ============================================================================

#[napi]
pub struct MicrophoneCapture {
    stop_signal: Arc<AtomicBool>,
    capture_thread: Option<thread::JoinHandle<()>>,
    sample_rate: u32,
    input: Option<microphone::MicrophoneStream>,
}

#[napi]
impl MicrophoneCapture {
    #[napi(constructor)]
    pub fn new(device_id: Option<String>) -> napi::Result<Self> {
        let input = match microphone::MicrophoneStream::new(device_id) {
            Ok(i) => i,
            Err(e) => return Err(napi::Error::from_reason(format!("Failed: {}", e))),
        };
        
        let sample_rate = 16000;

        Ok(MicrophoneCapture {
            stop_signal: Arc::new(AtomicBool::new(false)),
            capture_thread: None,
            sample_rate,
            input: Some(input),
        })
    }

    #[napi]
    pub fn get_sample_rate(&self) -> u32 {
        self.sample_rate
    }

    #[napi]
    pub fn start(&mut self, callback: JsFunction) -> napi::Result<()> {
        let tsfn: ThreadsafeFunction<Vec<i16>, ErrorStrategy::Fatal> = callback
            .create_threadsafe_function(0, |ctx| {
                let vec: Vec<i16> = ctx.value;
                let mut pcm_bytes = Vec::with_capacity(vec.len() * 2);
                for sample in vec {
                    pcm_bytes.extend_from_slice(&sample.to_le_bytes());
                }
                Ok(vec![pcm_bytes])
            })?;

        self.stop_signal.store(false, Ordering::SeqCst);
        let stop_signal = self.stop_signal.clone();
        
        let input_ref = self.input.as_mut()
            .ok_or_else(|| napi::Error::from_reason("Input missing"))?;
        
        input_ref.play().map_err(|e| napi::Error::from_reason(format!("{}", e)))?;
        
        let input_sample_rate = input_ref.sample_rate() as f64;
        let mut consumer = input_ref.take_consumer()
            .ok_or_else(|| napi::Error::from_reason("Failed to get consumer"))?;

        // Ensure AEC is initialized so we can process capture frames
        ensure_aec_initialized();
        // Take the canceller ONCE — moved into the DSP thread (no mutex on hot path)
        let aec_canceller = take_canceller();

        // DSP thread with AEC + silence suppression
        self.capture_thread = Some(thread::spawn(move || {
            let mut resampler = StreamingResampler::new(input_sample_rate, 16000.0);
            let mut frame_buffer: Vec<i16> = Vec::with_capacity(FRAME_SAMPLES * 4);
            let mut raw_batch: Vec<f32> = Vec::with_capacity(4096);
            
            // Use microphone config (standard threshold)
            let mut suppressor = SilenceSuppressor::new(
                SilenceSuppressionConfig::for_microphone()
            );

            // AEC canceller (lock-free, owned by this thread)
            let mut canceller = aec_canceller;
            let has_aec = canceller.is_some();

            println!("[MicrophoneCapture] DSP thread started (suppression={}, AEC={})",
                true, has_aec);

            loop {
                if stop_signal.load(Ordering::Relaxed) {
                    break;
                }
                
                // 1. Drain ring buffer (lock-free)
                let mut _batch_count = 0;
                while let Some(sample) = consumer.try_pop() {
                    raw_batch.push(sample);
                    _batch_count += 1;
                    if raw_batch.len() >= 480 {
                        break;
                    }
                }
                
                // 2. Resample
                if !raw_batch.is_empty() {
                    let resampled = resampler.resample(&raw_batch);
                    frame_buffer.extend(resampled);
                    raw_batch.clear();
                }

                // 3. Process frames: AEC → Silence Suppression
                while frame_buffer.len() >= FRAME_SAMPLES {
                    let frame: Vec<i16> = frame_buffer.drain(0..FRAME_SAMPLES).collect();
                    
                    // === AEC CAPTURE PROCESSING (lock-free, no mutex) ===
                    let cleaned_frame = if let Some(ref mut aec) = canceller {
                        aec.process_capture(&frame)
                    } else {
                        frame // No AEC — pass through unchanged
                    };
                    
                    match suppressor.process(&cleaned_frame) {
                        FrameAction::Send(audio) => {
                             tsfn.call(audio, ThreadsafeFunctionCallMode::NonBlocking);
                        },
                        FrameAction::SendSilence => {
                             tsfn.call(generate_silence_frame(FRAME_SAMPLES), ThreadsafeFunctionCallMode::NonBlocking);
                        },
                        FrameAction::Suppress => {
                            // Do nothing
                        }
                    }
                }
                
                // 4. Short sleep
                if frame_buffer.len() < FRAME_SAMPLES {
                    thread::sleep(Duration::from_millis(DSP_POLL_MS));
                }
            }
            
            println!("[MicrophoneCapture] DSP thread stopped.");
        }));

        Ok(())
    }

    #[napi]
    pub fn stop(&mut self) {
        self.stop_signal.store(true, Ordering::SeqCst);
        if let Some(handle) = self.capture_thread.take() {
            let _ = handle.join();
        }
        if let Some(input) = self.input.as_ref() {
            let _ = input.pause();
        }
    }
}

// ============================================================================
// DEVICE ENUMERATION
// ============================================================================

#[napi(object)]
pub struct AudioDeviceInfo {
    pub id: String,
    pub name: String,
}

#[napi]
pub fn get_input_devices() -> Vec<AudioDeviceInfo> {
    match microphone::list_input_devices() {
        Ok(devs) => devs.into_iter()
            .map(|(id, name)| AudioDeviceInfo { id, name })
            .collect(),
        Err(e) => {
            eprintln!("[get_input_devices] Error: {}", e);
            Vec::new()
        }
    }
}

#[napi]
pub fn get_output_devices() -> Vec<AudioDeviceInfo> {
    match speaker::list_output_devices() {
        Ok(devs) => devs.into_iter()
            .map(|(id, name)| AudioDeviceInfo { id, name })
            .collect(),
        Err(e) => {
            eprintln!("[get_output_devices] Error: {}", e);
            Vec::new()
        }
    }
}

// ============================================================================
// AEC CONTROL (NAPI exports)
// ============================================================================

#[napi(object)]
pub struct AecStatsInfo {
    pub enabled: bool,
    pub frames_processed: i64,
    pub frames_with_echo: i64,
    pub frames_passthrough: i64,
    pub reference_underruns: i64,
}

/// Toggle AEC on/off at runtime
#[napi]
pub fn set_aec_enabled(enabled: bool) {
    if let Ok(state) = GLOBAL_AEC.lock() {
        if let Some(ref flag) = state.enabled_flag {
            flag.store(enabled, Ordering::Relaxed);
            println!("[AEC] Set enabled: {}", enabled);
        } else {
            println!("[AEC] Cannot set enabled: AEC not initialized");
        }
    }
}

/// Get current AEC statistics
#[napi]
pub fn get_aec_stats() -> AecStatsInfo {
    if let Ok(state) = GLOBAL_AEC.lock() {
        let enabled = state.enabled_flag.as_ref()
            .map(|f| f.load(Ordering::Relaxed))
            .unwrap_or(false);
        let stats = state.stats.as_ref();
        AecStatsInfo {
            enabled,
            frames_processed: stats.map(|s| s.frames_processed.load(Ordering::Relaxed) as i64).unwrap_or(0),
            frames_with_echo: stats.map(|s| s.frames_with_echo.load(Ordering::Relaxed) as i64).unwrap_or(0),
            frames_passthrough: stats.map(|s| s.frames_passthrough.load(Ordering::Relaxed) as i64).unwrap_or(0),
            reference_underruns: stats.map(|s| s.reference_underruns.load(Ordering::Relaxed) as i64).unwrap_or(0),
        }
    } else {
        AecStatsInfo {
            enabled: false,
            frames_processed: 0,
            frames_with_echo: 0,
            frames_passthrough: 0,
            reference_underruns: 0,
        }
    }
}
