pub mod capture;
pub mod playback;

/// Standard audio format used by openclaw gateway-relay mode.
pub const SAMPLE_RATE: u32 = 24_000;

/// Simple linear-interpolation resampler that carries state across buffers.
pub struct Resampler {
    input_rate: f64,
    output_rate: f64,
    total_input: u64,
}

impl Resampler {
    pub fn new(input_rate: f64, output_rate: f64) -> Self {
        Self {
            input_rate,
            output_rate,
            total_input: 0,
        }
    }

    pub fn process(&mut self, input: &[f32], output: &mut Vec<f32>) {
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

/// Convert interleaved f32 samples (range [-1.0, 1.0]) to little-endian PCM16 bytes.
pub fn f32_to_pcm16_bytes(samples: &[f32]) -> Vec<u8> {
    let mut bytes = Vec::with_capacity(samples.len() * 2);
    for &sample in samples {
        let clamped = sample.max(-1.0).min(1.0);
        let pcm = if clamped < 0.0 {
            (clamped * 32768.0) as i16
        } else {
            (clamped * 32767.0) as i16
        };
        bytes.extend_from_slice(&pcm.to_le_bytes());
    }
    bytes
}

/// Convert little-endian PCM16 bytes to f32 samples (range [-1.0, 1.0]).
pub fn pcm16_bytes_to_f32(bytes: &[u8]) -> Vec<f32> {
    let sample_count = bytes.len() / 2;
    let mut samples = Vec::with_capacity(sample_count);
    for i in 0..sample_count {
        let pcm = i16::from_le_bytes([bytes[i * 2], bytes[i * 2 + 1]]);
        samples.push(pcm as f32 / 32768.0);
    }
    samples
}
