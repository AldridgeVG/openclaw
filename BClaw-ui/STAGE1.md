# BClaw-ui 现状文档 (Stage 1)

> 本文档记录 BClaw-ui 在 feature/bochu 分支的当前技术架构、构建方式和与 openclaw 的联动方式，作为后续迭代的依据。
> 生成日期: 2026-06-02

---

## 1. 项目概述

BClaw-ui 是一个基于 **Tauri v2** + **React 18** 的桌面语音助手客户端，定位是 openclaw Gateway 的原生语音前端。当前版本 `0.1.0`，Windows 为主目标平台（NSIS 安装包）。

核心能力：

- 一键启动/管理本地 openclaw Gateway 进程
- 实时语音对话（麦克风采集 → Gateway Talk Session → 音频播放）
- 文字消息交互
- 模型端点配置（Anthropic / OpenAI 风格 API）

---

## 2. 技术架构

### 2.1 整体分层

```
┌─────────────────────────────────────────────────────────────┐
│  Frontend (WebView) — React 18 + TypeScript                 │
│  ┌──────────────┐ ┌──────────────┐ ┌─────────────────────┐ │
│  │ App.tsx      │ │ VoiceService │ │ ModelConfigPanel    │ │
│  │ (UI 主页面)   │ │ (WS 客户端)   │ │ (模型配置弹窗)       │ │
│  └──────┬───────┘ └──────┬───────┘ └─────────────────────┘ │
│         │                │                                  │
│         └────────────────┘                                  │
│              Tauri Invoke / Event Bridge                    │
├─────────────────────────────────────────────────────────────┤
│  Backend (Rust) — Tauri v2                                  │
│  ┌─────────────┐ ┌─────────────┐ ┌───────────────────────┐ │
│  │ audio/      │ │ config_     │ │ gateway_manager       │ │
│  │ capture.rs  │ │ manager.rs  │ │ (子进程生命周期)        │ │
│  │ playback.rs │ │             │ │ setup.rs (环境准备)    │ │
│  └──────┬──────┘ └──────┬──────┘ └───────────┬───────────┘ │
│         │               │                      │             │
│         └───────────────┴──────────────────────┘             │
│                        cpal / std::process                   │
├─────────────────────────────────────────────────────────────┤
│  External — openclaw Gateway (Node.js)                      │
│  ws://localhost:18789/ws                                    │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 技术栈

| 层面      | 技术         | 版本/说明            |
| --------- | ------------ | -------------------- |
| 桌面框架  | Tauri        | v2 (Rust + WebView2) |
| 前端框架  | React        | 18.3.1               |
| 构建工具  | Vite         | 6.0.3                |
| 语言      | TypeScript   | ~5.6.2               |
| UI 图标   | lucide-react | 0.503.0              |
| Rust 音频 | cpal         | 0.15                 |
| Rust HTTP | reqwest      | 0.12                 |
| Rust 压缩 | zip          | 2                    |

---

## 3. 项目结构

```
BClaw-ui/
├── package.json                  # npm 脚本: dev / build / tauri
├── vite.config.ts                # Vite 配置, dev server port 1420
├── tsconfig.json                 # TS 严格模式, ES2020 + DOM
├── index.html                    # 入口 HTML, 加载 Inter 字体
│
├── src/
│   ├── main.tsx                  # React DOM root 挂载
│   ├── App.tsx                   # 主 UI: 引导页 + 语音对话界面
│   ├── App.css                   # 全量样式, CSS Variables 主题
│   ├── gateway-client.ts         # Gateway WebSocket 协议客户端
│   ├── voice-service.ts          # 语音会话封装 (Talk Session)
│   ├── model-config.ts           # 模型配置类型 + Tauri command 封装
│   └── ModelConfigPanel.tsx      # 模型配置面板 UI
│
├── src-tauri/
│   ├── Cargo.toml                # Rust 依赖: tauri v2, cpal, reqwest, zip, tokio
│   ├── tauri.conf.json           # Tauri 配置: 窗口 480x720, NSIS 打包
│   ├── capabilities/default.json # 权限: core + shell + event
│   ├── build.rs                  # Tauri build hook
│   ├── resources/
│   │   ├── config/model-config.json      # 默认模型配置 (Anthropic/Kimi)
│   │   ├── skills/               # 内嵌 Skill 定义 (fs-open, dev-*)
│   │   ├── node/.gitkeep         # 内嵌 Node.js 离线包占位
│   │   └── openclaw/.gitkeep     # 内嵌 openclaw 离线包占位
│   └── src/
│       ├── main.rs               # Tauri 入口: state 管理 + command 注册 + setup
│       ├── setup.rs              # 首次启动环境准备 (Node.js + openclaw)
│       ├── gateway_manager.rs    # Gateway 子进程管理 + 看门狗
│       ├── config_manager.rs     # 模型配置读写 + openclaw.json 生成
│       └── audio/
│           ├── mod.rs            # 音频工具函数 (f32 ↔ PCM16)
│           ├── capture.rs        # 麦克风采集 (cpal) → base64 emit
│           └── playback.rs       # PCM16 base64 音频播放 (cpal)
```

---

## 4. 构建方式

### 4.1 开发模式

```bash
cd BClaw-ui
npm run tauri dev          # Vite dev server (port 1420) + Tauri Rust 编译
```

- Vite HMR 走 `ws://localhost:1421`
- Rust debug build，自动打开 DevTools
- 开发时会探测相邻目录的 openclaw 源码 (`openclaw.mjs`)

