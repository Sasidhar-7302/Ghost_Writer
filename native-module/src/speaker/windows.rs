// Ported logic - Fixed for wasapi 0.13 + ringbuf
use anyhow::Result;
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;
use wasapi::{get_default_device, DeviceCollection, Direction, SampleType, WaveFormat, ShareMode};
use ringbuf::{HeapRb, HeapProd, HeapCons};
use ringbuf::traits::{Split, Producer}; // Import traits!
use windows::Win32::System::Com::{CoInitializeEx, COINIT_MULTITHREADED};

struct WakerState {
    shutdown: bool,
}

pub struct SpeakerInput {
    device_id: Option<String>,
}

pub struct SpeakerStream {
    waker_state: Arc<Mutex<WakerState>>,
    capture_thread: Option<thread::JoinHandle<()>>,
    actual_sample_rate: u32,
    consumer: Option<HeapCons<f32>>,
}



impl SpeakerStream {
    pub fn sample_rate(&self) -> u32 {
        self.actual_sample_rate
    }
    
    // Implement the missing method required by lib.rs
    pub fn take_consumer(&mut self) -> Option<HeapCons<f32>> {
        self.consumer.take()
    }
}

// Helper to find device by ID
fn find_device_by_id(direction: &Direction, device_id: &str) -> Option<wasapi::Device> {
    let collection = DeviceCollection::new(direction).ok()?;
    let count = collection.get_nbr_devices().ok()?;

    for i in 0..count {
        if let Ok(device) = collection.get_device_at_index(i) {
            if let Ok(id) = device.get_id() {
                if id == device_id {
                    return Some(device);
                }
            }
        }
    }
    None
}

pub fn list_output_devices() -> Result<Vec<(String, String)>> {
    // Ensure COM is initialized on calling thread
    unsafe { let _ = CoInitializeEx(None, COINIT_MULTITHREADED); }
    let collection = DeviceCollection::new(&Direction::Render).map_err(|e| anyhow::anyhow!("{}", e))?;
    let count = collection.get_nbr_devices().map_err(|e| anyhow::anyhow!("{}", e))?;
    let mut list = Vec::new();

    for i in 0..count {
        if let Ok(device) = collection.get_device_at_index(i) {
            let id = device.get_id().unwrap_or_default();
            let name = device.get_friendlyname().unwrap_or_default();
            if !id.is_empty() {
                list.push((id, name));
            }
        }
    }
    Ok(list)
}

impl SpeakerInput {
    pub fn new(device_id: Option<String>) -> Result<Self> {
        let device_id = device_id.filter(|id| !id.is_empty() && id != "default");
        Ok(Self { device_id })
    }

    pub fn stream(self) -> SpeakerStream {
        // Create ring buffer
        let rb = HeapRb::<f32>::new(131072); // 128KB buffer equivalent (approx 8s of mono 16khz float)
        let (producer, consumer) = rb.split();

        let waker_state = Arc::new(Mutex::new(WakerState {
            shutdown: false,
        }));
        
        // Use std::sync::mpsc for initialization result
        let (init_tx, init_rx) = std::sync::mpsc::channel();

        let waker_clone = waker_state.clone();
        let device_id = self.device_id;

        let capture_thread = thread::spawn(move || {
            if let Err(e) = Self::capture_audio_loop(producer, waker_clone, init_tx, device_id) {
                eprintln!("[SpeakerStream] Audio capture loop failed: {}", e);
            }
        });

        let actual_sample_rate = match init_rx.recv_timeout(Duration::from_secs(5)) {
            Ok(Ok(rate)) => rate,
            Ok(Err(e)) => {
                eprintln!("[SpeakerStream] Audio initialization failed: {}", e);
                44100
            }
            Err(_) => {
                eprintln!("[SpeakerStream] Audio initialization timeout");
                44100
            }
        };

        SpeakerStream {
            waker_state,
            capture_thread: Some(capture_thread),
            actual_sample_rate,
            consumer: Some(consumer),
        }
    }

