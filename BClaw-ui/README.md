# BClaw

BClaw 语音助手桌面客户端 —— 基于 Tauri + React 构建的轻量级 AI 语音交互应用。

## 功能特性

- **语音对话** — 点击麦克风按钮进行语音输入，支持聆听、处理、播报状态流转
- **文字聊天** — 底部输入框支持键盘输入文字消息
- **实时状态** — 顶部状态栏展示网络连接状态（连接中 / 已连接 / 未连接 / 错误）
- **对话记录** — 右侧聊天面板展示用户与 AI 的完整对话历史
- **语音动效** — 聆听/处理/播报时展示动态波形动画
- **设置入口** — 预留设置按钮，方便后续扩展配置

## 技术栈

| 层 | 技术 |
|---|---|
| 前端框架 | React 18 + TypeScript |
| 构建工具 | Vite |
| 桌面端 | Tauri v2 |
| UI 图标 | Lucide React |

## 环境要求

- [Node.js](https://nodejs.org/) (v18+)
- [Rust](https://www.rust-lang.org/tools/install) 工具链
- [Tauri CLI](https://tauri.app/start/prerequisites/) 依赖的系统库

## 快速开始

```bash
# 1. 克隆仓库
git clone <repo-url>
cd BClaw-ui

# 2. 安装前端依赖
npm install

# 3. 运行开发模式（热更新 + DevTools）
npm run tauri dev

# 4. 构建生产版本
npm run tauri build
```

## 常用命令

| 命令 | 说明 |
|---|---|
| `npm run dev` | 仅启动 Vite 前端开发服务器 |
| `npm run build` | 构建前端静态资源到 `dist/` |
| `npm run preview` | 预览生产构建 |
| `npm run tauri dev` | 启动 Tauri 开发模式（Rust + 前端热更新） |
| `npm run tauri build` | 打包桌面应用（输出到 `src-tauri/target/release/bundle/`） |

## 项目结构

```
BClaw-ui/
├── src/                  # 前端源码 (React + TypeScript)
│   ├── App.tsx           # 主应用组件（语音交互 + 聊天界面）
│   ├── App.css           # 全局样式
│   ├── main.tsx          # 入口文件
│   └── vite-env.d.ts     # Vite 类型声明
├── src-tauri/            # Tauri 后端 (Rust)
│   ├── src/main.rs       # Rust 入口，初始化 Shell 插件
│   ├── Cargo.toml        # Rust 依赖配置
│   ├── tauri.conf.json   # Tauri 应用配置（窗口、图标、Bundle）
│   └── capabilities/     # 权限配置
├── index.html            # HTML 模板
├── vite.config.ts        # Vite 配置（针对 Tauri 优化端口和热更新）
├── package.json          # Node 依赖与脚本
└── tsconfig.json         # TypeScript 配置
```

## 配置说明

### 窗口参数 (`src-tauri/tauri.conf.json`)

- 默认尺寸：`480 × 720`
- 最小尺寸：`380 × 560`
- 居中显示，可调整大小

### 开发服务器 (`vite.config.ts`)

- 固定端口：`1420`
- HMR 端口：`1421`
- 忽略 `src-tauri/` 目录的文件监听

## 许可证

MIT
