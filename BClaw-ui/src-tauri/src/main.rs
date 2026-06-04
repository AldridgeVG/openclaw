// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use cpal::traits::{DeviceTrait, HostTrait};
use std::sync::Mutex;
use tauri::{Emitter, Manager};

#[cfg(feature = "local-asr")]
mod asr_manager;
mod audio;
mod config_manager;
mod gateway_manager;
mod setup;

#[cfg(feature = "local-asr")]
use asr_manager::AsrManager;
use gateway_manager::GatewayManager;

pub struct AudioState {
    capture_stream: Mutex<Option<cpal::Stream>>,
    playback_handle: Mutex<Option<audio::playback::PlaybackHandle>>,
    selected_input_device: Mutex<Option<String>>,
}

// SAFETY: cpal::Stream does not auto-impl Send on Windows MSVC, but it is
// safe to send because play()/pause() are &self and we access it only
// through Mutex.
unsafe impl Send for AudioState {}
unsafe impl Sync for AudioState {}

#[tauri::command]
fn list_input_devices() -> Result<Vec<String>, String> {
    let host = cpal::default_host();
    let devices = host.input_devices().map_err(|e| e.to_string())?;
    let mut names = Vec::new();
    for device in devices {
        if let Ok(name) = device.name() {
            names.push(name);
        }
    }
    Ok(names)
}

#[tauri::command]
fn get_input_device(state: tauri::State<AudioState>) -> Result<Option<String>, String> {
    let lock = state.selected_input_device.lock().map_err(|e| e.to_string())?;
    Ok(lock.clone())
}

#[tauri::command]
fn set_input_device(
    device: Option<String>,
    state: tauri::State<AudioState>,
) -> Result<(), String> {
    let mut lock = state.selected_input_device.lock().map_err(|e| e.to_string())?;
    *lock = device;
    Ok(())
}

#[tauri::command]
fn start_capture(
    app: tauri::AppHandle,
    state: tauri::State<AudioState>,
    sample_rate: Option<u32>,
) -> Result<(), String> {
    eprintln!("[tauri] start_capture called, sample_rate={:?}", sample_rate);
    let mut capture = state.capture_stream.lock().map_err(|e| e.to_string())?;
    if capture.is_some() {
        eprintln!("[tauri] start_capture skipped: already capturing");
        return Ok(()); // Already capturing
    }
    let device_name = {
        let lock = state.selected_input_device.lock().map_err(|e| e.to_string())?;
        lock.clone()
    };
    let target_rate = sample_rate.unwrap_or(audio::SAMPLE_RATE);
    let stream = audio::capture::start_capture(app, device_name, target_rate)?;
    *capture = Some(stream);
    eprintln!("[tauri] start_capture ok @ {} Hz", target_rate);
    Ok(())
}

#[tauri::command]
fn stop_capture(state: tauri::State<AudioState>) -> Result<(), String> {
    eprintln!("[tauri] stop_capture called");
    let mut capture = state.capture_stream.lock().map_err(|e| e.to_string())?;
    *capture = None; // Drop the stream to stop capture
    eprintln!("[tauri] stop_capture ok");
    Ok(())
}

#[tauri::command]
fn play_audio(
    audio_base64: String,
    state: tauri::State<AudioState>,
) -> Result<(), String> {
    eprintln!("[tauri] play_audio called, base64 len={}", audio_base64.len());
    // Stop any existing playback first
    {
        let mut handle = state.playback_handle.lock().map_err(|e| e.to_string())?;
        if let Some(h) = handle.take() {
            h.stop();
        }
    }

    let new_handle = audio::playback::play_pcm16_base64(audio_base64)?;
    let mut handle = state.playback_handle.lock().map_err(|e| e.to_string())?;
    *handle = Some(new_handle);
    eprintln!("[tauri] play_audio ok");
    Ok(())
}

#[tauri::command]
fn stop_playback(state: tauri::State<AudioState>) -> Result<(), String> {
    eprintln!("[tauri] stop_playback called");
    let mut handle = state.playback_handle.lock().map_err(|e| e.to_string())?;
    if let Some(h) = handle.take() {
        h.stop();
    }
    Ok(())
}

#[tauri::command]
fn get_model_config() -> Result<config_manager::ModelConfig, String> {
    config_manager::load_model_config()
}

#[tauri::command]
fn set_model_config(config: config_manager::ModelConfig) -> Result<(), String> {
    config_manager::save_model_config(&config)
}

