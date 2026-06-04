# BClaw-ui 现状文档 (Stage 2)

> 本文档继承 STAGE1.md，记录 Stage 1 完成后已实现的功能更新，并规划 Stage 2 的三大核心能力：后台常驻+语音唤醒、Skills 环境隔离、云端登录体系。
> 生成日期: 2026-06-04

---

## 1. Stage 1 已完成的功能更新

### 1.1 设置面板重构（左侧边栏 + ASR 语音测试）

- `ModelConfigPanel.tsx` 从单页弹窗改为 **左侧边栏双 Tab 布局**：
  - **模型配置**：Anthropic / OpenAI 风格 API、Base URL、模型、超时等。
  - **语音识别配置**：ASR 提供商选择（SiliconFlow / OpenAI Realtime / 本地 Paraformer / 关闭），以及**语音输入测试**。
- 新增 **语音输入测试按钮**：仅在 `local-paraformer` 模式下可用。点击开始录音，再次点击结束并调用 Rust `transcribe_audio` 展示识别结果，方便用户验证本地麦克风与模型效果。

### 1.2 本地 ASR 性能优化（16 kHz 采集）

- `audio/capture.rs` 的 `start_capture` 支持传入 **目标采样率参数**。
- `local-paraformer` 模式下：
  - 采集采样率从 24 kHz 降至 **16 kHz**（与 Paraformer 中文模型训练采样率一致）。
  - 传递给 `transcribe_audio` 的 `sampleRate` 同步改为 `16000`。
- HTTP / OpenAI Realtime 模式保持 **24 kHz** 不变。
- 预期收益：本地 ASR 的推理数据量减少约 44%，停止录音后的“卡住”时间显著缩短。

### 1.3 默认配置调整

- `DEFAULT_ASR_CONFIG` 默认 provider 从 `siliconflow` 改为 **`local-paraformer`**。
- 新增 `SILICONFLOW_ASR_CONFIG` 预设常量，保证切换回 SiliconFlow 时配置正确。

---

## 2. Stage 2 规划：三大核心能力

### 2.1 后台常驻 + 语音唤醒

#### 目标

让 BClaw 具备**系统托盘常驻**能力，用户无需主动点击麦克风，说出唤醒词即可触发语音对话。

#### 技术方案

| 模块             | 方案                                                                                                                                                        |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **系统托盘**     | Tauri `tray-icon` API：`set_show_in_tray(true)`，右键菜单提供「显示主窗口 / 退出」。关闭窗口时默认最小化到托盘而非退出应用。                                |
| **后台音频采集** | Rust 侧保持 `cpal` 输入流常驻（低功耗模式，小 buffer），持续向环形缓冲区写入音频。                                                                          |
| **唤醒词检测**   | 引入 **Picovoice Porcupine**（离线、轻量、多平台）。唤醒词建议 `"Hey Claw"`。在 `Idle` 状态下只跑唤醒词检测，检测到后进入 `Listening` 状态。                |
| **VAD 端点检测** | 引入 **Silero-VAD**（ONNX 运行时）或 **webrtc-vad**。唤醒后启用 VAD：检测到语音开始 → 累积音频；检测到静音（如连续 800ms 无语音）→ 判定语音结束，触发 ASR。 |
| **状态机**       | `AudioPipeline` 状态机：`Idle → Listening → Processing → Idle`。`Idle` 只跑唤醒词；`Listening` 跑 VAD + 累积音频；`Processing` 等待 ASR/Gateway 返回。      |
| **前端交互**     | 唤醒成功后：托盘图标高亮 / 主窗口自动弹出（若设置中开启），语音 Orb 状态从 `idle` → `listening`。VAD 检测到语音结束后自动进入 `processing`。                |
| **配置项**       | 在「语音识别配置」Tab 中增加：「启用语音唤醒」开关、「唤醒灵敏度」滑动条、「VAD 静音阈值(ms)」输入框。                                                      |

#### 新增/修改文件

- `src-tauri/src/audio/wake_word.rs`：Porcupine 封装，加载内置 `.ppn` 模型文件。
- `src-tauri/src/audio/vad.rs`：Silero-VAD 封装，语音起止判定。
- `src-tauri/src/audio/pipeline.rs`：`AudioPipeline` 状态机，整合采集 + 唤醒 + VAD + 事件发射。
- `src-tauri/src/audio/capture.rs`：支持**常驻采集模式**（不随 `start_capture` 命令启停，仅由 Pipeline 控制）。
- `src-tauri/src/main.rs`：注册 `set_wake_word_enabled` 等新 command；启动时若启用唤醒则初始化 Pipeline。
- `src-tauri/tauri.conf.json` / `Cargo.toml`：增加 `tray-icon` feature 与 `porcupine` / `ort` (ONNX Runtime) 依赖。
- `src/ModelConfigPanel.tsx`：增加唤醒与 VAD 相关配置 UI。
- `src/App.tsx`：处理托盘事件（单击显示窗口、右键菜单）。

---

### 2.2 预置 Skills 区分环境（prod / dev）