### 4.2 生产构建

```bash
npm run tauri build        # 前端 vite build → Rust release build → NSIS 安装包
```

- 前端产物输出到 `BClaw-ui/dist/`
- Rust release profile: `opt-level = 3`, `lto = true`, `strip = true`
- 打包目标: `nsis` (Windows), 支持中英文安装界面

### 4.3 资源嵌入

`tauri.conf.json` 中配置 `bundle.resources`：

| 资源目录             | 打包后位置                 | 用途                |
| -------------------- | -------------------------- | ------------------- |
| `resources/skills`   | `<exe>/resources/skills`   | openclaw Skill 加载 |
| `resources/config`   | `<exe>/resources/config`   | 默认模型配置        |
| `resources/node`     | `<exe>/resources/node`     | 离线 Node.js 运行时 |
| `resources/openclaw` | `<exe>/resources/openclaw` | 离线 openclaw 包    |

---

## 4.4 从零开始的完整启动/打包指南

### 预装环境

| 依赖                   | 版本要求                         | 用途                 |
| ---------------------- | -------------------------------- | -------------------- |
| Rust                   | latest stable                    | Tauri 后端编译       |
| Node.js                | ≥ 18 (推荐 22 LTS)               | 前端构建 + Tauri CLI |
| npm                    | 随 Node.js 附带                  | 包管理               |
| Tauri CLI              | `npm install -g @tauri-apps/cli` | Tauri 构建命令       |
| Windows SDK / WebView2 | 已随 Win11 预装                  | Tauri 运行时需要     |

安装 Rust（Windows）：

```powershell
# 使用 rustup
winget install Rustlang.Rustup
# 或访问 https://rustup.rs/ 下载安装器
```

安装前端依赖：

```bash
cd BClaw-ui
npm install
```

---

### 场景 A：调试/开发启动 (`tauri dev`)

适用于日常开发调试，启动热重载开发服务器。

#### 步骤 1：确保 openclaw 源码可被发现

开发模式下，Rust 会按以下优先级查找 openclaw：

| 优先级 | 来源                                       | 触发条件                                                                                                    |
| ------ | ------------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| 1      | 内嵌资源 `resources/openclaw/openclaw.mjs` | 存在时优先使用                                                                                              |
| 2      | `where openclaw` 系统 PATH                 | 全局 npm 安装过 openclaw                                                                                    |
| 3      | **源码目录自动探测**                       | `find_openclaw_source_dir()` 从 `current_exe()` 或 `current_dir()` 向上查找 `openclaw.mjs` + `package.json` |

**推荐做法**：保持 openclaw 源码仓库与 BClaw-ui 在同一父目录下（如 `D:\Develop\ExtProjects\openclaw/`），这样开发时自动探测到源码目录，无需额外安装。

如果源码在别处，也可以全局安装 openclaw：

```bash
npm install -g openclaw
```

#### 步骤 2：启动开发服务器

```bash
cd BClaw-ui
npm run tauri dev
```

执行流程：

1. Vite 启动 dev server (`http://localhost:1420`)
2. Rust 编译 debug 版本
3. Tauri 打开窗口，自动加载 dev server URL
4. **setup.rs** 启动首次环境检查：
   - 检查 `~/AppData/Roaming/BClaw/openclaw-ready.flag`
   - 若不存在 → 依次查找 Node.js → 查找 openclaw → 写入 flag
