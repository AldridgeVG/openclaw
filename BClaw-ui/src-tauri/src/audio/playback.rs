use base64::{engine::general_purpose, Engine as _};
use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::Arc;

use super::{pcm16_bytes_to_f32, Resampler, SAMPLE_RATE};

pub struct PlaybackHandle {
    stream: cpal::Stream,
    shutdown: Arc<AtomicBool>,
}

impl PlaybackHandle {
    pub fn stop(self) {
        self.shutdown.store(true, Ordering::Relaxed);
        let _ = self.stream.pause();
    }
}

/// Play PCM16 audio (little-endian, mono, 24kHz) encoded as base64.
/// Automatically resamples to the default output device's supported sample rate.
pub fn play_pcm16_base64(audio_base64: String) -> Result<PlaybackHandle, String> {
    eprintln!("[audio] play_pcm16_base64, base64 len={}", audio_base64.len());
    let pcm_bytes = general_purpose::STANDARD
        .decode(audio_base64)
        .map_err(|e| format!("Base64 decode error: {}", e))?;

    let samples = pcm16_bytes_to_f32(&pcm_bytes);
    eprintln!("[audio] decoded {} bytes -> {} samples", pcm_bytes.len(), samples.len());
    if samples.is_empty() {
        return Err("No audio samples to play".to_string());
    }

    let host = cpal::default_host();
    let device = host
        .default_output_device()
        .ok_or_else(|| "No default output device available".to_string())?;

    eprintln!("[audio] playback device: {:?}", device.name());

    let supported_config = device
        .default_output_config()
        .map_err(|e| format!("Failed to get default output config: {}", e))?;

    let output_channels = supported_config.channels() as usize;
    let output_sample_rate = supported_config.sample_rate().0;
    eprintln!(
        "[audio] output supported config: {} channels @ {} Hz",
        output_channels, output_sample_rate
    );

    // Resample to output device rate if necessary
    let samples = if output_sample_rate != SAMPLE_RATE {
        eprintln!(
            "[audio] resampling from {} Hz to {} Hz",
            SAMPLE_RATE, output_sample_rate
        );
        let mut resampler = Resampler::new(SAMPLE_RATE as f64, output_sample_rate as f64);
        let mut resampled = Vec::new();
        resampler.process(&samples, &mut resampled);
        resampled
    } else {
        samples
    };

    // Expand mono to interleaved multi-channel if device requires more than 1 channel
    let samples: Vec<f32> = if output_channels == 1 {
        samples
    } else {
        samples
            .iter()
            .flat_map(|&s| std::iter::repeat(s).take(output_channels))
            .collect()
    };

    let config: cpal::StreamConfig = supported_config.into();
    eprintln!("[audio] output stream config: {:?}", config);

    let samples_arc = Arc::new(samples);
    let read_index = Arc::new(AtomicUsize::new(0));
    let shutdown = Arc::new(AtomicBool::new(false));

    let samples_clone = samples_arc.clone();
    let read_index_clone = read_index.clone();
    let shutdown_clone = shutdown.clone();

    let stream = device
        .build_output_stream(
            &config,
            move |output: &mut [f32], _: &cpal::OutputCallbackInfo| {
                if shutdown_clone.load(Ordering::Relaxed) {
                    for sample in output.iter_mut() {
                        *sample = 0.0;
                    }
                    return;
                }
                let idx = read_index_clone.load(Ordering::Relaxed);
                let total = samples_clone.len();
                if idx >= total {
                    for sample in output.iter_mut() {
                        *sample = 0.0;
                    }
                    return;
                }
                let to_copy = output.len().min(total - idx);
                output[..to_copy].copy_from_slice(&samples_clone[idx..idx + to_copy]);
                for sample in output[to_copy..].iter_mut() {
                    *sample = 0.0;
                }
                read_index_clone.store(idx + to_copy, Ordering::Relaxed);
            },
            move |err| {
                eprintln!("[audio] playback stream error: {}", err);
            },
            None,
        )
        .map_err(|e| format!("Failed to build output stream: {}", e))?;

    stream
        .play()
        .map_err(|e| format!("Failed to start playback stream: {}", e))?;

    eprintln!("[audio] playback stream started");
    Ok(PlaybackHandle {
        stream,
        shutdown,
    })
}

