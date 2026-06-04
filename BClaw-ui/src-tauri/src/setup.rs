use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::time::Duration;
use tauri::Emitter;

const NODE_VERSION: &str = "22.12.0";
const NODE_MIN_MAJOR: u32 = 22;
const NODE_MIN_MINOR: u32 = 19;
const OPENCLAW_FLAG: &str = "openclaw-ready.flag";
const OPENCLAW_PATH_FILE: &str = "openclaw-path.txt";
const NPM_INSTALL_TIMEOUT_SECS: u64 = 300;

/// Ensure openclaw environment is ready (Node.js + openclaw binary).
/// Emits `setup:progress`, `setup:complete`, `setup:error` events.
pub async fn ensure_openclaw_ready(app: &tauri::AppHandle) -> Result<(), String> {
    let flag = get_flag_path()?;
    if flag.exists() {
        eprintln!("[setup] flag exists, skipping setup");
        return Ok(());
    }

    eprintln!("[setup] starting setup...");
    app.emit("setup:progress", "检测 Node.js 环境...").ok();

    let node_exe = find_or_install_node(app).await?;
    eprintln!("[setup] node_exe = {:?}", node_exe);

    app.emit("setup:progress", "检测 openclaw...").ok();

    let openclaw = find_or_install_openclaw(app, &node_exe).await?;

    // Persist openclaw path for GatewayManager
    let config_dir = get_bclaw_data_dir()?;
    let path_file = config_dir.join(OPENCLAW_PATH_FILE);
    tokio::task::spawn_blocking({
        let path = openclaw.to_string_lossy().to_string();
        move || {
            std::fs::write(&path_file, path).map_err(|e| format!("Write path file failed: {}", e))
        }
    })
    .await
    .map_err(|e| format!("Write path file task failed: {}", e))??;

    // Write ready flag
    tokio::task::spawn_blocking(move || {
        std::fs::write(&flag, "").map_err(|e| format!("Write flag failed: {}", e))
    })
    .await
    .map_err(|e| format!("Write flag task failed: {}", e))??;

    Ok(())
}

/// Resolve a bundled resource directory.
/// Dev: relative to CARGO_MANIFEST_DIR. Production: relative to exe.
pub fn resolve_bundled_resource(name: &str) -> Option<PathBuf> {
    let dev_path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("resources")
        .join(name);
    if dev_path.exists() {
        return Some(dev_path);
    }

    if let Ok(exe) = std::env::current_exe() {
        if let Some(exe_dir) = exe.parent() {
            let prod_path = exe_dir.join("resources").join(name);
            if prod_path.exists() {
                return Some(prod_path);
            }
            if let Some(parent) = exe_dir.parent() {
                let alt_path = parent.join("resources").join(name);
                if alt_path.exists() {
                    return Some(alt_path);
                }
            }
        }
    }

    None
}