5. **gateway_manager.rs** 启动 Gateway：
   - 探针 `127.0.0.1:18789`
   - 若未占用 → 查找 node/openclaw 二进制 → 生成 `openclaw.json` → spawn 子进程
   - 等待端口就绪（30s 超时）
6. 前端收到 `setup:complete` 事件 → 显示主界面
7. VoiceService 连接 `ws://localhost:18789/ws`

> 首次启动时，setup 流程可能需要几分钟（查找/下载 Node.js、查找 openclaw）。后续启动因 flag 存在会跳过 setup。

#### 开发时常见问题

| 现象                             | 原因                          | 解决                                                       |
| -------------------------------- | ----------------------------- | ---------------------------------------------------------- |
| `openclaw binary not found`      | 自动探测失败且未全局安装      | 确保 openclaw 源码在同级目录，或 `npm install -g openclaw` |
| `Gateway port 18789 is occupied` | 上次调试残留进程              | 手动结束 `node.exe` 相关进程，或重启电脑                   |
| `invalid connect params`         | `gateway-protocol` 未重新构建 | `cd packages/gateway-protocol && npm run build`            |
| 窗口白屏                         | Vite server 未启动或端口冲突  | 检查 `localhost:1420` 是否可访问                           |

---

### 场景 B：打包/发布构建 (`tauri build`)

适用于生成可独立分发的 `.exe` / `.msi` 安装包。

#### 步骤 1：准备离线资源（推荐，实现完全离线部署）

运行准备脚本，将 Node.js 和 openclaw 源码打包进安装包：

```powershell
cd BClaw-ui\src-tauri\scripts
.\prepare-offline-resources.ps1
```

该脚本执行：

1. 下载 Node.js v22.12.0 `win-x64` zip 并解压到 `resources/node/`
2. 从仓库根目录自动探测 openclaw 源码，执行 `npm install`
3. 使用 `robocopy /MIR` 将 openclaw 源码复制到 `resources/openclaw/`（排除 `.git`, `node_modules` 等）
4. 单独复制 `node_modules`（运行时必需）

准备完成后目录结构：

```
src-tauri/resources/
├── node/
│   ├── node.exe          # 离线 Node.js 运行时
│   ├── npm.cmd           # 离线 npm
│   └── ...
├── openclaw/
│   ├── openclaw.mjs      # openclaw 入口
│   ├── package.json
│   ├── node_modules/     # 运行时依赖
│   └── ...
├── skills/               # 内嵌 Skill
└── config/
    └── model-config.json # 默认模型配置
```

> **注意**：`prepare-offline-resources.ps1` 当前从仓库根目录的 `openclaw.mjs` 和 `package.json` 探测源码。执行前确保 openclaw 源码目录已执行过 `npm install` 且能正常启动。

#### 步骤 2：构建发布包

```bash
cd BClaw-ui
npm run tauri build
```

执行流程：

1. `npm run build` → Vite 生产构建，输出到 `dist/`
2. Rust release 编译（`opt-level=3`, `lto=true`, `strip=true`）
3. Tauri bundler 将 `dist/` + `src-tauri/resources/` 打包
4. 生成 NSIS 安装器：`src-tauri/target/release/bundle/nsis/*.exe`

#### 步骤 3：安装与首次运行

用户运行安装器后：

