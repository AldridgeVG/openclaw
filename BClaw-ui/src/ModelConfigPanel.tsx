import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { AlertCircle, Loader2, Mic, MicOff, RefreshCw, Save, Volume2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  type AsrConfig,
  type AsrProvider,
  DEFAULT_ASR_CONFIG,
  getAsrConfig,
  LOCAL_PARAFORMER_CONFIG,
  OPENAI_REALTIME_ASR_CONFIG,
  setAsrConfig as saveAsrConfig,
  SILICONFLOW_ASR_CONFIG,
} from "./asr-config";
import {
  DEFAULT_ANTHROPIC_CONFIG,
  DEFAULT_OPENAI_CONFIG,
  getModelConfig,
  type ModelConfig,
  type ProviderType,
  restartGateway,
  setModelConfig,
} from "./model-config";

type Props = {
  onClose: () => void;
};

type Tab = "model" | "audio_input" | "audio_output";

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

  // Wake word test state
  const [wakeTestRecording, setWakeTestRecording] = useState(false);
  const [wakeTestLoading, setWakeTestLoading] = useState(false);
  const [wakeTestResult, setWakeTestResult] = useState("");
  const [wakeTestError, setWakeTestError] = useState("");
  const wakeTestChunksRef = useRef<string[]>([]);
  const wakeTestRecordingRef = useRef(false);
  const wakeTestUnlistenRef = useRef<UnlistenFn | null>(null);

  // Audio device state
  const [inputDevices, setInputDevices] = useState<string[]>([]);
  const [selectedInputDevice, setSelectedInputDevice] = useState<string>("");
  const [outputDevices, setOutputDevices] = useState<string[]>([]);
  const [selectedOutputDevice, setSelectedOutputDevice] = useState<string>("");
  const [devicesLoading, setDevicesLoading] = useState(false);

  useEffect(() => {
    Promise.all([getModelConfig(), Promise.resolve(getAsrConfig())])
      .then(([c, a]) => {
        setConfig(c);
        setAsrConfig(a);
      })
      .catch((err) => setError(String(err)))
      .finally(() => setLoading(false));

    // Load audio devices
    setDevicesLoading(true);
    (async () => {
      try {
        const [inputs, savedInput, outputs, savedOutput] = await Promise.all([
          invoke<string[]>("list_input_devices"),
          invoke<string | null>("get_input_device"),
          invoke<string[]>("list_output_devices"),
          invoke<string | null>("get_output_device"),
        ]);
        setInputDevices(inputs);
        setOutputDevices(outputs);
        if (savedInput) {
          setSelectedInputDevice(savedInput);
        } else if (inputs.length > 0) {
          setSelectedInputDevice(inputs[0]);
        }
        if (savedOutput) {
          setSelectedOutputDevice(savedOutput);
        } else if (outputs.length > 0) {
          setSelectedOutputDevice(outputs[0]);
        }
      } catch (err) {
        console.warn("[config] failed to load devices:", err);
      } finally {
        setDevicesLoading(false);
      }
    })();
  }, []);

  // Cleanup test capture on unmount / close
  useEffect(() => {
    return () => {
      stopTestCapture();
      stopWakeTestCapture();
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
        return { ...SILICONFLOW_ASR_CONFIG, apiKey: prev.apiKey, wakeWord: prev.wakeWord };
      }
      if (provider === "openai-realtime") {
        return { ...OPENAI_REALTIME_ASR_CONFIG, apiKey: prev.apiKey, wakeWord: prev.wakeWord };
      }
      if (provider === "local-paraformer") {
        return { ...LOCAL_PARAFORMER_CONFIG, wakeWord: prev.wakeWord };
      }
      return {
        provider: "none",
        apiKey: prev.apiKey,
        baseUrl: "",
        model: "",
        wakeWord: prev.wakeWord,
      };
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

  const stopWakeTestCapture = async () => {
    wakeTestRecordingRef.current = false;
    if (wakeTestUnlistenRef.current) {
      wakeTestUnlistenRef.current();
      wakeTestUnlistenRef.current = null;
    }
    try {
      await invoke("stop_capture");
    } catch (e) {
      console.warn("[wake-test] stop_capture error:", e);
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

  const toggleWakeWordTest = async () => {
    if (wakeTestRecording) {
      // Stop
      setWakeTestRecording(false);
      setWakeTestLoading(true);
      setWakeTestError("");
      setWakeTestResult("");
      await stopWakeTestCapture();

      const chunks = wakeTestChunksRef.current;
      wakeTestChunksRef.current = [];
      if (chunks.length === 0) {
        setWakeTestLoading(false);
        setWakeTestError("没有采集到音频，请检查麦克风权限。");
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
        const detected = transcript.trim().includes(asrConfig.wakeWord.wakeWord);
        setWakeTestResult(
          detected
            ? `检测到唤醒词「${asrConfig.wakeWord.wakeWord}」！识别内容：${transcript.trim()}`
            : `未检测到唤醒词。识别内容：${transcript.trim()}`,
        );
      } catch (err) {
        console.error("[wake-test] transcribe failed:", err);
        setWakeTestError(`识别失败: ${String(err)}`);
      } finally {
        setWakeTestLoading(false);
      }
      return;
    }

    // Start
    if (asrConfig.provider !== "local-paraformer") {
      setWakeTestError("当前测试仅支持本地 Paraformer；请先在上方选择本地 Paraformer。");
      return;
    }

    setWakeTestRecording(true);
    setWakeTestLoading(false);
    setWakeTestResult("");
    setWakeTestError("");
    wakeTestChunksRef.current = [];
    wakeTestRecordingRef.current = true;

    try {
      const unlisten = await listen<{ audio_base64: string; timestamp_ms: number }>(
        "audio:capture",
        (event) => {
          if (!wakeTestRecordingRef.current) return;
          wakeTestChunksRef.current.push(event.payload.audio_base64);
        },
      );
      wakeTestUnlistenRef.current = unlisten;
      await invoke("start_capture", { sampleRate: 16000 });
    } catch (err) {
      console.error("[wake-test] start failed:", err);
      setWakeTestError(`启动录音失败: ${String(err)}`);
      setWakeTestRecording(false);
      wakeTestRecordingRef.current = false;
      if (wakeTestUnlistenRef.current) {
        wakeTestUnlistenRef.current();
        wakeTestUnlistenRef.current = null;
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
              className={`config-sidebar-tab ${activeTab === "audio_input" ? "active" : ""}`}
              onClick={() => setActiveTab("audio_input")}
            >
              音频输入
            </button>
            <button
              className={`config-sidebar-tab ${activeTab === "audio_output" ? "active" : ""}`}
              onClick={() => setActiveTab("audio_output")}
            >
              音频输出
            </button>
          </nav>
        </aside>

        <div className="config-content">
          <div className="config-header">
            <h3>
              {activeTab === "model"
                ? "模型端点配置"
                : activeTab === "audio_input"
                  ? "音频输入配置"
                  : "音频输出配置"}
            </h3>
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
            {activeTab === "model" && (
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
            )}

            {activeTab === "audio_input" && (
              <>
                {/* Input device selector */}
                <div className="config-section">
                  <h4 className="config-section-title">音频输入设备</h4>
                  <div className="config-field">
                    {devicesLoading ? (
                      <div className="config-loading-inline">
                        <Loader2 size={16} className="spin" />
                        <span>正在读取设备...</span>
                      </div>
                    ) : inputDevices.length > 0 ? (
                      <select
                        className="config-select"
                        value={selectedInputDevice}
                        onChange={async (e) => {
                          const name = e.target.value;
                          setSelectedInputDevice(name);
                          try {
                            await invoke("set_input_device", { device: name || null });
                            setSuccess("输入设备已切换");
                            setTimeout(() => setSuccess(""), 2000);
                          } catch (err) {
                            setError(`切换设备失败: ${String(err)}`);
                          }
                        }}
                      >
                        {inputDevices.map((d) => (
                          <option key={d} value={d}>
                            {d}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <p className="config-test-note">未检测到音频输入设备</p>
                    )}
                  </div>
                </div>

                <div className="config-divider" />

                <div className="config-field">
                  <label>ASR 提供商</label>
                  <div className="config-segmented config-segmented-4">
                    <button
                      className={asrConfig.provider === "local-paraformer" ? "active" : ""}
                      onClick={() => handleAsrProviderChange("local-paraformer")}
                    >
                      本地 Paraformer
                    </button>
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

                <div className="config-section">
                  <h4 className="config-section-title">语音唤醒</h4>

                  <div className="config-field config-checkbox">
                    <label>
                      <input
                        type="checkbox"
                        checked={asrConfig.wakeWord.enabled}
                        onChange={(e) =>
                          setAsrConfig((prev) => ({
                            ...prev,
                            wakeWord: { ...prev.wakeWord, enabled: e.target.checked },
                          }))
                        }
                      />
                      启用语音唤醒
                    </label>
                  </div>

                  <div className="config-field">
                    <label>唤醒词</label>
                    <input
                      type="text"
                      value={asrConfig.wakeWord.wakeWord}
                      onChange={(e) =>
                        setAsrConfig((prev) => ({
                          ...prev,
                          wakeWord: { ...prev.wakeWord, wakeWord: e.target.value },
                        }))
                      }
                      placeholder="例如：你好小爪"
                    />
                  </div>

                  <div className="config-field">
                    <label>唤醒灵敏度 ({asrConfig.wakeWord.sensitivity.toFixed(1)})</label>
                    <input
                      type="range"
                      min={0.1}
                      max={1.0}
                      step={0.1}
                      value={asrConfig.wakeWord.sensitivity}
                      onChange={(e) =>
                        setAsrConfig((prev) => ({
                          ...prev,
                          wakeWord: { ...prev.wakeWord, sensitivity: Number(e.target.value) },
                        }))
                      }
                    />
                  </div>
                </div>

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

                <div className="config-divider" />

                <div className="config-test-section">
                  <h4 className="config-section-title">语音唤醒测试</h4>
                  <p className="config-test-hint">
                    点击按钮开始录音（约 3 秒），说出唤醒词后查看检测结果。
                  </p>

                  <button
                    className={`voice-test-btn ${wakeTestRecording ? "recording" : ""}`}
                    onClick={toggleWakeWordTest}
                    disabled={wakeTestLoading || asrConfig.provider !== "local-paraformer"}
                    title={
                      asrConfig.provider !== "local-paraformer"
                        ? "请选择本地 Paraformer 以启用测试"
                        : wakeTestRecording
                          ? "结束录音"
                          : "开始录音"
                    }
                  >
                    {wakeTestLoading ? (
                      <>
                        <Loader2 size={18} className="spin" />
                        识别中...
                      </>
                    ) : wakeTestRecording ? (
                      <>
                        <MicOff size={18} />
                        结束录音
                      </>
                    ) : (
                      <>
                        <Mic size={18} />
                        测试语音唤醒
                      </>
                    )}
                  </button>

                  {asrConfig.provider !== "local-paraformer" && (
                    <p className="config-test-note">
                      当前测试仅支持本地 Paraformer；请先在上方选择本地 Paraformer。
                    </p>
                  )}

                  {wakeTestError && (
                    <div className="config-alert config-alert-error" style={{ margin: "12px 0 0" }}>
                      <AlertCircle size={16} />
                      <span>{wakeTestError}</span>
                    </div>
                  )}

                  {wakeTestResult && (
                    <div className="config-test-result">
                      <strong>检测结果：</strong>
                      <p>{wakeTestResult}</p>
                    </div>
                  )}
                </div>
              </>
            )}

            {activeTab === "audio_output" && (
              <>
                <div className="config-section">
                  <h4 className="config-section-title">音频输出设备</h4>
                  <div className="config-field">
                    {devicesLoading ? (
                      <div className="config-loading-inline">
                        <Loader2 size={16} className="spin" />
                        <span>正在读取设备...</span>
                      </div>
                    ) : outputDevices.length > 0 ? (
                      <select
                        className="config-select"
                        value={selectedOutputDevice}
                        onChange={async (e) => {
                          const name = e.target.value;
                          setSelectedOutputDevice(name);
                          try {
                            await invoke("set_output_device", { device: name || null });
                            setSuccess("输出设备已切换");
                            setTimeout(() => setSuccess(""), 2000);
                          } catch (err) {
                            setError(`切换设备失败: ${String(err)}`);
                          }
                        }}
                      >
                        {outputDevices.map((d) => (
                          <option key={d} value={d}>
                            {d}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <p className="config-test-note">未检测到音频输出设备</p>
                    )}
                  </div>
                </div>

                <div className="config-divider" />

                <div className="config-test-section">
                  <h4 className="config-section-title">输出测试</h4>
                  <p className="config-test-hint">点击按钮播放测试音，确认当前输出设备是否正常。</p>
                  <button
                    className="voice-test-btn"
                    onClick={async () => {
                      try {
                        await invoke("play_audio", { audioBase64: await generateTestTone() });
                      } catch (err) {
                        setError(`播放测试音失败: ${String(err)}`);
                      }
                    }}
                  >
                    <Volume2 size={18} />
                    播放测试音
                  </button>
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

/// Generate a short test tone (PCM16 mono 24kHz) as base64 string.
async function generateTestTone(): Promise<string> {
  const sampleRate = 24000;
  const duration = 0.5;
  const freq = 880;
  const sampleCount = Math.floor(sampleRate * duration);
  const bytes = new Uint8Array(sampleCount * 2);
  const view = new DataView(bytes.buffer);
  for (let i = 0; i < sampleCount; i++) {
    const t = i / sampleRate;
    const envelope =
      Math.min(1, i / (sampleRate * 0.05)) * Math.min(1, (sampleCount - i) / (sampleRate * 0.05));
    const sample = Math.sin(2 * Math.PI * freq * t) * envelope * 0.5;
    const pcm16 = Math.max(-32768, Math.min(32767, Math.round(sample * 32767)));
    view.setInt16(i * 2, pcm16, true);
  }
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}
