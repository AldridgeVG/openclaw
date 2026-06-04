import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  Mic,
  MicOff,
  Power,
  Wifi,
  WifiOff,
  MessageSquare,
  Volume2,
  Settings,
  Zap,
  Loader2,
  CheckCircle2,
  XCircle,
  Ear,
} from "lucide-react";
import { useState, useEffect, useRef, useCallback } from "react";
import { ModelConfigPanel } from "./ModelConfigPanel";
import { VoiceService, type VoiceState } from "./voice-service";

type ConnStatus = "connecting" | "connected" | "disconnected" | "error";
type SetupStatus = "checking" | "installing" | "complete" | "error";

function SetupScreen({
  steps,
  status,
  errorMessage,
}: {
  steps: string[];
  status: SetupStatus;
  errorMessage: string;
}) {
  return (
    <div className="setup-screen">
      <div className="setup-content">
        <div className="brand-icon setup-brand">
          <Zap size={28} />
        </div>
        <h2 className="setup-title">BClaw 首次配置</h2>

        <div className="setup-steps">
          {steps.map((step, i) => {
            const isLast = i === steps.length - 1;
            const isError = isLast && status === "error";
            const isActive = isLast && status === "installing";
            const isDone = !isLast || status === "complete";

            return (
              <div
                key={i}
                className={`setup-step ${isActive ? "active" : ""} ${isError ? "error" : ""}`}
              >
                <span className="step-icon">
                  {isError ? (
                    <XCircle size={16} />
                  ) : isDone ? (
                    <CheckCircle2 size={16} />
                  ) : (
                    <Loader2 size={16} className="spin" />
                  )}
                </span>
                <span className="step-label">{step}</span>
              </div>
            );
          })}
        </div>

        {status === "error" && (
          <div className="setup-error-detail">
            <p>配置失败，请检查网络连接后重启应用。</p>
            {errorMessage && <pre className="setup-error-trace">{errorMessage}</pre>}
          </div>
        )}
      </div>
    </div>
  );
}