    fn capture_audio_loop(
        mut producer: HeapProd<f32>,
        waker_state: Arc<Mutex<WakerState>>,
        init_tx: std::sync::mpsc::Sender<Result<u32>>,
        device_id: Option<String>,
    ) -> Result<()> {
        // COM must be initialized on this thread for WASAPI
        unsafe { CoInitializeEx(None, COINIT_MULTITHREADED).ok().unwrap_or_default(); }
        
        // Helper: try to init loopback on a specific device
        fn try_init_loopback_on_device(device: &wasapi::Device) -> Result<(wasapi::Handle, wasapi::AudioCaptureClient, u32, usize)> {
            let device_name = device.get_friendlyname().unwrap_or_else(|_| "Unknown".to_string());
            println!("[SpeakerStream] Trying device: {}", device_name);
            
            let mut audio_client = device.get_iaudioclient().map_err(|e| anyhow::anyhow!("{}", e))?;
            let device_format = audio_client.get_mixformat().map_err(|e| anyhow::anyhow!("{}", e))?;
            let actual_rate = device_format.get_samplespersec();
            let channels = device_format.get_nchannels() as usize;
            let (def_time, _min_time) = audio_client.get_periods().map_err(|e| anyhow::anyhow!("{}", e))?;
            
            println!("[SpeakerStream]   Format: {}Hz, {}ch, period: {}", actual_rate, channels, def_time);
            
            // Strategy A: Device's native mix format + default period
            // CRITICAL: direction must be Direction::Capture for loopback!
            // wasapi sets AUDCLNT_STREAMFLAGS_LOOPBACK only when device=Render + direction=Capture
            let init_result = audio_client.initialize_client(
                &device_format,
                def_time as i64,
                &Direction::Capture,
                &ShareMode::Shared,
                true,
            );
            
            if init_result.is_ok() {
                println!("[SpeakerStream]   ✓ Strategy A succeeded (native format)");
            } else {
                println!("[SpeakerStream]   ✗ Strategy A failed: {}", init_result.as_ref().unwrap_err());
                // Strategy B: Custom 32-bit float format + default period
                audio_client = device.get_iaudioclient().map_err(|e| anyhow::anyhow!("{}", e))?;
                let custom_format = WaveFormat::new(32, 32, &SampleType::Float, actual_rate as usize, channels, None);
                audio_client.initialize_client(
                    &custom_format,
                    def_time as i64,
                    &Direction::Capture,
                    &ShareMode::Shared,
                    true,
                ).map_err(|e| {
                    println!("[SpeakerStream]   ✗ Strategy B also failed: {}", e);
                    anyhow::anyhow!("Device '{}' cannot do loopback: {}", device_name, e)
                })?;
                println!("[SpeakerStream]   ✓ Strategy B succeeded (custom format)");
            }
            println!("[SpeakerStream]   Setting event handle...");
            let h_event = audio_client.set_get_eventhandle().map_err(|e| {
                println!("[SpeakerStream]   ✗ set_get_eventhandle failed: {}", e);
                anyhow::anyhow!("{}", e)
            })?;
            println!("[SpeakerStream]   ✓ Event handle set");
            
            println!("[SpeakerStream]   Getting capture client...");
            let capture_client = audio_client.get_audiocaptureclient().map_err(|e| {
                println!("[SpeakerStream]   ✗ get_audiocaptureclient failed: {}", e);
                anyhow::anyhow!("{}", e)
            })?;
            println!("[SpeakerStream]   ✓ Capture client obtained");
            
            println!("[SpeakerStream]   Starting stream...");
            audio_client.start_stream().map_err(|e| {
                println!("[SpeakerStream]   ✗ start_stream failed: {}", e);
                anyhow::anyhow!("{}", e)
            })?;
            
            println!("[SpeakerStream] ✓ Loopback capture started on '{}'!", device_name);
            Ok((h_event, capture_client, actual_rate, channels))
        }

        let init_result: Result<(_, _, u32, usize)> = (|| {
            // 1. Try the requested or default device first
            let default_device = match device_id {
                Some(ref id) => match find_device_by_id(&Direction::Render, id) {
                    Some(d) => d,
                    None => get_default_device(&Direction::Render).map_err(|e| anyhow::anyhow!("{}", e))?,
                },
                None => get_default_device(&Direction::Render).map_err(|e| anyhow::anyhow!("{}", e))?,
            };
            
            let default_id = default_device.get_id().unwrap_or_default();
            
            match try_init_loopback_on_device(&default_device) {
                Ok(result) => return Ok(result),
                Err(e) => println!("[SpeakerStream] Default device failed, trying other devices... ({})", e),
            }
            
            // 2. Enumerate ALL render devices and try each one
            let collection = DeviceCollection::new(&Direction::Render).map_err(|e| anyhow::anyhow!("{}", e))?;
            let count = collection.get_nbr_devices().map_err(|e| anyhow::anyhow!("{}", e))?;
            
            println!("[SpeakerStream] Scanning {} render devices for loopback...", count);
            let mut last_err = anyhow::anyhow!("No devices available");
            
            for i in 0..count {
                if let Ok(dev) = collection.get_device_at_index(i) {
                    let dev_id = dev.get_id().unwrap_or_default();
                    if dev_id == default_id {
                        continue; // Skip the device we already tried
                    }
                    match try_init_loopback_on_device(&dev) {
                        Ok(result) => return Ok(result),
                        Err(e) => { last_err = e; }
                    }
                }
            }
            
            Err(anyhow::anyhow!("All {} render devices failed loopback init. Last error: {}", count, last_err))
        })();

        match init_result {
            Ok((h_event, render_client, sample_rate, channels)) => {
                let _ = init_tx.send(Ok(sample_rate));
                
                // bytes_per_frame for read_from_device_to_deque: channels * bytes_per_sample
                let bytes_per_frame = channels * 4; // 32-bit float = 4 bytes per sample per channel
                println!("[SpeakerStream] Capture loop started ({}Hz, {}ch, {} bytes/frame)", sample_rate, channels, bytes_per_frame);
                
                let mut total_samples: u64 = 0;
                
                loop {
                    {
                        let state = waker_state.lock().unwrap();
                        if state.shutdown {
                            break;
                        }
                    }

                    // Don't break on timeout - loopback only fires events when audio plays
                    if h_event.wait_for_event(100).is_err() {
                        // Short timeout, just continue polling
                        continue;
                    }

                    let mut temp_queue = std::collections::VecDeque::new(); 
                    
                    // Read all available packets
                    loop {
                        let packet_size = match render_client.get_next_nbr_frames() {
                            Ok(s) => s,
                            Err(e) => {
                                 eprintln!("[SpeakerStream] Failed to get packet size: {}", e);
                                 break;
                            }
                        };
                        
                        let _frame_count = match packet_size {
                            Some(0) | None => break,
                            Some(n) => n,
                        };

                        // CRITICAL: first arg is bytes_per_frame, NOT frame_count
                        if let Err(e) = render_client.read_from_device_to_deque(bytes_per_frame, &mut temp_queue) {
                            eprintln!("[SpeakerStream] Failed to read audio data: {}", e);
                            break;
                        }
                    }

                    if temp_queue.is_empty() {
                        continue;
                    }
                    
                     while temp_queue.len() >= bytes_per_frame {
                        // Read first channel (4 bytes)
                        let b1 = temp_queue.pop_front().unwrap(); 
                        let b2 = temp_queue.pop_front().unwrap();
                        let b3 = temp_queue.pop_front().unwrap();
                        let b4 = temp_queue.pop_front().unwrap();
                        
                        let sample = f32::from_le_bytes([b1, b2, b3, b4]);
                        
                        // Push to ringbuffer - use try_push for HeapProd
                        let _ = producer.try_push(sample);
                        total_samples += 1;
                        
                        // Skip other channels
                        for _ in 0..((channels - 1) * 4) {
                            temp_queue.pop_front();
                        }
                    }
                    
                    // Periodic log every ~5 seconds worth of samples
                    if total_samples > 0 && total_samples % (sample_rate as u64 * 5) < 480 {
                        println!("[SpeakerStream] Captured {} total samples", total_samples);
                    }
                }
            }
            Err(e) => {
                let _ = init_tx.send(Err(e));
            }
        }
        Ok(())
    }
}

impl Drop for SpeakerStream {
    fn drop(&mut self) {
        if let Ok(mut state) = self.waker_state.lock() {
            state.shutdown = true;
        }
        if let Some(handle) = self.capture_thread.take() {
             let _ = handle.join();
        }
    }
}
