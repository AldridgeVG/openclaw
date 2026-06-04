use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::time::Duration;

use crate::config_manager;

const GATEWAY_PORT: u16 = 18789;
const GATEWAY_BIND: &str = "127.0.0.1";
const GATEWAY_START_TIMEOUT_SECS: u64 = 30;

pub struct GatewayManager {
    child: Mutex<Option<Child>>,
    token: Mutex<String>,
}

impl GatewayManager {
    pub fn new() -> Self {
        Self {
            child: Mutex::new(None),
            token: Mutex::new(String::new()),
        }
    }

    pub fn token(&self) -> String {
        self.token.lock().unwrap().clone()
    }

    /// Ensure gateway is running. If not, spawn it and wait for readiness.
    pub async fn ensure_running(&self) -> Result<(), String> {
        eprintln!("[gateway] ensure_running start");
        if Self::probe_port().await {
            eprintln!("[gateway] port {} already occupied", GATEWAY_PORT);
            // Port is occupied — check if it is our own child process.
            let has_child = {
                let lock = self.child.lock().unwrap();
                lock.is_some()
            };
            if has_child {
                eprintln!("[gateway] port occupied by our child, ok");
                return Ok(());
            }
            // Stale process from a previous run (common when IDE stops debugger
            // on Windows without sending ExitRequested). Try to clean it up.
            #[cfg(windows)]
            {
                eprintln!("[gateway] Port {} occupied by unknown process; attempting cleanup...", GATEWAY_PORT);
                let _ = Self::kill_stale_gateway_processes();
                tokio::time::sleep(Duration::from_millis(800)).await;
            }
            if Self::probe_port().await {
                return Err(format!(
                    "Gateway port {} is still occupied after cleanup attempt. Please kill the stale process manually.",
                    GATEWAY_PORT
                ));
            }
        }

        let openclaw = self.find_openclaw_binary()?;
        let node_exe = self.find_node_binary()?;
        eprintln!("[gateway] openclaw binary: {:?}", openclaw);
        eprintln!("[gateway] node binary: {:?}", node_exe);

        // Load model config and prepare openclaw environment
        let model_config = config_manager::load_model_config()?;
        let state_dir = get_openclaw_state_dir()?;
        let skills_dir = get_bundled_skills_dir()?;
        eprintln!("[gateway] state dir: {:?}, skills dir: {:?}", state_dir, skills_dir);

        // Run openclaw setup if config doesn't exist yet (creates workspace dirs etc.)
        let config_path = state_dir.join("openclaw.json");
        if !config_path.exists() {
            eprintln!("[gateway] Running openclaw setup for state dir...");
            self.run_openclaw_setup(&openclaw, &node_exe, &state_dir).await?;
        }

        // Write openclaw.json with model & skill configuration
        let token = config_manager::write_openclaw_config(&state_dir, &model_config, &skills_dir)?;
        *self.token.lock().unwrap() = token;

        // Prepare log file so we can diagnose startup failures
        let log_path = get_gateway_log_path()?;
        let log_file = std::fs::File::create(&log_path)
            .map_err(|e| format!("Cannot create gateway log file: {}", e))?;

        let mut cmd = if openclaw.extension().map(|e| e == "mjs").unwrap_or(false) {
            let mut c = Command::new(&node_exe);
            c.arg(&openclaw);
            c
        } else {
            Command::new(&openclaw)
        };

        let args = [
            "gateway",
            "run",
            "--bind",
            "loopback",
            "--port",
            &GATEWAY_PORT.to_string(),
            "--verbose",
        ];

        // Log the exact command for diagnostics
        let cmd_display = format!("{:?} {:?}", cmd.get_program(), args.as_slice());
        eprintln!("[gateway] Spawning: {}", cmd_display);
        eprintln!("[gateway] State dir: {}", state_dir.display());

        // Apply model config environment variables
        for (key, value) in model_config.to_env_vars() {
            cmd.env(key, value);
        }

        // Use isolated state dir so BClaw doesn't pollute user's ~/.openclaw
        cmd.env("OPENCLAW_STATE_DIR", &state_dir);
        cmd.current_dir(&state_dir);

        let child = cmd
            .args(args)
            .stdout(Stdio::from(
                log_file.try_clone().map_err(|e| e.to_string())?,
            ))
            .stderr(Stdio::from(log_file))
            .spawn()
            .map_err(|e| format!("Failed to spawn openclaw gateway: {} (cmd: {})", e, cmd_display))?;

        *self.child.lock().unwrap() = Some(child);

        // Wait for readiness, but also detect early exit so we don't spin 30s for nothing
        let attempts = (GATEWAY_START_TIMEOUT_SECS * 1000 / 500) as usize;
        eprintln!("[gateway] waiting for readiness, attempts={}", attempts);
        for i in 0..attempts {
            tokio::time::sleep(Duration::from_millis(500)).await;

            let exited = {
                let mut lock = self.child.lock().unwrap();
                if let Some(ref mut c) = *lock {
                    matches!(c.try_wait(), Ok(Some(_)))
                } else {
                    false
                }
            };

            if exited {
                let tail = tail_log(&log_path, 30);
                eprintln!("[gateway] child exited early, attempt {}", i);
                return Err(format!(
                    "Gateway exited immediately. Last log lines:\n{}",
                    tail
                ));
            }

            if Self::probe_port().await {
                eprintln!("[gateway] port ready after {} attempts", i + 1);
                return Ok(());
            }
        }

        let _ = self.stop();
        let tail = tail_log(&log_path, 30);
        eprintln!("[gateway] failed to become ready after {} attempts", attempts);
        Err(format!(
            "Gateway failed to become ready within {}s. Last log lines:\n{}",
            GATEWAY_START_TIMEOUT_SECS, tail
        ))
    }