#### 目标

打包时根据目标环境注入不同的 Skill 集合，避免开发/测试 Skill 进入生产包。

#### 现状

- `src-tauri/resources/skills/` 下目前混合存放了生产 Skill（`fs-open`）与开发 Skill（`dev-*`）。
- `gateway_manager.rs` 通过 `get_bundled_skills_dir()` 将 `resources/skills` 目录作为 `extraDirs` 写入 `openclaw.json`。

#### 技术方案

1. **目录拆分**
   ```
   src-tauri/resources/
   ├── skills/
   │   ├── prod/          # 生产环境 Skill
   │   └── dev/           # 开发/调试 Skill
   ```
2. **构建时环境变量注入**
   - 在 `src-tauri/Cargo.toml` 中利用 `cfg` 区分：
     - `tauri build`（release）默认使用 `prod`。
     - `tauri dev` 或显式启用 `dev-skills` feature 时使用 `dev`。
   - 或通过 npm 脚本：`npm run tauri build -- --features prod-skills`。
3. **Rust 侧路径选择**
   - `gateway_manager.rs` 的 `get_bundled_skills_dir()` 改为根据编译期 `cfg` 或运行期环境变量选择子目录：
     ```rust
     let skills_subdir = if cfg!(feature = "dev-skills") { "dev" } else { "prod" };
     ```
   - 同时保留兜底：若 `BCLAW_ENV=dev` 环境变量存在，运行时也允许覆盖到 `dev` 目录（方便测试已安装包）。
4. **打包脚本适配**
   - `prepare-offline-resources.ps1` 增加 `-Env prod|dev` 参数，控制复制哪些 Skill。
   - CI/CD 流水线中，生产构建时显式传入 `-Env prod`。

#### 新增/修改文件

- `src-tauri/resources/skills/prod/` 与 `dev/`：重新整理现有 Skill。
- `src-tauri/src/gateway_manager.rs`：`get_bundled_skills_dir()` 增加环境分支逻辑。
- `src-tauri/Cargo.toml`：新增可选 feature `dev-skills`。
- `src-tauri/scripts/prepare-offline-resources.ps1`：支持按环境过滤 Skill。
- `BClaw-ui/package.json`：增加构建脚本如 `build:prod`、`build:dev`。

---

### 2.3 接入云端登录体系

#### 目标

用户可登录云端账号，实现多设备配置同步、权限管理与用户身份追踪。支持三种登录方式，且区分 `prod` / `dev` 环境。

#### 登录方式

| 方式                     | 实现方案                                                                                         | 优先级 |
| ------------------------ | ------------------------------------------------------------------------------------------------ | ------ |
| **用户名 + 密码**        | 表单输入 → POST `/auth/login` → 返回 JWT `accessToken` + `refreshToken`。                        | P0     |
| **邮箱 / 手机 + 验证码** | 输入邮箱或手机号 → POST `/auth/send-otp` → 输入验证码 → POST `/auth/verify-otp` → 返回 JWT。     | P0     |
| **微信二维码**           | 调用云端接口获取微信登录二维码 URL → 前端渲染二维码 → 轮询或 WebSocket 等待扫码结果 → 返回 JWT。 | P1     |

#### 环境隔离

- 登录相关请求域名根据当前构建/运行环境决定：
  - `prod`：`https://api.bclaw.cloud`
  - `dev`：`https://api-dev.bclaw.cloud`
- 实现方式：
  - 前端通过 `import.meta.env.VITE_API_BASE_URL` 读取环境变量（Vite 构建时注入）。
  - Rust 侧通过编译期 `cfg` 或读取 `BCLAW_ENV` 环境变量确定域名，用于可能的 Rust-native HTTP 请求。

#### 用户信息存储

- **写入注册表**（Windows）：
  - 登录成功后，将 `username`、`phone` 写入 `HKEY_CURRENT_USER\Software\BClaw\UserInfo`。
  - Rust 侧使用 `windows-registry` crate（或 `winreg`）实现读写。
  - 退出登录时清除对应注册表项。
- **Token 存储**：
  - `accessToken` 存入内存（前端状态 / Rust State），不持久化到磁盘；若需要持久化，使用系统 Keychain / Credential Manager（`keyring` crate）。
  - `refreshToken` 如有需要可存入 Keychain。

#### Gateway 请求附加用户信息

- **功能开关**：在「模型配置」Tab 底部增加配置项：「在对话中附加用户信息」（默认关闭）。
- 开启后，前端在通过 `voice-service.ts` 发送 `chat.send` 或 `talk.session.appendAudio` 时：
  - 从注册表（或内存状态）读取当前 `username`、`phone`。
  - 在消息末尾自动拼接：
    ```

    ```