function App() {
  const [setupStatus, setSetupStatus] = useState<SetupStatus>("checking");
  const [setupSteps, setSetupSteps] = useState<string[]>(["正在检查环境..."]);
  const [setupError, setSetupError] = useState("");

  const [connStatus, setConnStatus] = useState<ConnStatus>("disconnected");
  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
  const [messages, setMessages] = useState<
    { role: "user" | "assistant"; text: string; streaming?: boolean }[]
  >([]);
  const [inputText, setInputText] = useState("");
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [showConfig, setShowConfig] = useState(false);
  const [inputDevices, setInputDevices] = useState<string[]>([]);
  const [selectedInputDevice, setSelectedInputDevice] = useState<string>("");
  const [wakeActive, setWakeActive] = useState(false);

  const voiceRef = useRef<VoiceService | null>(null);

  // Listen for setup events from Rust
  useEffect(() => {
    const unsubs: (() => void)[] = [];

    listen<string>("setup:progress", (e) => {
      setSetupStatus("installing");
      setSetupSteps((prev) => {
        // Replace last step if it was a transient message, otherwise append
        if (prev.length === 0) return [e.payload];
        const last = prev[prev.length - 1];
        // Heuristic: if last message ends with "..." and new one doesn't,
        // treat new one as completion of last step
        if (last.endsWith("...") && !e.payload.endsWith("...")) {
          return [...prev, e.payload];
        }
        // Avoid duplicate consecutive messages
        if (last === e.payload) return prev;
        return [...prev, e.payload];
      });
    }).then((u) => unsubs.push(u));

    listen("setup:complete", () => {
      setSetupStatus("complete");
    }).then((u) => unsubs.push(u));

    listen<string>("setup:error", (e) => {
      setSetupStatus("error");
      setSetupError(e.payload);
      setSetupSteps((prev) => {
        if (prev.length === 0) return ["配置失败"];
        const last = prev[prev.length - 1];
        if (last === e.payload) return prev;
        return [...prev, e.payload];
      });
    }).then((u) => unsubs.push(u));

    return () => unsubs.forEach((u) => u());
  }, []);

  // Load available audio input devices
  useEffect(() => {
    (async () => {
      try {
        const devices = await invoke<string[]>("list_input_devices");
        setInputDevices(devices);
        const saved = await invoke<string | null>("get_input_device");
        if (saved) {
          setSelectedInputDevice(saved);
        } else if (devices.length > 0) {
          setSelectedInputDevice(devices[0]);
        }
      } catch (err) {
        console.warn("[app] failed to load input devices:", err);
      }
    })();
  }, []);

  // Initialize voice service after setup is complete
  useEffect(() => {
    if (setupStatus !== "complete") return;

    let cancelled = false;

    (async () => {
      let token: string | undefined;
      try {
        token = await invoke<string>("get_gateway_token");
        console.log("[app] gateway token acquired");
      } catch (err) {
        console.warn("[app] get_gateway_token failed:", err);
      }
      if (cancelled) return;

      const voice = new VoiceService(
        {
          onStateChange: (state) => setVoiceState(state),
          onTranscript: (role, text, final) => {
            setMessages((prev) => {
              if (role === "user") {
                const lastIdx = prev.length - 1;
                if (lastIdx >= 0 && prev[lastIdx].role === "user" && prev[lastIdx].streaming) {
                  const updated = [...prev];
                  updated[lastIdx] = { role: "user", text, streaming: !final };
                  return updated;
                }
                return [...prev, { role: "user", text, streaming: !final }];
              }
              const lastIdx = prev.length - 1;
              if (lastIdx >= 0 && prev[lastIdx].role === "assistant" && prev[lastIdx].streaming) {
                const updated = [...prev];
                updated[lastIdx] = { role: "assistant", text, streaming: !final };
                return updated;
              }
              return [...prev, { role: "assistant", text, streaming: !final }];
            });
          },
          onChatResponse: (text, final) => {
            setMessages((prev) => {
              const lastIdx = prev.length - 1;
              if (lastIdx >= 0 && prev[lastIdx].role === "assistant" && prev[lastIdx].streaming) {
                const updated = [...prev];
                updated[lastIdx] = { role: "assistant", text, streaming: !final };
                return updated;
              }
              return [...prev, { role: "assistant", text, streaming: !final }];
            });
            if (final) {
              setVoiceState("idle");
            }
          },
          onError: (msg) => {
            setErrorMsg(msg);
            setTimeout(() => setErrorMsg(""), 5000);
          },
          onConnectionChange: (connected) => {
            setConnStatus(connected ? "connected" : "disconnected");
          },
          onWakeWordActive: (active) => {
            setWakeActive(active);
          },
        },
        { token },
      );
      voiceRef.current = voice;

      setConnStatus("connecting");
      voice.connect().catch((err) => {
        console.error("Failed to connect to gateway:", err);
        setConnStatus("error");
        setErrorMsg(String(err.message || err));
      });
    })();

    return () => {
      cancelled = true;
      if (voiceRef.current) {
        voiceRef.current.disconnect();
        voiceRef.current = null;
      }
    };
  }, [setupStatus]);

  const handleMicClick = useCallback(async () => {
    const voice = voiceRef.current;
    if (!voice) return;

    if (voiceState === "idle" || voiceState === "error") {
      try {
        if (!voice.connected) {
          setConnStatus("connecting");
          await voice.connect();
        }
        await voice.startListening();
      } catch (err) {
        setErrorMsg(String(err));
        setTimeout(() => setErrorMsg(""), 5000);
      }
    } else if (voiceState === "listening") {
      await voice.stopListening();
    } else if (voiceState === "speaking") {
      await voice.cancelOutput();
    } else if (voiceState === "processing") {
      await voice.cancelTurn();
    }
  }, [voiceState]);

  const handleSend = useCallback(async () => {
    if (!inputText.trim()) return;
    const text = inputText.trim();
    setInputText("");
    setMessages((prev) => [...prev, { role: "user", text }]);

    const voice = voiceRef.current;
    if (!voice || !voice.connected) {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", text: "未连接到 Gateway，无法发送消息。" },
      ]);
      return;
    }

    setVoiceState("processing");
    try {
      await voice.sendChat(text);
    } catch (err) {
      setMessages((prev) => [...prev, { role: "assistant", text: `发送失败: ${String(err)}` }]);
      setVoiceState("idle");
    }
  }, [inputText]);

  const statusConfig: Record<ConnStatus, { label: string; color: string; icon: typeof Wifi }> = {
    connecting: { label: "连接中...", color: "status-connecting", icon: WifiOff },
    connected: { label: "已连接", color: "status-connected", icon: Wifi },
    disconnected: { label: "未连接", color: "status-disconnected", icon: WifiOff },
    error: { label: "连接错误", color: "status-error", icon: WifiOff },
  };

  const voiceConfig: Record<VoiceState, { label: string; sub: string; pulse: boolean }> = {
    idle: {
      label: wakeActive ? "语音唤醒中" : "点击说话",
      sub: wakeActive ? "说出唤醒词即可开始对话" : "或输入文字开始对话",
      pulse: wakeActive,
    },
    connecting: { label: "连接中", sub: "正在连接 Gateway", pulse: true },
    listening: { label: "聆听中", sub: "请说出您的问题", pulse: true },
    processing: { label: "思考中", sub: "正在处理您的请求", pulse: true },
    speaking: { label: "播放中", sub: "正在为您播报", pulse: true },
    error: { label: "出错了", sub: "请检查连接或重试", pulse: false },
  };

  const StatusIcon = statusConfig[connStatus].icon;
  const isBusy = voiceState !== "idle" && voiceState !== "error";
  const showWakeIndicator = voiceState === "idle" && wakeActive;

  if (setupStatus !== "complete") {
    return <SetupScreen steps={setupSteps} status={setupStatus} errorMessage={setupError} />;
  }

  if (showConfig) {
    return (
      <ModelConfigPanel
        onClose={() => {
          setShowConfig(false);
          // Reconnect voice service after config change + gateway restart
          if (voiceRef.current) {
            voiceRef.current.disconnect();
            setConnStatus("connecting");
            voiceRef.current.connect().catch((err) => {
              console.error("Reconnect failed:", err);
              setConnStatus("error");
            });
          }
        }}
      />
    );
  }

  return (
    <div className="app">
      {/* Header */}
      <header className="header">
        <div className="brand">
          <div className="brand-icon">
            <Zap size={20} />
          </div>
          <h1 className="brand-title">BClaw</h1>
        </div>
        <div className="header-actions">
          <div className={`status-pill ${statusConfig[connStatus].color}`}>
            <StatusIcon size={14} />
            <span>{statusConfig[connStatus].label}</span>
          </div>
          <button className="icon-btn" title="设置" onClick={() => setShowConfig(true)}>
            <Settings size={18} />
          </button>
          <button
            className="icon-btn power"
            title="退出"
            onClick={() => voiceRef.current?.disconnect()}
          >
            <Power size={18} />
          </button>
        </div>
      </header>

      {/* Main */}
      <main className="main">
        {/* Voice Orb */}
        <div className="voice-section">
          <button
            className={`voice-orb ${isBusy || showWakeIndicator ? "active" : ""} ${voiceState}`}
            onClick={handleMicClick}
            aria-label="语音输入"
          >
            {isBusy ? (
              <MicOff size={36} />
            ) : showWakeIndicator ? (
              <Ear size={36} />
            ) : (
              <Mic size={36} />
            )}
          </button>
          <div className="voice-labels">
            <p className="voice-primary">{voiceConfig[voiceState].label}</p>
            <p className="voice-secondary">{voiceConfig[voiceState].sub}</p>
          </div>

          {/* Audio input device selector */}
          {inputDevices.length > 0 && (
            <div className="device-selector">
              <select
                value={selectedInputDevice}
                onChange={async (e) => {
                  const name = e.target.value;
                  setSelectedInputDevice(name);
                  try {
                    await invoke("set_input_device", { device: name || null });
                  } catch (err) {
                    console.warn("[app] set_input_device failed:", err);
                  }
                }}
                title="选择音频输入设备"
              >
                {inputDevices.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Voice wave animation */}
          {isBusy && (
            <div className="voice-waves">
              {[...Array(5)].map((_, i) => (
                <span key={i} className="wave-bar" style={{ animationDelay: `${i * 0.12}s` }} />
              ))}
            </div>
          )}
        </div>

        {/* Error message */}
        {errorMsg && (
          <div className="error-banner">
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Messages */}
        <div className="chat-panel">
          <div className="chat-header">
            <MessageSquare size={16} />
            <span>对话记录</span>
          </div>
          <div className="chat-messages">
            {messages.length === 0 ? (
              <div className="chat-empty">
                <Volume2 size={32} className="empty-icon" />
                <p>还没有对话</p>
                <p className="empty-hint">点击上方麦克风或输入文字开始</p>
              </div>
            ) : (
              messages.map((m, i) => (
                <div key={i} className={`message ${m.role}`}>
                  <div className="message-avatar">
                    {m.role === "user" ? (
                      <span className="avatar-user">我</span>
                    ) : (
                      <span className="avatar-bot">AI</span>
                    )}
                  </div>
                  <div className="message-bubble">
                    <p>
                      {m.text}
                      {m.streaming && <span className="cursor">▌</span>}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Text input */}
          <div className="chat-input-bar">
            <input
              className="chat-input"
              placeholder="输入文字消息..."
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSend()}
            />
            <button className="send-btn" onClick={handleSend} disabled={!inputText.trim()}>
              发送
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}

export default App;