fn get_bclaw_data_dir() -> Result<PathBuf, String> {
    let dir = dirs::data_dir()
        .ok_or("Cannot find data dir")?
        .join("BClaw");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

fn get_bclaw_local_dir() -> Result<PathBuf, String> {
    let dir = dirs::data_local_dir()
        .ok_or("Cannot find local data dir")?
        .join("BClaw");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

fn get_flag_path() -> Result<PathBuf, String> {
    Ok(get_bclaw_data_dir()?.join(OPENCLAW_FLAG))
}

// ── Node.js ──────────────────────────────────────────────

async fn find_or_install_node(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    // 0. Bundled node (offline first)
    if let Some(bundled) = resolve_bundled_resource("node") {
        let node_exe = bundled.join("node.exe");
        eprintln!("[setup] bundled node candidate: {:?}", node_exe);
        if node_exe.exists() {
            app.emit("setup:progress", "使用内置 Node.js").ok();
            return Ok(node_exe);
        }
    }

    eprintln!("[setup] no bundled node found");

    // 1. System node
    if let Ok(output) = Command::new("node").arg("--version").output() {
        let ver = String::from_utf8_lossy(&output.stdout);
        if is_node_version_ok(&ver) {
            app.emit("setup:progress", "Node.js 已就绪").ok();
            return Ok(PathBuf::from("node"));
        }
    }

    // 2. Cached local node
    let local = get_bclaw_local_dir()?;
    let node_exe = local.join("node").join("node.exe");
    if node_exe.exists() {
        app.emit("setup:progress", "Node.js 已就绪").ok();
        return Ok(node_exe);
    }

    // 3. Download
    app.emit("setup:progress", "正在下载 Node.js...").ok();
    download_node(&local).await?;
    app.emit("setup:progress", "Node.js 下载完成").ok();
    Ok(node_exe)
}

fn is_node_version_ok(ver: &str) -> bool {
    let trimmed = ver.trim().trim_start_matches('v');
    let mut parts = trimmed.split('.');
    let major = parts.next().and_then(|s| s.parse::<u32>().ok()).unwrap_or(0);
    let minor = parts.next().and_then(|s| s.parse::<u32>().ok()).unwrap_or(0);
    major > NODE_MIN_MAJOR || (major == NODE_MIN_MAJOR && minor >= NODE_MIN_MINOR)
}

async fn download_node(local_dir: &Path) -> Result<(), String> {
    let url = format!(
        "https://nodejs.org/dist/v{}/node-v{}-win-x64.zip",
        NODE_VERSION, NODE_VERSION
    );
    let zip_path = local_dir.join("node.zip");
    let node_target = local_dir.join("node");

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(180))
        .build()
        .map_err(|e| e.to_string())?;

    let resp = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("Download node failed: {}", e))?;

    let bytes = resp
        .bytes()
        .await
        .map_err(|e| format!("Read node bytes failed: {}", e))?;

    // Do blocking I/O on a dedicated thread
    let local_dir = local_dir.to_path_buf();
    let zip_path_clone = zip_path.clone();
    let node_target_clone = node_target.clone();
    let version = NODE_VERSION.to_string();

    tokio::task::spawn_blocking(move || {
        std::fs::write(&zip_path_clone, &bytes).map_err(|e| e.to_string())?;

        let file = std::fs::File::open(&zip_path_clone).map_err(|e| e.to_string())?;
        let mut archive = zip::ZipArchive::new(file).map_err(|e| e.to_string())?;
        archive.extract(&local_dir).map_err(|e| e.to_string())?;

        let extracted = local_dir.join(format!("node-v{}-win-x64", version));
        if extracted.exists() {
            std::fs::rename(&extracted, &node_target_clone).map_err(|e| e.to_string())?;
        }
        let _ = std::fs::remove_file(&zip_path_clone);
        Ok(())
    })
    .await
    .map_err(|e| format!("Download node blocking task failed: {}", e))?
}

// ── openclaw ─────────────────────────────────────────────

async fn find_or_install_openclaw(
    app: &tauri::AppHandle,
    node_exe: &Path,
) -> Result<PathBuf, String> {
    eprintln!("[setup] find_or_install_openclaw...");
    // 0. Bundled openclaw (offline first)
    if let Some(bundled) = resolve_bundled_resource("openclaw") {
        let mjs = bundled.join("openclaw.mjs");
        eprintln!("[setup] bundled openclaw candidate: {:?}", mjs);
        if mjs.exists() {
            app.emit("setup:progress", "使用内置 openclaw").ok();
            return Ok(mjs);
        }
    }
    eprintln!("[setup] no bundled openclaw found");

    // 1. Global openclaw (via PATH)
    if let Some(p) = resolve_openclaw_from_where() {
        app.emit("setup:progress", "openclaw 已就绪").ok();
        return Ok(p);
    }

    // 2. Source checkout (development)
    if let Ok(src_dir) = find_openclaw_source_dir() {
        let mjs = src_dir.join("openclaw.mjs");
        if mjs.exists() {
            app.emit("setup:progress", "openclaw 已就绪").ok();
            return Ok(mjs);
        }
    }

    // 3. Install from npm
    app.emit("setup:progress", "正在从 npm 安装 openclaw...").ok();
    install_openclaw_from_npm(node_exe).await?;
    app.emit("setup:progress", "openclaw 安装完成").ok();

    // Re-resolve after installation
    if let Some(p) = resolve_openclaw_from_where() {
        return Ok(p);
    }

    Err("Failed to locate openclaw after npm installation".into())
}