    /// Watchdog: periodically probe gateway and restart if dead.
    pub async fn watchdog(&self) {
        loop {
            tokio::time::sleep(Duration::from_secs(10)).await;
            if !Self::probe_port().await {
                eprintln!("[gateway] Health check failed, restarting...");
                let _ = self.stop();
                // Exponential backoff for restarts
                for attempt in 1..=5 {
                    tokio::time::sleep(Duration::from_secs(attempt as u64)).await;
                    match self.ensure_running().await {
                        Ok(()) => {
                            eprintln!("[gateway] Restarted successfully");
                            break;
                        }
                        Err(e) => {
                            eprintln!("[gateway] Restart attempt {} failed: {}", attempt, e);
                        }
                    }
                }
            }
        }
    }

    pub fn stop(&self) -> Result<(), String> {
        let mut lock = self.child.lock().unwrap();
        if let Some(mut child) = lock.take() {
            let _ = child.kill();
            let _ = child.wait();
        }
        Ok(())
    }

    async fn probe_port() -> bool {
        match tokio::net::TcpStream::connect((GATEWAY_BIND, GATEWAY_PORT)).await {
            Ok(_) => true,
            Err(_) => false,
        }
    }

    #[cfg(windows)]
    fn kill_stale_gateway_processes() -> Result<(), String> {
        // Find processes listening on the gateway port via netstat, then
        // confirm the process image name looks like node/openclaw before killing.
        let netstat = std::process::Command::new("cmd")
            .args([
                "/C",
                &format!("netstat -ano -p tcp | findstr :{}", GATEWAY_PORT),
            ])
            .output()
            .map_err(|e| format!("netstat failed: {}", e))?;

        let stdout = String::from_utf8_lossy(&netstat.stdout);
        for line in stdout.lines() {
            let parts: Vec<&str> = line.split_whitespace().collect();
            if parts.len() < 5 {
                continue;
            }
            let pid_str = parts[4];
            let pid: u32 = match pid_str.parse() {
                Ok(v) => v,
                Err(_) => continue,
            };

            // Verify process image name before killing (safety guard)
            let tasklist = std::process::Command::new("tasklist")
                .args(["/FI", &format!("PID eq {}", pid), "/FO", "CSV", "/NH"])
                .output();

            if let Ok(out) = tasklist {
                let name = String::from_utf8_lossy(&out.stdout).to_lowercase();
                if name.contains("node") || name.contains("openclaw") {
                    let _ = std::process::Command::new("taskkill")
                        .args(["/PID", pid_str, "/F"])
                        .output();
                    eprintln!("[gateway] Killed stale process {} (PID {})", name.trim(), pid);
                }
            }
        }
        Ok(())
    }

