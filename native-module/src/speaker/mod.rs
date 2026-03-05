#[cfg(target_os = "windows")]
pub mod windows;
#[cfg(target_os = "windows")]
pub use windows::{SpeakerInput, list_output_devices, SpeakerStream};

#[cfg(target_os = "macos")]
pub mod macos;
#[cfg(target_os = "macos")]
pub use macos::{SpeakerInput, list_output_devices, SpeakerStream};

#[cfg(target_os = "macos")]
pub mod sck;
#[cfg(target_os = "macos")]
pub mod core_audio;