pub fn find_openclaw_source_dir() -> Result<PathBuf, String> {
    let mut candidates: Vec<PathBuf> = Vec::new();

    if let Ok(exe) = std::env::current_exe() {
        if let Some(parent) = exe.parent() {
            if let Some(grand) = parent.parent() {
                candidates.push(grand.to_path_buf());
            }
        }
    }

    if let Ok(cwd) = std::env::current_dir() {
        // BClaw-ui/src-tauri -> BClaw-ui -> openclaw root
        if let Some(parent) = cwd.parent() {
            candidates.push(parent.to_path_buf());
            if let Some(grand) = parent.parent() {
                candidates.push(grand.to_path_buf());
            }
        }
        candidates.push(cwd.clone());
    }

    for c in candidates {
        if c.join("openclaw.mjs").exists() && c.join("package.json").exists() {
            return Ok(c);
        }
    }

    Err("Cannot find openclaw source directory".into())
}

async fn install_openclaw_from_npm(node_exe: &Path) -> Result<(), String> {
    let npm_cmd = if node_exe.file_name() == Some(std::ffi::OsStr::new("node.exe")) {
        let dir = node_exe.parent().unwrap();
        let npm_cmd = dir.join("npm.cmd");
        if npm_cmd.exists() {
            npm_cmd
        } else {
            PathBuf::from("npm")
        }
    } else {
        PathBuf::from("npm")
    };

    let node_dir = if node_exe.file_name() == Some(std::ffi::OsStr::new("node.exe")) {
        node_exe.parent().map(|p| p.to_path_buf())
    } else {
        None
    };

    let mut cmd = Command::new(&npm_cmd);
    cmd.args(["install", "-g", "openclaw"]);
    cmd.stdout(Stdio::piped());
    cmd.stderr(Stdio::piped());

    if let Some(ref dir) = node_dir {
        let current_path = std::env::var("PATH").unwrap_or_default();
        cmd.env("PATH", format!("{};{}", dir.display(), current_path));
    }

    // Run npm install in a blocking thread with a timeout to avoid freezing forever
    let output = tokio::time::timeout(
        Duration::from_secs(NPM_INSTALL_TIMEOUT_SECS),
        tokio::task::spawn_blocking(move || cmd.output()),
    )
    .await
    .map_err(|_| {
        format!(
            "npm install openclaw timed out after {} minutes",
            NPM_INSTALL_TIMEOUT_SECS / 60
        )
    })?
    .map_err(|e| format!("npm install openclaw task failed: {}", e))?
    .map_err(|e| format!("npm install openclaw failed: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("npm install openclaw failed: {}", stderr));
    }

    Ok(())
}

/// Resolve openclaw executable from `where openclaw` output.
/// On Windows npm creates `openclaw` (bash), `openclaw.cmd`, and `openclaw.ps1`.
/// We must prefer `.cmd` / `.exe` / `.bat` to avoid "not a valid Win32 app" (193).
pub fn resolve_openclaw_from_where() -> Option<PathBuf> {
    let output = Command::new("where").arg("openclaw").output().ok()?;
    let stdout = String::from_utf8_lossy(&output.stdout);
    let paths: Vec<&str> = stdout
        .lines()
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
        .collect();

    // Prefer Windows executables
    for &p in &paths {
        let pb = PathBuf::from(p);
        if let Some(ext) = pb.extension() {
            let ext = ext.to_string_lossy().to_lowercase();
            if ext == "cmd" || ext == "exe" || ext == "bat" {
                if pb.exists() {
                    return Some(pb);
                }
            }
        }
    }

    // Fallback: first valid path
    for &p in &paths {
        let pb = PathBuf::from(p);
        if pb.exists() {
            return Some(pb);
        }
    }

    None
}