    fn find_openclaw_binary(&self) -> Result<PathBuf, String> {
        // 0. Bundled openclaw (offline first)
        if let Some(bundled) = super::setup::resolve_bundled_resource("openclaw") {
            let mjs = bundled.join("openclaw.mjs");
            if mjs.exists() {
                return Ok(mjs);
            }
        }

        // 1. Read persisted path from setup
        let path_file = dirs::data_dir()
            .ok_or("No data dir")?
            .join("BClaw")
            .join("openclaw-path.txt");
        if let Ok(path) = std::fs::read_to_string(&path_file) {
            let p = PathBuf::from(path.trim());
            if p.exists() && Self::is_valid_openclaw_executable(&p) {
                return Ok(p);
            }
            // Stale or invalid path file — remove it so setup re-runs
            let _ = std::fs::remove_file(&path_file);
        }

        // 2. Try PATH (prefer .cmd/.exe/.bat on Windows)
        if let Some(p) = super::setup::resolve_openclaw_from_where() {
            return Ok(p);
        }

        // 3. Try source checkout (dev mode)
        if let Ok(src_dir) = super::setup::find_openclaw_source_dir() {
            let mjs = src_dir.join("openclaw.mjs");
            if mjs.exists() {
                return Ok(mjs);
            }
        }

        Err("openclaw binary not found. Please run setup first.".into())
    }

    fn is_valid_openclaw_executable(path: &std::path::Path) -> bool {
        if let Some(ext) = path.extension() {
            let ext = ext.to_string_lossy().to_lowercase();
            matches!(ext.as_str(), "cmd" | "exe" | "bat" | "mjs")
        } else {
            // No extension on Windows is suspicious (likely bash script from npm)
            false
        }
    }

    fn find_node_binary(&self) -> Result<PathBuf, String> {
        // 0. Bundled node (offline first)
        if let Some(bundled) = super::setup::resolve_bundled_resource("node") {
            let node_exe = bundled.join("node.exe");
            if node_exe.exists() {
                return Ok(node_exe);
            }
        }

        // 1. Cached local node
        let local = dirs::data_local_dir()
            .ok_or("No local dir")?
            .join("BClaw")
            .join("node")
            .join("node.exe");
        if local.exists() {
            return Ok(local);
        }

        // 2. System node
        if Command::new("node").arg("--version").output().is_ok() {
            return Ok(PathBuf::from("node"));
        }

        Err("Node.js not found".into())
    }

    async fn run_openclaw_setup(
        &self,
        openclaw: &PathBuf,
        node_exe: &PathBuf,
        state_dir: &PathBuf,
    ) -> Result<(), String> {
        let mut cmd = if openclaw.extension().map(|e| e == "mjs").unwrap_or(false) {
            let mut c = Command::new(&node_exe);
            c.arg(&openclaw);
            c
        } else {
            Command::new(&openclaw)
        };

        cmd.args(["onboard", "--non-interactive", "--accept-risk", "--skip-health"]);
        cmd.env("OPENCLAW_STATE_DIR", &state_dir);
        cmd.current_dir(&state_dir);
        cmd.stdout(Stdio::piped());
        cmd.stderr(Stdio::piped());

        let output = tokio::task::spawn_blocking(move || cmd.output())
            .await
            .map_err(|e| format!("openclaw setup task failed: {}", e))?
            .map_err(|e| format!("openclaw setup failed: {}", e))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(format!("openclaw setup failed: {}", stderr));
        }

        eprintln!("[gateway] openclaw setup completed");
        Ok(())
    }
}

fn get_openclaw_state_dir() -> Result<PathBuf, String> {
    let dir = dirs::data_dir()
        .ok_or("No data dir")?
        .join("BClaw")
        .join("openclaw-state");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

fn get_bundled_skills_dir() -> Result<PathBuf, String> {
    // Dev: relative to src-tauri manifest dir
    let dev_path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("resources")
        .join("skills");
    if dev_path.exists() {
        return Ok(dev_path);
    }

    // Production: resolve relative to the running executable
    if let Ok(exe) = std::env::current_exe() {
        if let Some(exe_dir) = exe.parent() {
            // NSIS installer typically places exe next to resources/
            let prod_path = exe_dir.join("resources").join("skills");
            if prod_path.exists() {
                return Ok(prod_path);
            }
            // Or one level up (e.g. target/release/ on Windows)
            if let Some(parent) = exe_dir.parent() {
                let alt_path = parent.join("resources").join("skills");
                if alt_path.exists() {
                    return Ok(alt_path);
                }
            }
        }
    }

    Err("Bundled skills directory not found".into())
}

fn get_gateway_log_path() -> Result<PathBuf, String> {
    let dir = dirs::data_local_dir()
        .ok_or("No local data dir")?
        .join("BClaw");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("gateway.log"))
}

fn tail_log(path: &Path, max_lines: usize) -> String {
    match std::fs::read_to_string(path) {
        Ok(content) => {
            let lines: Vec<&str> = content.lines().collect();
            if lines.is_empty() {
                return "(log file is empty)".to_string();
            }
            let start = lines.len().saturating_sub(max_lines);
            lines[start..].join("\n")
        }
        Err(_) => "(unable to read log file)".to_string(),
    }
}
