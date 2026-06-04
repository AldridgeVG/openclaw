use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

const MODEL_NAME: &str = "sherpa-onnx-paraformer-zh-int8-2025-10-07";
const MODEL_URL: &str = "https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-paraformer-zh-int8-2025-10-07.tar.bz2";
const MODEL_DIR: &str = "models/paraformer-zh";

struct AsrManagerInner {
    recognizer: Mutex<Option<sherpa_onnx::OfflineRecognizer>>,
    model_dir: PathBuf,
}

#[derive(Clone)]
pub struct AsrManager {
    inner: Arc<AsrManagerInner>,
}

impl AsrManager {
    pub fn new(data_dir: &Path) -> Self {
        let model_dir = data_dir.join(MODEL_DIR);
        Self {
            inner: Arc::new(AsrManagerInner {
                recognizer: Mutex::new(None),
                model_dir,
            }),
        }
    }

    pub fn model_ready(&self) -> bool {
        self.inner.model_dir.join(MODEL_NAME).join("model.int8.onnx").exists()
            && self.inner.model_dir.join(MODEL_NAME).join("tokens.txt").exists()
    }

    /// Download and extract model if not present.
    pub async fn ensure_model(&self) -> Result<(), String> {
        if self.model_ready() {
            return Ok(());
        }

        eprintln!("[asr] model not found, downloading...");
        std::fs::create_dir_all(&self.inner.model_dir).map_err(|e| e.to_string())?;

        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(600))
            .build()
            .map_err(|e| e.to_string())?;

        let resp = client
            .get(MODEL_URL)
            .send()
            .await
            .map_err(|e| format!("Download model failed: {}", e))?;

        let bytes = resp
            .bytes()
            .await
            .map_err(|e| format!("Read model bytes failed: {}", e))?;

        let tar_path = self.inner.model_dir.join("model.tar.bz2");
        let model_dir = self.inner.model_dir.clone();

        tokio::task::spawn_blocking(move || -> Result<(), String> {
            std::fs::write(&tar_path, &bytes).map_err(|e| e.to_string())?;

            let tar = std::fs::File::open(&tar_path).map_err(|e| e.to_string())?;
            let mut archive = tar::Archive::new(bzip2::read::BzDecoder::new(tar));
            archive.unpack(&model_dir).map_err(|e| e.to_string())?;

            let _ = std::fs::remove_file(&tar_path);
            Ok(())
        })
        .await
        .map_err(|e| format!("Model extract task failed: {}", e))??;

        eprintln!("[asr] model downloaded and extracted");
        Ok(())
    }

    fn init_recognizer(&self) -> Result<(), String> {
        let mut guard = self.inner.recognizer.lock().map_err(|e| e.to_string())?;
        if guard.is_some() {
            return Ok(());
        }

        let model_path = self.inner.model_dir.join(MODEL_NAME);
        let model_file = model_path.join("model.int8.onnx");
        let tokens_file = model_path.join("tokens.txt");

        if !model_file.exists() {
            return Err(format!("Model file not found: {:?}", model_file));
        }
        if !tokens_file.exists() {
            return Err(format!("Tokens file not found: {:?}", tokens_file));
        }

        let mut config = sherpa_onnx::OfflineRecognizerConfig::default();
        config.model_config.paraformer = sherpa_onnx::OfflineParaformerModelConfig {
            model: Some(model_file.to_string_lossy().to_string()),
        };
        config.model_config.tokens = Some(tokens_file.to_string_lossy().to_string());
        config.model_config.provider = Some("cpu".to_string());
        config.model_config.num_threads = 4;

        let recognizer = sherpa_onnx::OfflineRecognizer::create(&config)
            .ok_or_else(|| "Failed to create recognizer".to_string())?;

        *guard = Some(recognizer);
        eprintln!("[asr] recognizer initialized");
        Ok(())
    }

    pub fn transcribe(&self, samples: &[i16], sample_rate: i32) -> Result<String, String> {
        self.init_recognizer()?;

        let guard = self.inner.recognizer.lock().map_err(|e| e.to_string())?;
        let recognizer = guard.as_ref().ok_or("Recognizer not initialized")?;

        // Convert i16 PCM to f32 [-1.0, 1.0]
        let f32_samples: Vec<f32> = samples
            .iter()
            .map(|s| *s as f32 / 32768.0)
            .collect();

        let stream = recognizer.create_stream();
        stream.accept_waveform(sample_rate, &f32_samples);
        recognizer.decode(&stream);

        match stream.get_result() {
            Some(result) => Ok(result.text),
            None => Err("Recognition returned no result".into()),
        }
    }
}
