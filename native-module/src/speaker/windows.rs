// Ported logic - Fixed for wasapi 0.13 + ringbuf
use anyhow::Result;
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;
use wasapi::{get_default_device, DeviceCollection, Direction, SampleType, WaveFormat, ShareMode, calculate_period_100ns, AudioCaptureClient};
use ringbuf::{HeapRb, HeapProd, HeapCons};
use ringbuf::traits::{Split, Producer}; // Import traits!

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
        // Explicit type for init_result to help inference
        let init_result: Result<(_, _, u32, usize)> = (|| {
            let device = match device_id {
                Some(ref id) => match find_device_by_id(&Direction::Render, id) {
                    Some(d) => d,
                    // get_default_device returns Result, so we use ? or map_err
                    None => get_default_device(&Direction::Render).map_err(|e| anyhow::anyhow!("{}", e))?,
                },
                None => get_default_device(&Direction::Render).map_err(|e| anyhow::anyhow!("{}", e))?,
            };

            let mut audio_client = device.get_iaudioclient().map_err(|e| anyhow::anyhow!("{}", e))?;
            let device_format = audio_client.get_mixformat().map_err(|e| anyhow::anyhow!("{}", e))?;
            let actual_rate = device_format.get_samplespersec();
            
            // Loopback capture requires shared mode
            let desired_format = WaveFormat::new(32, 32, &SampleType::Float, actual_rate as usize, device_format.get_nchannels() as usize, None);

            let (def_time, min_time) = audio_client.get_periods().map_err(|e| anyhow::anyhow!("{}", e))?;
            
            // Loopback capture initialization
            audio_client.initialize_client(
                &desired_format, 
                min_time as i64, 
                &Direction::Render, 
                &ShareMode::Shared, 
                true
            ).or_else(|_| {
                 audio_client.initialize_client(
                    &desired_format, 
                    min_time as i64, 
                    &Direction::Capture, 
                    &ShareMode::Shared, 
                    true
                )
            }).map_err(|e| anyhow::anyhow!("Init failed: {}", e))?;

            let h_event = audio_client.set_get_eventhandle().map_err(|e| anyhow::anyhow!("{}", e))?;
            let render_client = audio_client.get_audiocaptureclient().map_err(|e| anyhow::anyhow!("{}", e))?;
            audio_client.start_stream().map_err(|e| anyhow::anyhow!("{}", e))?;

            Ok((h_event, render_client, actual_rate, device_format.get_nchannels() as usize))
        })();

        match init_result {
            Ok((h_event, render_client, sample_rate, channels)) => {
                let _ = init_tx.send(Ok(sample_rate));
                loop {
                    {
                        let state = waker_state.lock().unwrap();
                        if state.shutdown {
                            break;
                        }
                    }

                    if h_event.wait_for_event(3000).is_err() {
                        eprintln!("[SpeakerStream] Timeout error, stopping capture");
                        break;
                    }

                    let mut temp_queue = std::collections::VecDeque::new(); 
                    
                    let packet_size = match render_client.get_next_nbr_frames() {
                        Ok(s) => s,
                        Err(e) => {
                             eprintln!("[SpeakerStream] Failed to get packet size: {}", e);
                             continue;
                        }
                    };
                    
                    let frame_count = match packet_size {
                        Some(0) => continue,
                        Some(n) => n,
                        None => continue,
                    };

                    if let Err(e) = render_client.read_from_device_to_deque(frame_count as usize, &mut temp_queue) {
                        eprintln!("Failed to read audio data: {}", e);
                        continue;
                    }

                    if temp_queue.is_empty() {
                        continue;
                    }
                    
                    let block_align = (32 / 8) * channels; 
                    
                     while temp_queue.len() >= block_align {
                        // Read first channel (4 bytes)
                        let b1 = temp_queue.pop_front().unwrap(); 
                        let b2 = temp_queue.pop_front().unwrap();
                        let b3 = temp_queue.pop_front().unwrap();
                        let b4 = temp_queue.pop_front().unwrap();
                        
                        let sample = f32::from_le_bytes([b1, b2, b3, b4]);
                        
                        // Push to ringbuffer - use try_push for HeapProd
                        let _ = producer.try_push(sample);
                        
                        // Skip other channels
                        for _ in 0..((channels - 1) * 4) {
                            temp_queue.pop_front();
                        }
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