1. 安装到 `C:\Program Files\BClaw\`（perMachine 模式）
2. 运行时目录结构：
   ```
   C:\Program Files\BClaw\
   ├── BClaw.exe
   ├── resources/
   │   ├── node/           # 离线 Node.js
   │   ├── openclaw/       # 离线 openclaw
   │   ├── skills/
   │   └── config/
   └── ...
   ```
3. 首次运行 → setup.rs：
   - 发现内嵌 `resources/node/node.exe` → 直接使用（无需下载）
   - 发现内嵌 `resources/openclaw/openclaw.mjs` → 直接使用（无需 npm 安装）
   - 写入 `~/AppData/Roaming/BClaw/openclaw-ready.flag`
4. gateway_manager.rs 启动 Gateway：
   - 使用内嵌的 node.exe + openclaw.mjs
   - 生成 `~/AppData/Roaming/BClaw/openclaw-state/openclaw.json`
   - spawn 子进程：`node.exe openclaw.mjs gateway run --bind loopback --port 18789`
   - 日志写入 `~/AppData/Local/BClaw/gateway.log`

---

### 两种场景下 openclaw 安装/启动流程对比

| 阶段                 | 调试/开发 (`tauri dev`)                                                   | 打包/发布 (`tauri build` + 安装)                                          |
| -------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| **Node.js 来源**     | ① 内嵌 `resources/node` → ② 系统 PATH `node` → ③ 自动下载 `win-x64` zip   | 内嵌 `resources/node/node.exe`（离线包）                                  |
| **openclaw 来源**    | ① 内嵌 `resources/openclaw` → ② `where openclaw` → ③ **源码目录自动探测** | 内嵌 `resources/openclaw/openclaw.mjs`（离线包）                          |
| **npm install**      | 仅在全局安装时触发                                                        | `prepare-offline-resources.ps1` 已在构建时执行 `npm install`              |
| **首次启动耗时**     | 可能需要下载 Node.js 或安装 openclaw（数分钟）                            | 几乎即时（所有资源已内嵌）                                                |
| **网络依赖**         | 首次启动可能需要网络（下载 Node.js / npm install）                        | 完全离线，无需网络                                                        |
| **Gateway 启动命令** | `node <openclaw.mjs> gateway run ...` 或 `openclaw gateway run ...`       | `resources\node\node.exe resources\openclaw\openclaw.mjs gateway run ...` |
| **配置目录**         | `~/AppData/Roaming/BClaw/openclaw-state/`                                 | 同上                                                                      |
| **日志位置**         | `~/AppData/Local/BClaw/gateway.log`                                       | 同上                                                                      |

---

## 5. 与 openclaw 的联动方式

### 5.1 启动时序

```
Tauri App 启动
   │
   ▼
setup::ensure_openclaw_ready()          [async, setup.rs]
   ├── 检测/安装 Node.js (≥v22.19, 离线优先)
   └── 检测/安装 openclaw (离线优先 → npm install -g)
   │
   ▼
gateway_manager.ensure_running()        [async, gateway_manager.rs]
   ├── 探针端口 18789
   ├── 生成 openclaw.json (含模型配置 + skills 目录)
   ├── 子进程启动: node <openclaw> gateway run --bind loopback --port 18789
   └── 等待健康检查 (30s 超时)
   │
   ▼
emit "setup:complete" → 前端切换主界面
   │
   ▼
gateway_manager.watchdog()              [后台循环, 每 10s]
   └── 端口探针失败 → 自动重启 (指数退避, 最多 5 次)
```

### 5.2 Gateway 子进程管理

| 能力     | 实现                                                                     |
| -------- | ------------------------------------------------------------------------ |
| 环境隔离 | `OPENCLAW_STATE_DIR` 指向独立的 `~/AppData/Roaming/BClaw/openclaw-state` |
| 配置注入 | `config_manager.rs` 将模型配置转为环境变量 + `openclaw.json`             |
| 日志收集 | stdout/stderr 重定向到 `~/AppData/Local/BClaw/gateway.log`               |
| 僵尸清理 | Windows 下通过 `netstat` + `taskkill` 清理残留进程                       |
| 应用退出 | `RunEvent::ExitRequested` 时 kill 子进程 + 释放音频资源                  |

### 5.3 Gateway Protocol v4 通信

前端通过 `GatewayClient` (`gateway-client.ts`) 与服务端 WebSocket 通信：

| 方向     | 协议细节                                                          |
| -------- | ----------------------------------------------------------------- |
| 连接地址 | `ws://localhost:18789/ws`                                         |
| 握手     | `connect` request，client id = `bclaw-desktop`，role = `operator` |
| 协议版本 | min/max = 4                                                       |
| 请求格式 | `{type:"req", id, method, params}`                                |
| 响应格式 | `{type:"res", id, ok, payload/error}`                             |
| 事件格式 | `{type:"event", event, payload, seq}`                             |

### 5.4 Talk Session 语音对话流程

```
[用户点击麦克风]
   │
   ▼
voice.connect() → GatewayClient.connect()
   │
   ▼
talk.client.create / talk.session.create   [创建 relay session]
   │
   ▼
invoke("start_capture") → Rust cpal 采集开始
   │
   ├── Rust emit "audio:capture" → {audio_base64, timestamp_ms}
   │
   ▼
voice-service.sendAudio() → talk.session.appendAudio
   │
   ▼
Gateway 处理 → 返回 talk.event 事件
   ├── "transcript" (用户/AI 转录文字)
   ├── "audio" (AI 回复音频) → invoke("play_audio")
   └── "error" / "close" 等状态事件
```

### 5.5 使用的 Gateway Methods

