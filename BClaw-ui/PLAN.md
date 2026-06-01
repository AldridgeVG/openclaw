# BClaw-ui — Tauri 语音客户端实现计划

基于 openclaw Gateway Protocol v4，实现一个原生 Tauri 桌面语音助手客户端。

---

## 整体架构

```
┌─────────────────────────────────────────────┐
│           Tauri Desktop App                  │
│  ┌─────────┐  ┌─────────┐  ┌─────────────┐ │
│  │ 语音监听 │→ │ 唤醒/VAD │→│ Gateway WS  │ │
│  │ (Rust)  │  │ (Rust)  │  │  Client(TS) │ │
│  └─────────┘  └─────────┘  └──────┬──────┘ │
│       ↑                           ↓        │
│  ┌─────────┐                ┌──────────┐   │
│  │ 音频输出 │←───────────────│ openclaw │   │
│  │ (Rust)  │   TTS 音频流    │ Gateway  │   │
│  └─────────┘                └──────────┘   │
└─────────────────────────────────────────────┘
```

---

## 1. 拉起 openclaw Gateway

Tauri 侧负责 openclaw 网关的生命周期管理：

| 场景 | 实现方式 |
|------|---------|
| **内嵌启动** | Tauri 启动时 `Command::new("openclaw").args(["gateway"]).spawn()`，守护子进程 |
| **外部连接** | 探测本地 `ws://localhost:<port>/ws`，若未运行则引导用户启动 |
| **进程保活** | Rust 侧 `tauri::async_runtime` 定时 health check，崩溃自动重启 |

```rust
// src-tauri/src/gateway.rs
pub async fn spawn_gateway(app_handle: AppHandle) -> Result<Child> {
    let child = Command::new("openclaw")
        .args(["gateway", "--headless"])
        .spawn()?;

    // 等待 health check 通过
    wait_for_gateway_ready().await?;
    Ok(child)
}
```

---

## 2. 语音 Pipeline（Rust 侧实现，低延迟）

在 Tauri 的 **Rust 后端** 实现音频采集和唤醒词检测（避免 JS 音频 API 的延迟和权限问题）：

```
麦克风采集 → 环形缓冲区 → 唤醒词检测 → VAD检测 → 音频分段 → base64 → 前端/直发Gateway
```

### 依赖选型

| 功能 | Crate 建议 |
|------|-----------|
| 音频采集 | `cpal`（跨平台音频 I/O）|
| 唤醒词检测 | `porcupine` (Picovoice，轻量本地模型) 或 `whisper.cpp` 流式识别 |
| VAD / 语音端点检测 | `silero-vad` (ONNX) 或 `webrtc-vad` |
| 音频编码 | 直接输出 PCM16，openclaw 原生支持 |

```rust
// src-tauri/src/audio.rs
pub struct AudioPipeline {
    porcupine: Porcupine,        // 唤醒词："Hey Claw"
    vad: SileroVad,              // 检测说话起止
    ringbuf: HeapRb<f32>,        // 预缓冲，捕获唤醒词前的音频
    state: State,                // Idle → Listening → Processing
}

enum State {
    Idle,           // 只跑唤醒词检测
    Listening,      // 唤醒后，跑VAD采集完整句子
    Processing,     // 等待 openclaw 返回
}
```

### 唤醒 → STT 流程

1. **Idle 状态**：小窗口音频持续输入 `porcupine.process()`，检测唤醒词
2. **检测到唤醒词**：切换 `Listening` 状态，启用 VAD
3. **VAD 检测到语音开始**：开始累积音频到 buffer
4. **VAD 检测到语音结束**（或超时）：标记输入完成，发送给 openclaw

---

## 3. 与 openclaw 交互（WebSocket Protocol v4）

Tauri 前端（JS/TS）或 Rust 侧维护一个 WebSocket 连接，复用 openclaw 已有的 Gateway Protocol v4。

### 创建 Talk Session

```typescript
// 连接后创建语音会话
const session = await gateway.request("talk.client.create", {
  sessionKey: "tauri-voice-session",
  voice: "alloy",              // TTS 音色
  model: "gpt-4o-realtime",    // 实时模型
  mode: "relay",               // 用 gateway relay 模式，Tauri 只收发音频帧
});
```

### 音频输入（STT）

Rust 侧 VAD 检测到完整语音后，通过 Tauri `emit` 发给前端或直接 HTTP/WS 发送：

