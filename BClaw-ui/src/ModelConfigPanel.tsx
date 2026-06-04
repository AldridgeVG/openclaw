import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { X, Save, RefreshCw, AlertCircle, Mic, MicOff, Loader2 } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import {
  getAsrConfig,
  setAsrConfig as saveAsrConfig,
  type AsrConfig,
  type AsrProvider,
  DEFAULT_ASR_CONFIG,
  SILICONFLOW_ASR_CONFIG,
  OPENAI_REALTIME_ASR_CONFIG,
  LOCAL_PARAFORMER_CONFIG,
} from "./asr-config";
import {
  getModelConfig,
  setModelConfig,
  restartGateway,
  type ModelConfig,
  type ProviderType,
  DEFAULT_ANTHROPIC_CONFIG,
  DEFAULT_OPENAI_CONFIG,
} from "./model-config";

type Props = {
  onClose: () => void;
};

type Tab = "model" | "asr";

export function ModelConfigPanel({ onClose }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>("model");
  const [config, setConfig] = useState<ModelConfig>(DEFAULT_ANTHROPIC_CONFIG);
  const [asrConfig, setAsrConfig] = useState<AsrConfig>(DEFAULT_ASR_CONFIG);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [restarting, setRestarting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // ASR voice test state
  const [testRecording, setTestRecording] = useState(false);
  const [testLoading, setTestLoading] = useState(false);
  const [testResult, setTestResult] = useState("");
  const [testError, setTestError] = useState("");
  const testChunksRef = useRef<string[]>([]);
  const testRecordingRef = useRef(false);
  const testUnlistenRef = useRef<UnlistenFn | null>(null);

  useEffect(() => {
    Promise.all([getModelConfig(), Promise.resolve(getAsrConfig())])
      .then(([c, a]) => {
        setConfig(c);
        setAsrConfig(a);
      })
      .catch((err) => setError(String(err)))
      .finally(() => setLoading(false));
  }, []);

  // Cleanup test capture on unmount / close
  useEffect(() => {
    return () => {
      stopTestCapture();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleProviderChange = (provider: ProviderType) => {
    setConfig((prev) => ({
      ...(provider === "anthropic" ? DEFAULT_ANTHROPIC_CONFIG : DEFAULT_OPENAI_CONFIG),
      provider,
      apiKey: prev.apiKey,
    }));
  };

  const handleAsrProviderChange = (provider: AsrProvider) => {
    setAsrConfig((prev) => {
      if (provider === "siliconflow") {
        return { ...SILICONFLOW_ASR_CONFIG, apiKey: prev.apiKey };
      }
      if (provider === "openai-realtime") {
        return { ...OPENAI_REALTIME_ASR_CONFIG, apiKey: prev.apiKey };
      }
      if (provider === "local-paraformer") {
        return { ...LOCAL_PARAFORMER_CONFIG };
      }
      return { provider: "none", apiKey: prev.apiKey, baseUrl: "", model: "" };
    });
    // Reset test state when provider changes
    setTestResult("");
    setTestError("");
  };

  const handleSave = async () => {
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      await setModelConfig(config);
      saveAsrConfig(asrConfig);
      setSuccess("配置已保存");
    } catch (err) {
      setError(`保存失败: ${String(err)}`);
    } finally {
      setSaving(false);
    }
  };

  const handleRestart = async () => {
    setRestarting(true);
    setError("");
    setSuccess("");
    try {
      await setModelConfig(config);
      saveAsrConfig(asrConfig);
      await restartGateway();
      setSuccess("配置已保存并重启 Gateway");
    } catch (err) {
      setError(`重启失败: ${String(err)}`);
    } finally {
      setRestarting(false);
    }
  };

  const stopTestCapture = async () => {
    testRecordingRef.current = false;
    if (testUnlistenRef.current) {
      testUnlistenRef.current();
      testUnlistenRef.current = null;
    }
    try {
      await invoke("stop_capture");
    } catch (e) {
      console.warn("[asr-test] stop_capture error:", e);
    }
  };

  const toggleVoiceTest = async () => {
    if (testRecording) {
      // Stop
      setTestRecording(false);
      setTestLoading(true);
      setTestError("");
      setTestResult("");
      await stopTestCapture();

      const chunks = testChunksRef.current;
      testChunksRef.current = [];
      if (chunks.length === 0) {
        setTestLoading(false);
        setTestError("没有采集到音频，请检查麦克风权限。");
        return;
      }

      try {
        const allBytes = mergeBase64Chunks(chunks);
        const samples = new Int16Array(allBytes.buffer);
        const sampleRate = 16000;
        const transcript = await invoke<string>("transcribe_audio", {
          samples: Array.from(samples),
          sampleRate,
        });
        setTestResult(transcript.trim());
      } catch (err) {
        console.error("[asr-test] transcribe failed:", err);
        setTestError(`识别失败: ${String(err)}`);
      } finally {
        setTestLoading(false);
      }
      return;
    }

    // Start
    if (asrConfig.provider !== "local-paraformer") {
      setTestError("当前测试仅支持本地 Paraformer；请先在上方选择本地 Paraformer。");
      return;
    }

    setTestRecording(true);
    setTestLoading(false);
    setTestResult("");
    setTestError("");
    testChunksRef.current = [];
    testRecordingRef.current = true;

    try {
      const unlisten = await listen<{ audio_base64: string; timestamp_ms: number }>(
        "audio:capture",
        (event) => {
          if (!testRecordingRef.current) return;
          testChunksRef.current.push(event.payload.audio_base64);
        },
      );
      testUnlistenRef.current = unlisten;
      await invoke("start_capture", { sampleRate: 16000 });
    } catch (err) {
      console.error("[asr-test] start failed:", err);
      setTestError(`启动录音失败: ${String(err)}`);
      setTestRecording(false);
      testRecordingRef.current = false;
      if (testUnlistenRef.current) {
        testUnlistenRef.current();
        testUnlistenRef.current = null;
      }
    }
  };

  if (loading) {
    return (
      <div className="config-panel-overlay">
        <div className="config-panel">
          <div className="config-loading">加载中...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="config-panel-overlay" onClick={onClose}>
      <div className="config-panel config-panel-layout" onClick={(e) => e.stopPropagation()}>
        <aside className="config-sidebar">
          <h4 className="config-sidebar-title">设置</h4>
          <nav className="config-sidebar-tabs">
            <button
              className={`config-sidebar-tab ${activeTab === "model" ? "active" : ""}`}
              onClick={() => setActiveTab("model")}
            >
              模型配置
            </button>
            <button
              className={`config-sidebar-tab ${activeTab === "asr" ? "active" : ""}`}
              onClick={() => setActiveTab("asr")}
            >
              语音识别配置
            </button>
          </nav>
        </aside>

        <div className="config-content">
          <div className="config-header">
            <h3>{activeTab === "model" ? "模型端点配置" : "语音识别配置"}</h3>
            <button className="icon-btn" onClick={onClose} title="关闭">
              <X size={18} />
            </button>
          </div>

          {error && (
            <div className="config-alert config-alert-error">
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          )}
          {success && (
            <div className="config-alert config-alert-success">
              <span>{success}</span>
            </div>
          )}

          <div className="config-form">
            {activeTab === "model" ? (
              <>
                <div className="config-field">
                  <label>接口风格</label>
                  <div className="config-segmented">
                    <button
                      className={config.provider === "anthropic" ? "active" : ""}
                      onClick={() => handleProviderChange("anthropic")}
                    >
                      Anthropic
                    </button>
                    <button
                      className={config.provider === "openai" ? "active" : ""}
                      onClick={() => handleProviderChange("openai")}
                    >
                      OpenAI
                    </button>
                  </div>
                </div>

                <div className="config-field">
                  <label>API Key</label>
                  <input
                    type="password"
                    value={config.apiKey}
                    onChange={(e) => setConfig({ ...config, apiKey: e.target.value })}
                    placeholder={config.provider === "anthropic" ? "sk-ant-api03-..." : "sk-..."}
                  />
                </div>

                <div className="config-field">
                  <label>Base URL</label>
                  <input
                    type="text"
                    value={config.baseUrl}
                    onChange={(e) => setConfig({ ...config, baseUrl: e.target.value })}
                    placeholder="https://api.xxx.com/v1/"
                  />
                </div>

                <div className="config-field">
                  <label>主模型</label>
                  <input
                    type="text"
                    value={config.model}
                    onChange={(e) => setConfig({ ...config, model: e.target.value })}
                    placeholder={config.provider === "anthropic" ? "claude-3-5-sonnet" : "gpt-4o"}
                  />
                </div>

                {config.provider === "anthropic" && (
                  <div className="config-field">
                    <label>轻量模型（快速任务）</label>
                    <input
                      type="text"
                      value={config.smallFastModel || ""}
                      onChange={(e) => setConfig({ ...config, smallFastModel: e.target.value })}
                      placeholder="claude-3-haiku"
                    />
                  </div>
                )}

                <div className="config-field">
                  <label>API 超时（毫秒）</label>
                  <input
                    type="number"
                    value={config.apiTimeoutMs}
                    onChange={(e) => setConfig({ ...config, apiTimeoutMs: Number(e.target.value) })}
                  />
                </div>

                <div className="config-field config-checkbox">
                  <label>
                    <input
                      type="checkbox"
                      checked={config.disableNonessentialTraffic}
                      onChange={(e) =>
                        setConfig({
                          ...config,
                          disableNonessentialTraffic: e.target.checked,
                        })
                      }
                    />
                    禁用非必要流量（减少后台请求）
                  </label>
                </div>
              </>
            ) : (
              <>
                <div className="config-field">
                  <label>ASR 提供商</label>
                  <div className="config-segmented config-segmented-4">
                    <button
                      className={asrConfig.provider === "siliconflow" ? "active" : ""}
                      onClick={() => handleAsrProviderChange("siliconflow")}
                    >
                      SiliconFlow
                    </button>
                    <button
                      className={asrConfig.provider === "openai-realtime" ? "active" : ""}
                      onClick={() => handleAsrProviderChange("openai-realtime")}
                    >
                      OpenAI Realtime
                    </button>
                    <button
                      className={asrConfig.provider === "local-paraformer" ? "active" : ""}
                      onClick={() => handleAsrProviderChange("local-paraformer")}
                    >
                      本地 Paraformer
                    </button>
                    <button
                      className={asrConfig.provider === "none" ? "active" : ""}
                      onClick={() => handleAsrProviderChange("none")}
                    >
                      关闭
                    </button>
                  </div>
                </div>

                {(asrConfig.provider === "siliconflow" ||
                  asrConfig.provider === "openai-realtime") && (
                  <>
                    <div className="config-field">
                      <label>ASR API Key</label>
                      <input
                        type="password"
                        value={asrConfig.apiKey}
                        onChange={(e) => setAsrConfig({ ...asrConfig, apiKey: e.target.value })}
                        placeholder="sk-..."
                      />
                    </div>

                    <div className="config-field">
                      <label>ASR Base URL</label>
                      <input
                        type="text"
                        value={asrConfig.baseUrl}
                        onChange={(e) => setAsrConfig({ ...asrConfig, baseUrl: e.target.value })}
                        placeholder="https://api.siliconflow.cn/v1"
                      />
                    </div>

                    <div className="config-field">
                      <label>ASR 模型</label>
                      <input
                        type="text"
                        value={asrConfig.model}
                        onChange={(e) => setAsrConfig({ ...asrConfig, model: e.target.value })}
                        placeholder="FunAudioLLM/SenseVoiceSmall"
                      />
                    </div>
                  </>
                )}

                <div className="config-divider" />

                <div className="config-test-section">
                  <h4 className="config-section-title">语音输入测试</h4>
                  <p className="config-test-hint">
                    点击按钮开始录音，再次点击结束并查看本地识别结果。
                  </p>

                  <button
                    className={`voice-test-btn ${testRecording ? "recording" : ""}`}
                    onClick={toggleVoiceTest}
                    disabled={testLoading || asrConfig.provider !== "local-paraformer"}
                    title={
                      asrConfig.provider !== "local-paraformer"
                        ? "请选择本地 Paraformer 以启用测试"
                        : testRecording
                          ? "结束录音"
                          : "开始录音"
                    }
                  >
                    {testLoading ? (
                      <>
                        <Loader2 size={18} className="spin" />
                        识别中...
                      </>
                    ) : testRecording ? (
                      <>
                        <MicOff size={18} />
                        结束录音
                      </>
                    ) : (
                      <>
                        <Mic size={18} />
                        语音输入测试
                      </>
                    )}
                  </button>

                  {asrConfig.provider !== "local-paraformer" && (
                    <p className="config-test-note">
                      当前测试仅支持本地 Paraformer；请先在上方选择本地 Paraformer。
                    </p>
                  )}

                  {testError && (
                    <div className="config-alert config-alert-error" style={{ margin: "12px 0 0" }}>
                      <AlertCircle size={16} />
                      <span>{testError}</span>
                    </div>
                  )}

                  {testResult && (
                    <div className="config-test-result">
                      <strong>识别结果：</strong>
                      <p>{testResult}</p>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>

          <div className="config-actions">
            <button
              className="config-btn config-btn-secondary"
              onClick={handleSave}
              disabled={saving}
            >
              <Save size={16} />
              {saving ? "保存中..." : "保存配置"}
            </button>
            <button
              className="config-btn config-btn-primary"
              onClick={handleRestart}
              disabled={restarting}
            >
              <RefreshCw size={16} className={restarting ? "spin" : ""} />
              {restarting ? "重启中..." : "保存并重启 Gateway"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// --- Helpers ---

function mergeBase64Chunks(chunks: string[]): Uint8Array {
  const arrays = chunks.map((c) => Uint8Array.from(atob(c), (ch) => ch.charCodeAt(0)));
  const totalLen = arrays.reduce((sum, a) => sum + a.length, 0);
  const merged = new Uint8Array(totalLen);
  let offset = 0;
  for (const a of arrays) {
    merged.set(a, offset);
    offset += a.length;
  }
  return merged;
}