| Method                      | 用途                       |
| --------------------------- | -------------------------- |
| `connect`                   | WebSocket 握手             |
| `talk.client.create`        | 创建实时语音会话 (优先)    |
| `talk.session.create`       | 兼容旧 Gateway 的 fallback |
| `talk.session.appendAudio`  | 上传用户音频帧             |
| `talk.session.cancelTurn`   | 取消当前对话轮次           |
| `talk.session.cancelOutput` | 停止 AI 语音输出           |
| `chat.send`                 | 文字消息发送               |

### 5.6 模型配置联动

`ModelConfigPanel` 支持配置 Anthropic / OpenAI 风格 API：

1. 前端通过 Tauri command (`set_model_config`) 保存配置到 `~/AppData/Roaming/BClaw/config/model-config.json`
2. `config_manager.rs` 将配置转换为环境变量：
   - Anthropic: `ANTHROPIC_AUTH_TOKEN`, `ANTHROPIC_BASE_URL`, `ANTHROPIC_MODEL`, ...
   - OpenAI: `OPENAI_API_KEY`, `OPENAI_BASE_URL`, `OPENAI_MODEL`, ...
3. 同时生成 `openclaw.json` 的 `models.providers` 片段
4. 用户点击"保存并重启 Gateway" → `restart_gateway` command → 停止旧进程 → 启动新进程（加载新配置）

---

## 6. 音频处理

### 6.1 采集 (capture.rs)

- 使用 `cpal` 默认输入设备
- 配置: 单声道, 24kHz, f32 样本
- 回调中将 f32 → PCM16 LE → base64 → emit `audio:capture`
- 时间戳使用 `SystemTime::now()` 毫秒级 UNIX 时间

### 6.2 播放 (playback.rs)

- 使用 `cpal` 默认输出设备
- 配置: 单声道, 24kHz, f32 样本
- 接收 base64 PCM16 → decode → f32 samples → 写入输出流
- `PlaybackHandle` 支持 `stop()` 中断播放

### 6.3 音频格式

openclaw Gateway relay 模式约定的标准格式：

| 参数     | 值            |
| -------- | ------------- |
| 采样率   | 24,000 Hz     |
| 声道     | Mono (1)      |
| 位深     | 16-bit PCM    |
| 字节序   | Little Endian |
| 传输编码 | Base64        |

---

## 7. 已知问题与注意事项

### 7.1 构建同步问题

`packages/gateway-protocol` 的源码与编译产物可能不同步。若向 `GATEWAY_CLIENT_IDS` 新增 client id（如 `bclaw-desktop`），必须重新构建该包：

```bash
cd packages/gateway-protocol && npm run build
```

否则 Gateway 服务端会因 `dist/` 中的旧 enum 不包含新值而拒绝连接，报错：`invalid connect params: at /client/id: must be equal to constant`。

### 7.2 离线资源准备

`resources/node` 和 `resources/openclaw` 目前仅含 `.gitkeep`，离线包需要手动放置或执行 `scripts/prepare-offline-resources.ps1` 准备。

### 7.3 唤醒词/VAD 未实现

对比 `PLAN.md` 的规划，当前 Stage 1 尚未实现：

- 唤醒词检测 (porcupine)
- VAD 端点检测 (silero-vad)

当前流程是：用户点击麦克风按钮开始采集，再次点击或自动结束（由 Gateway relay 侧判断）。

### 7.4 Windows 平台特化

- Node.js 下载硬编码 `win-x64` 平台
- 进程清理使用 `netstat` + `taskkill` (Windows only)
- `find_or_install_node` 查找 `node.exe`

### 7.5 开发 vs 生产路径解析

`resolve_bundled_resource` 和 `find_openclaw_source_dir` 有双路径逻辑：

- **Dev**: 相对 `CARGO_MANIFEST_DIR` (即 `src-tauri/`) 查找
- **Production**: 相对 `current_exe()` 查找 `resources/`

---

## 8. 后续迭代建议方向

1. **唤醒词 + VAD**: 实现 PLAN.md 中的 `AudioPipeline`，减少用户点击操作
2. **离线资源打包**: 完善 `prepare-offline-resources.ps1`，将 Node.js + openclaw 打入安装包
3. **托盘模式**: 最小化到系统托盘，后台持续监听唤醒词
4. **多平台支持**: 将 Windows 特化逻辑抽象，支持 macOS/Linux
5. **配置热更新**: 无需重启 Gateway 即可切换模型配置
6. **gateway-protocol 构建集成**: 在 BClaw-ui 构建前自动检查并同步 `packages/gateway-protocol`