```typescript
// 方式 A：前端转发（简单）
await gateway.request("talk.session.appendAudio", {
  sessionId: session.id,
  audio: base64Pcm16Audio,     // from Rust event
  format: "pcm16",
  sampleRate: 24000,
});
```

### 音频输出（TTS）

监听 Gateway 的音频事件，回传 Rust 侧播放：

```typescript
gateway.onEvent("talk.audio", (payload) => {
  // payload.audio: base64 PCM16
  invoke("play_audio", { pcm16Base64: payload.audio });
});
```

```rust
#[tauri::command]
async fn play_audio(pcm16_base64: String) -> Result<()> {
    let decoded = base64_decode(pcm16_base64)?;
    let samples = pcm16_to_f32(&decoded);
    audio_output_stream.play(samples)?;  // cpal 输出
    Ok(())
}
```

---

## 4. "输入完成"检测策略

| 策略 | 说明 | 适用 |
|------|------|------|
| **VAD 静音检测** | 检测到 0.8-1.2s 连续静音即认为说完 | 通用，最自然 |
| **结束词检测** | 在音频流中检测"结束""发送"等关键词 | 用户明确要求 |

**推荐**：以 VAD 为主，结束词为辅。Rust 侧 VAD 判定 `speech_end` 后，将累积的音频一次性发送。

---

## 5. 关键时序

```
Tauri启动
   │
   ▼
┌─────────────┐     ┌─────────────┐     ┌─────────────────┐
│ 启动openclaw │────→│ 连接WS      │────→│ talk.client.create
└─────────────┘     └─────────────┘     └─────────────────┘
                                               │
                    ┌──────────────────────────┘
                    ▼
[Idle] ←──── 持续监听麦克风，跑唤醒词检测
   │
   ├── "Hey Claw" ──→ [Listening] 开启 VAD
   │                       │
   │                       ├── 语音开始 → 累积音频
   │                       │
   │                       └── 语音结束(VAD) ──→ talk.session.appendAudio
   │                                                   │
   │                                               [Processing]
   │                                                   │
   └───────────────────────────────────────────────────┘
                        ←── talk.audio 事件 ───┘
                                                   │
                                               Rust播放TTS
                                                   │
                                               [Idle] 恢复监听
```

---

## 6. 项目结构建议

```
BClaw-ui/
├── src-tauri/
│   ├── src/
│   │   ├── main.rs           # Tauri 入口，启动 gateway
│   │   ├── gateway.rs        # openclaw 子进程管理
│   │   ├── audio/
│   │   │   ├── capture.rs    # cpal 麦克风采集
│   │   │   ├── playback.rs   # cpal 音频输出
│   │   │   ├── wake_word.rs  # porcupine 唤醒词
│   │   │   └── vad.rs        # silero-vad 端点检测
│   │   └── lib.rs
│   └── Cargo.toml            # deps: cpal, porcupine, serde, tauri
├── src/
│   ├── gateway-client.ts     # 复用/改写 GatewayBrowserClient
│   ├── voice-service.ts      # 封装 talk.* API
│   └── App.tsx               # UI（可选，最小化到托盘）
└── package.json
```

---

## 7. 复用 openclaw 已有能力

openclaw 已经有完整的语音栈，Tauri 客户端可以**分层选择**：

| 你的实现 | 复用 openclaw |
|---------|--------------|
| 麦克风采集 + 唤醒词 + VAD | 必须自己做（桌面端原生）|
| STT 语音识别 | 可选：自己调 Whisper API，或发给 openclaw `talk.session.appendAudio` |
| LLM 对话 | `chat.send` 或 talk relay 模式 |
| TTS 语音合成 | `talk.speak` 或 talk relay 模式自动输出 |

**推荐路径**：Tauri 只做**音频 I/O + 唤醒/VAD**，其余全部走 openclaw Gateway Protocol。这样 LLM、TTS、STT 提供商的配置都在 openclaw 一侧管理，Tauri 是纯粹的原生语音前端。

---

## 8. 参考资源

- openclaw Gateway Protocol v4: `src/gateway/methods/core-descriptors.ts`
- openclaw 浏览器客户端参考: `ui/src/ui/gateway.ts`
- openclaw Android 原生客户端: `apps/android/.../GatewaySession.kt`
- openclaw Talk 会话管理: `ui/src/ui/chat/realtime-talk.ts`
