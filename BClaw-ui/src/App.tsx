import { useState, useEffect, useCallback } from "react";
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
} from "lucide-react";

type ConnStatus = "connecting" | "connected" | "disconnected" | "error";
type VoiceState = "idle" | "listening" | "processing" | "speaking";

function App() {
  const [connStatus, setConnStatus] = useState<ConnStatus>("disconnected");
  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
  const [messages, setMessages] = useState<
    { role: "user" | "assistant"; text: string }[]
  >([]);
  const [inputText, setInputText] = useState("");

  // Demo: simulate connection
  useEffect(() => {
    const t = setTimeout(() => setConnStatus("connected"), 1200);
    return () => clearTimeout(t);
  }, []);

  const handleMicClick = useCallback(() => {
    if (voiceState === "idle") {
      setVoiceState("listening");
      setMessages((prev) => [...prev, { role: "user", text: "（正在聆听...）" }]);
      // Simulate voice input
      setTimeout(() => {
        setMessages((prev) =>
          prev.map((m, i) =>
            i === prev.length - 1 ? { role: "user", text: "今天天气怎么样？" } : m
          )
        );
        setVoiceState("processing");
        setTimeout(() => {
          setVoiceState("speaking");
          setMessages((prev) => [
            ...prev,
            {
              role: "assistant",
              text: "今天北京晴，气温 22-30°C，空气质量优，适合户外活动。",
            },
          ]);
          setTimeout(() => setVoiceState("idle"), 3000);
        }, 1500);
      }, 2000);
    } else {
      setVoiceState("idle");
    }
  }, [voiceState]);

  const handleSend = useCallback(() => {
    if (!inputText.trim()) return;
    setMessages((prev) => [...prev, { role: "user", text: inputText }]);
    setInputText("");
    setVoiceState("processing");
    setTimeout(() => {
      setVoiceState("idle");
      setMessages((prev) => [
        ...prev,
        { role: "assistant", text: "收到，我正在处理您的请求。" },
      ]);
    }, 1200);
  }, [inputText]);

  const statusConfig: Record<ConnStatus, { label: string; color: string; icon: typeof Wifi }> = {
    connecting: { label: "连接中...", color: "status-connecting", icon: WifiOff },
    connected: { label: "已连接", color: "status-connected", icon: Wifi },
    disconnected: { label: "未连接", color: "status-disconnected", icon: WifiOff },
    error: { label: "连接错误", color: "status-error", icon: WifiOff },
  };

  const voiceConfig: Record<VoiceState, { label: string; sub: string; pulse: boolean }> = {
    idle: { label: "点击说话", sub: "或输入文字开始对话", pulse: false },
    listening: { label: "聆听中", sub: "请说出您的问题", pulse: true },
    processing: { label: "思考中", sub: "正在处理您的请求", pulse: true },
    speaking: { label: "播放中", sub: "正在为您播报", pulse: true },
  };

  const StatusIcon = statusConfig[connStatus].icon;
  const isBusy = voiceState !== "idle";

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
          <button className="icon-btn" title="设置">
            <Settings size={18} />
          </button>
          <button className="icon-btn power" title="退出">
            <Power size={18} />
          </button>
        </div>
      </header>

      {/* Main */}
      <main className="main">
        {/* Voice Orb */}
        <div className="voice-section">
          <button
            className={`voice-orb ${isBusy ? "active" : ""} ${voiceState}`}
            onClick={handleMicClick}
            aria-label="语音输入"
          >
            {isBusy ? <MicOff size={36} /> : <Mic size={36} />}
          </button>
          <div className="voice-labels">
            <p className="voice-primary">{voiceConfig[voiceState].label}</p>
            <p className="voice-secondary">{voiceConfig[voiceState].sub}</p>
          </div>

          {/* Voice wave animation */}
          {isBusy && (
            <div className="voice-waves">
              {[...Array(5)].map((_, i) => (
                <span key={i} className="wave-bar" style={{ animationDelay: `${i * 0.12}s` }} />
              ))}
            </div>
          )}
        </div>

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
                    <p>{m.text}</p>
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