[用户信息] 用户: {username}, 手机: {phone}
```

- 若用户未登录，则不附加，并在日志中 warning。
- Rust 侧若需要直接调用 Gateway，也提供辅助函数 `append_user_info_if_enabled(message: String) -> String`。

#### 登录状态管理

- **前端**：新增 `auth-service.ts`，封装：
  - `loginByPassword(username, password)`
  - `sendOtp(contact)` / `verifyOtp(contact, code)`
  - `getWechatQrCode()` / `pollWechatLogin(qrToken)`
  - `logout()`
  - `getCurrentUser()`
- **全局状态**：在 `App.tsx` 中增加登录状态栏（Header 右侧），显示当前用户名 / 「登录 / 退出」按钮。
- **登录弹窗**：新建 `LoginModal.tsx`，支持三种登录方式的 Tab 切换。

#### 新增/修改文件

- `src/auth-service.ts`：登录 API 封装与 Token 管理。
- `src/user-info.ts`：用户信息类型、读取/写入注册表的 Tauri command 封装。
- `src/LoginModal.tsx`：登录弹窗 UI。
- `src/App.tsx`：Header 增加登录状态显示；未登录时可点击打开登录弹窗。
- `src/ModelConfigPanel.tsx`：增加「附加用户信息」开关。
- `src/voice-service.ts`：`sendChat` / `transcribeAndSend` 中根据开关决定是否拼接用户信息。
- `src-tauri/src/auth_manager.rs`：Rust 侧注册表读写、Token 内存管理、环境域名配置。
- `src-tauri/src/main.rs`：注册 `get_user_info`、`set_user_info`、`clear_user_info` 等 command。
- `src-tauri/Cargo.toml`：增加 `winreg`（Windows 注册表）与 `keyring`（凭据管理）依赖。
- `.env.production` / `.env.development`：定义 `VITE_API_BASE_URL`。

---

## 3. 时序与依赖关系

```
Stage 2 启动
   │
   ├──► 2.2 Skills 环境隔离（基础构建层，优先做）
   │      ├── 目录拆分 prod/dev
   │      ├── gateway_manager.rs 环境分支
   │      └── prepare-offline-resources.ps1 适配
   │
   ├──► 2.3 云端登录（与用户体系强相关）
   │      ├── auth-service.ts + LoginModal.tsx
   │      ├── auth_manager.rs（注册表/Keychain）
   │      ├── App.tsx 登录状态栏
   │      └── ModelConfigPanel.tsx 附加信息开关
   │
   └──► 2.1 后台常驻+语音唤醒（改动面最大，最后做）
          ├── 托盘常驻（tauri tray-icon）
          ├── audio/pipeline.rs（状态机）
          ├── audio/wake_word.rs（Porcupine）
          ├── audio/vad.rs（Silero-VAD）
          └── ModelConfigPanel.tsx 唤醒/VAD 配置
```

**推荐迭代顺序**：先完成 **2.2**（轻量、无外部依赖），再完成 **2.3**（与前端 UI 耦合较多），最后攻坚 **2.1**（涉及 Rust 音频架构重构与第三方模型集成）。

---

## 4. 风险与注意事项

| 风险点                   | 说明                                                                          | 缓解措施                                                                                     |
| ------------------------ | ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| **Porcupine 授权**       | Picovoice 个人免费、商用需授权。                                              | 前期使用免费版，产品化前评估授权费用或替换为自训练唤醒模型。                                 |
| **Silero-VAD ONNX 体积** | ONNX Runtime + VAD 模型可能增加安装包体积（约 10-20 MB）。                    | 评估 `webrtc-vad`（更轻量、但精度略低）作为备选方案。                                        |
| **注册表跨平台**         | `winreg` 仅支持 Windows；macOS/Linux 需改用 Keychain / files。                | `auth_manager.rs` 内按 `#[cfg(target_os = "windows")]` 分支，非 Windows 先写入本地加密文件。 |
| **Token 安全**           | JWT 明文存储在内存中，应用崩溃可能泄露。                                      | AccessToken 有效期设短（如 15min），RefreshToken 存 Keychain；Rust 侧提供自动刷新逻辑。      |
| **Gateway 兼容性**       | 附加用户信息会改变消息文本，可能影响 openclaw 的 Skill 路由或历史记录一致性。 | 以 Markdown 注释或固定格式附加（如 `<!-- user:xxx phone:yyy -->`），尽量不影响语义解析。     |

---

## 5. 参考文件索引

| 文件                               | Stage 2 中的角色                          |
| ---------------------------------- | ----------------------------------------- |
| `STAGE1.md`                        | 基线架构与构建流程                        |
| `PLAN.md`                          | 原始语音 Pipeline 设计参考                |
| `src-tauri/src/audio/capture.rs`   | 需扩展为常驻采集 + 参数化采样率（已完成） |
| `src-tauri/src/audio/playback.rs`  | 复用现有播放能力                          |
| `src-tauri/src/gateway_manager.rs` | 需增加 Skills 环境分支                    |
| `src-tauri/src/config_manager.rs`  | 需扩展用户配置（附加信息开关）            |
| `src/ModelConfigPanel.tsx`         | 新增唤醒、VAD、登录开关等配置项           |
| `src/voice-service.ts`             | 附加用户信息拼接点                        |
| `src/App.tsx`                      | 托盘常驻、登录状态栏                      |
