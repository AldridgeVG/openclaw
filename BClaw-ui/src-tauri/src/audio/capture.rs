use base64::{engine::general_purpose, Engine as _};
use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::{AppHandle, Emitter};

use super::f32_to_pcm16_bytes;

#[derive(Clone, serde::Serialize)]
struct CapturePayload {
    audio_base64: String,
    timestamp_ms: u64,
}

/// Simple linear-interpolation resampler that carries state across buffers.
struct Resampler {
    input_rate: f64,
    output_rate: f64,
    total_input: u64,
}

impl Resampler {
    fn new(input_rate: f64, output_rate: f64) -> Self {
        Self {
            input_rate,
            output_rate,
            total_input: 0,
        }
    }

    fn process(&mut self, input: &[f32], output: &mut Vec<f32>) {
        let ratio = self.input_rate / self.output_rate;
        let n = input.len();
        let j_start = ((self.total_input as f64) / ratio).ceil() as u64;
        let j_end = ((self.total_input as f64 + n as f64) / ratio).ceil() as u64;

        for j in j_start..j_end {
            let pos = j as f64 * ratio - self.total_input as f64;
            let idx = pos as usize;
            if idx >= n {
                break;
            }
            let frac = (pos - idx as f64) as f32;
            let sample = if idx + 1 < n {
                input[idx] * (1.0 - frac) + input[idx + 1] * frac
            } else {
                input[idx]
            };
            output.push(sample);
        }

        self.total_input += n as u64;
    }
}

/// Internal implementation that allows specifying the Tauri event name.
pub fn start_capture_with_event(
    app: AppHandle,
    device_name: Option<String>,
    target_sample_rate: u32,
    event_name: &'static str,
) -> Result<cpal::Stream, String> {
    let host = cpal::default_host();
    let device = if let Some(name) = device_name {
        let mut found = None;
        for d in host.input_devices().map_err(|e| e.to_string())? {
            if let Ok(dname) = d.name() {
                if dname == name {
                    found = Some(d);
                    break;
                }
            }
        }
        found.ok_or_else(|| format!("Input device '{}' not found", name))?
    } else {
        host.default_input_device()
            .ok_or_else(|| "No default input device available".to_string())?
    };

    eprintln!("[audio] capture device: {:?}", device.name());

    let supported_config = device
        .default_input_config()
        .map_err(|e| format!("Failed to get default input config: {}", e))?;

    let input_channels = supported_config.channels() as usize;
    let input_sample_rate = supported_config.sample_rate().0 as f64;

    eprintln!(
        "[audio] supported config: {} channels @ {} Hz",
        input_channels, input_sample_rate
    );

    let config: cpal::StreamConfig = supported_config.into();
    eprintln!("[audio] stream config: {:?}", config);

    let running = Arc::new(AtomicBool::new(true));
    let app_handle = app;
    let mut resampler = Resampler::new(input_sample_rate, target_sample_rate as f64);

    let stream = device
        .build_input_stream(
            &config,
            move |data: &[f32], _: &cpal::InputCallbackInfo| {
                if !running.load(Ordering::Relaxed) {
                    return;
                }

                // Convert interleaved multi-channel to mono
                let mono_samples: Vec<f32> = if input_channels == 1 {
                    data.to_vec()
                } else {
                    data.chunks(input_channels)
                        .map(|chunk| chunk.iter().sum::<f32>() / chunk.len() as f32)
                        .collect()
                };

                // Resample to target rate
                let mut resampled = Vec::new();
                resampler.process(&mono_samples, &mut resampled);

                if resampled.is_empty() {
                    return;
                }

                let pcm_bytes = f32_to_pcm16_bytes(&resampled);
                let base64 = general_purpose::STANDARD.encode(&pcm_bytes);
                eprintln!(
                    "[audio] captured {} samples ({} mono @ {} Hz) -> {} resampled -> {} base64 chars",
                    data.len(),
                    mono_samples.len(),
                    input_sample_rate,
                    resampled.len(),
                    base64.len()
                );
                let payload = CapturePayload {
                    audio_base64: base64,
                    timestamp_ms: std::time::SystemTime::now()
                        .duration_since(std::time::UNIX_EPOCH)
                        .unwrap_or_default()
                        .as_millis() as u64,
                };
                // Best-effort emit; ignore errors if frontend is not ready.
                if let Err(e) = app_handle.emit(event_name, payload) {
                    eprintln!("[audio] emit error: {}", e);
                }
            },
            move |err| {
                eprintln!("[audio] capture stream error: {}", err);
            },
            None,
        )
        .map_err(|e| format!("Failed to build input stream: {}", e))?;

    stream
        .play()
        .map_err(|e| format!("Failed to start capture stream: {}", e))?;

    eprintln!("[audio] capture stream started");
    Ok(stream)
}

/// Start capturing microphone audio and emit PCM16 base64 frames via the default `audio:capture` event.
pub fn start_capture(
    app: AppHandle,
    device_name: Option<String>,
    target_sample_rate: u32,
) -> Result<cpal::Stream, String> {
    start_capture_with_event(app, device_name, target_sample_rate, "audio:capture")
}
