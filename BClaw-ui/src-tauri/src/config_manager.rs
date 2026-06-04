use serde::{Deserialize, Serialize};
use std::path::PathBuf;

const MODEL_CONFIG_FILENAME: &str = "model-config.json";

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum ProviderType {
    Anthropic,
    Openai,
}

impl Default for ProviderType {
    fn default() -> Self {
        ProviderType::Anthropic
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelConfig {
    #[serde(default)]
    pub provider: ProviderType,
    pub api_key: String,
    pub base_url: String,
    pub model: String,
    #[serde(default)]
    pub small_fast_model: Option<String>,
    #[serde(default = "default_timeout")]
    pub api_timeout_ms: u64,
    #[serde(default)]
    pub disable_nonessential_traffic: bool,
}

fn default_timeout() -> u64 {
    3_000_000
}

impl Default for ModelConfig {
    fn default() -> Self {
        Self {
            provider: ProviderType::Anthropic,
            api_key: String::new(),
            base_url: String::new(),
            model: String::new(),
            small_fast_model: None,
            api_timeout_ms: default_timeout(),
            disable_nonessential_traffic: false,
        }
    }
}

impl ModelConfig {
    /// Convert to environment variables for openclaw gateway process.
    pub fn to_env_vars(&self) -> Vec<(String, String)> {
        let mut vars = Vec::new();

        match self.provider {
            ProviderType::Anthropic => {
                vars.push(("ANTHROPIC_AUTH_TOKEN".to_string(), self.api_key.clone()));
                if !self.base_url.is_empty() {
                    vars.push(("ANTHROPIC_BASE_URL".to_string(), self.base_url.clone()));
                }
                vars.push(("ANTHROPIC_MODEL".to_string(), self.model.clone()));
                if let Some(ref small) = self.small_fast_model {
                    vars.push(("ANTHROPIC_SMALL_FAST_MODEL".to_string(), small.clone()));
                }
            }
            ProviderType::Openai => {
                vars.push(("OPENAI_API_KEY".to_string(), self.api_key.clone()));
                if !self.base_url.is_empty() {
                    vars.push(("OPENAI_BASE_URL".to_string(), self.base_url.clone()));
                }
                vars.push(("OPENAI_MODEL".to_string(), self.model.clone()));
            }
        }

        vars.push(("API_TIMEOUT_MS".to_string(), self.api_timeout_ms.to_string()));

        if self.disable_nonessential_traffic {
            vars.push(("CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC".to_string(), "1".to_string()));
        }

        vars
    }

    /// Generate an openclaw.json fragment for models.providers.
    pub fn to_openclaw_provider_config(&self) -> serde_json::Value {
        match self.provider {
            ProviderType::Anthropic => {
                serde_json::json!({
                    "baseUrl": self.base_url,
                    "apiKey": self.api_key,
                    "api": "anthropic-messages",
                    "authHeader": true,
                    "models": [
                        {
                            "id": self.model,
                            "name": self.model.clone(),
                            "reasoning": true,
                            "input": ["text"],
                            "cost": { "input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0 },
                            "contextWindow": 200000,
                            "maxTokens": 32000,
                        }
                    ]
                })
            }
            ProviderType::Openai => {
                serde_json::json!({
                    "baseUrl": self.base_url,
                    "apiKey": self.api_key,
                    "api": "openai-responses",
                    "authHeader": true,
                    "models": [
                        {
                            "id": self.model,
                            "name": self.model.clone(),
                            "reasoning": false,
                            "input": ["text", "audio", "image"],
                            "cost": { "input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0 },
                            "contextWindow": 128000,
                            "maxTokens": 32000,
                        }
                    ]
                })
            }
        }
    }
}

/// Resolve the directory where BClaw stores its config (read/write).
fn get_bclaw_config_dir() -> Result<PathBuf, String> {
    let dir = dirs::data_dir()
        .ok_or("Cannot find data dir")?
        .join("BClaw")
        .join("config");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

/// Path to the user-editable model config file.
pub fn get_model_config_path() -> Result<PathBuf, String> {
    Ok(get_bclaw_config_dir()?.join(MODEL_CONFIG_FILENAME))
}

/// Load model config from user data dir, falling back to bundled default.
pub fn load_model_config() -> Result<ModelConfig, String> {
    let user_path = get_model_config_path()?;
    if user_path.exists() {
        let raw = std::fs::read_to_string(&user_path)
            .map_err(|e| format!("Read model config failed: {}", e))?;
        let config: ModelConfig = serde_json::from_str(&raw)
            .map_err(|e| format!("Parse model config failed: {}", e))?;
        return Ok(config);
    }

    // Fallback: copy bundled default to user dir and return it
    let default = include_str!(concat!(env!("CARGO_MANIFEST_DIR"), "/resources/config/model-config.json"));
    let config: ModelConfig = serde_json::from_str(default)
        .map_err(|e| format!("Parse default model config failed: {}", e))?;

    std::fs::write(&user_path, default)
        .map_err(|e| format!("Write default model config failed: {}", e))?;

    Ok(config)
}

/// Save model config to user data dir.
pub fn save_model_config(config: &ModelConfig) -> Result<(), String> {
    let path = get_model_config_path()?;
    let raw = serde_json::to_string_pretty(config)
        .map_err(|e| format!("Serialize model config failed: {}", e))?;
    std::fs::write(&path, raw)
        .map_err(|e| format!("Write model config failed: {}", e))?;
    Ok(())
}

fn generate_random_token() -> String {
    use rand::distributions::Alphanumeric;
    use rand::Rng;
    rand::thread_rng()
        .sample_iter(&Alphanumeric)
        .take(32)
        .map(char::from)
        .collect()
}

fn get_gateway_token_path() -> Result<PathBuf, String> {
    Ok(get_bclaw_config_dir()?.join("gateway-token.txt"))
}

/// Get or create a persistent gateway auth token.
pub fn get_or_create_gateway_token() -> Result<String, String> {
    let path = get_gateway_token_path()?;
    if path.exists() {
        return std::fs::read_to_string(&path).map_err(|e| e.to_string());
    }
    let token = generate_random_token();
    std::fs::write(&path, &token).map_err(|e| e.to_string())?;
    Ok(token)
}

/// Build a minimal openclaw.json for BClaw's isolated state dir.
pub fn build_openclaw_config(
    model_config: &ModelConfig,
    skills_dir: &PathBuf,
    workspace_dir: &PathBuf,
    token: &str,
) -> Result<serde_json::Value, String> {
    let provider_config = model_config.to_openclaw_provider_config();

    let provider_id = match model_config.provider {
        ProviderType::Anthropic => "anthropic-proxy",
        ProviderType::Openai => "openai-proxy",
    };

    Ok(serde_json::json!({
        "gateway": {
            "mode": "local",
            "bind": "loopback",
            "port": 18789,
            "reload": { "mode": "hybrid", "debounceMs": 300 },
            "auth": { "mode": "token", "token": token },
            "controlUi": { "allowInsecureAuth": true },
        },
        "models": {
            "providers": {
                provider_id: provider_config,
            }
        },
        "skills": {
            "load": {
                "extraDirs": [skills_dir.to_string_lossy().to_string()],
                "watch": true,
            }
        },
        "agents": {
            "defaults": {
                "workspace": workspace_dir.to_string_lossy().to_string(),
                "model": model_config.model,
            }
        },
        "talk": {
            "provider": "openai",
            "realtime": {
                "provider": "openai",
                "model": model_config.model,
                "mode": "realtime",
                "transport": "gateway-relay",
                "brain": "agent-consult",
                "providers": {
                    "openai": {
                        "apiKey": model_config.api_key
                    }
                }
            }
        }
    }))
}

/// Write the full openclaw.json to the given state dir. Returns the auth token.
pub fn write_openclaw_config(state_dir: &PathBuf, model_config: &ModelConfig, skills_dir: &PathBuf) -> Result<String, String> {
    std::fs::create_dir_all(state_dir).map_err(|e| e.to_string())?;

    // Create workspace dir (openclaw expects it to exist)
    let workspace_dir = state_dir.join("workspace");
    std::fs::create_dir_all(&workspace_dir).map_err(|e| e.to_string())?;

    let token = get_or_create_gateway_token()?;
    let config = build_openclaw_config(model_config, skills_dir, &workspace_dir, &token)?;
    let raw = serde_json::to_string_pretty(&config)
        .map_err(|e| format!("Serialize openclaw config failed: {}", e))?;
    let path = state_dir.join("openclaw.json");
    std::fs::write(&path, &raw)
        .map_err(|e| format!("Write openclaw config failed: {}", e))?;

    eprintln!("[gateway] Wrote openclaw.json to {}", path.display());
    eprintln!("[gateway] Config contents:\n{}", raw);
    Ok(token)
}