#[tauri::command]
fn get_gateway_token(state: tauri::State<GatewayManager>) -> Result<String, String> {
    let token = state.token();
    if token.is_empty() {
        return Err("Gateway token not available yet".into());
    }
    Ok(token)
}

#[tauri::command]
async fn restart_gateway(app: tauri::AppHandle) -> Result<(), String> {
    let manager = app.state::<GatewayManager>();
    let _ = manager.stop();
    tokio::time::sleep(std::time::Duration::from_millis(500)).await;
    manager.ensure_running().await
}

#[cfg(feature = "local-asr")]
#[tauri::command]
async fn transcribe_audio(
    samples: Vec<i16>,
    sample_rate: i32,
    state: tauri::State<'_, AsrManager>,
) -> Result<String, String> {
    eprintln!("[tauri] transcribe_audio called, samples={}, sr={}", samples.len(), sample_rate);
    // Ensure model is present (download on first use)
    state.ensure_model().await?;
    // Clone the manager so it can be moved into the blocking thread
    let manager = (*state).clone();
    // Run inference on the calling thread pool (blocking I/O + compute)
    let result = tokio::task::spawn_blocking(move || {
        manager.transcribe(&samples, sample_rate)
    })
    .await
    .map_err(|e| format!("Transcription task failed: {}", e))?;
    eprintln!("[tauri] transcribe_audio result: {}", result.as_ref().unwrap_or(&"(empty)".into()));
    result
}

#[cfg(not(feature = "local-asr"))]
#[tauri::command]
async fn transcribe_audio(
    _samples: Vec<i16>,
    _sample_rate: i32,
) -> Result<String, String> {
    Err("本地 ASR 未在此版本中启用。如需离线识别，请使用支持 local-asr 特性的构建。".into())
}

fn main() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(AudioState {
            capture_stream: Mutex::new(None),
            playback_handle: Mutex::new(None),
            selected_input_device: Mutex::new(None),
        })
        .manage(GatewayManager::new());

    #[cfg(feature = "local-asr")]
    let builder = builder.manage(AsrManager::new(
        &dirs::data_dir().unwrap_or_default().join("BClaw"),
    ));

    let app = builder
        .setup(|app| {
            #[cfg(debug_assertions)]
            {
                let window = app.get_webview_window("main").unwrap();
                window.open_devtools();
            }

            let app_handle = app.app_handle().clone();
            tauri::async_runtime::spawn(async move {
                // 1. Ensure openclaw environment is ready
                if let Err(e) = setup::ensure_openclaw_ready(&app_handle).await {
                    eprintln!("[setup] Failed: {}", e);
                    app_handle.emit("setup:error", e).ok();
                    return;
                }

                // 2. Start gateway (best-effort; don't block UI if it fails)
                app_handle.emit("setup:progress", "正在启动 Gateway...").ok();
                let manager = app_handle.state::<GatewayManager>();
                if let Err(e) = manager.ensure_running().await {
                    eprintln!("[gateway] Start failed: {}", e);
                    app_handle
                        .emit("setup:progress", format!("Gateway 启动失败，将在后台重试"))
                        .ok();
                    // Give user a moment to read the message before switching to main screen
                    tokio::time::sleep(std::time::Duration::from_secs(2)).await;
                }

                // 3. Setup fully complete — UI can switch to main screen
                app_handle.emit("setup:complete", ()).ok();

                // 4. Run watchdog (keeps gateway alive, retries if start failed)
                manager.watchdog().await;
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            start_capture,
            stop_capture,
            play_audio,
            stop_playback,
            list_input_devices,
            get_input_device,
            set_input_device,
            get_model_config,
            set_model_config,
            get_gateway_token,
            restart_gateway,
            transcribe_audio,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|app_handle, event| {
        if let tauri::RunEvent::ExitRequested { .. } = event {
            eprintln!("[app] Exit requested, cleaning up...");

            // Stop audio capture
            if let Some(state) = app_handle.try_state::<AudioState>() {
                if let Ok(mut capture) = state.capture_stream.lock() {
                    *capture = None;
                }
                if let Ok(mut playback) = state.playback_handle.lock() {
                    if let Some(h) = playback.take() {
                        h.stop();
                    }
                }
            }

            // Stop gateway process
            if let Some(manager) = app_handle.try_state::<GatewayManager>() {
                let _ = manager.stop();
            }
        }
    });
}
