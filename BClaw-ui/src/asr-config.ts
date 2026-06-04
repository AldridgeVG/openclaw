export type AsrProvider = "siliconflow" | "openai-realtime" | "local-paraformer" | "none";

export type WakeWordConfig = {
  enabled: boolean;
  wakeWord: string;
  sensitivity: number;
};

export type AsrConfig = {
  provider: AsrProvider;
  apiKey: string;
  baseUrl: string;
  model: string;
  wakeWord: WakeWordConfig;
};

export const DEFAULT_WAKE_WORD_CONFIG: WakeWordConfig = {
  enabled: false,
  wakeWord: "你好小爪",
  sensitivity: 0.7,
};

export const DEFAULT_ASR_CONFIG: AsrConfig = {
  provider: "local-paraformer",
  apiKey: "",
  baseUrl: "",
  model: "sherpa-onnx-paraformer-zh-int8-2025-10-07",
  wakeWord: { ...DEFAULT_WAKE_WORD_CONFIG },
};

export const SILICONFLOW_ASR_CONFIG: AsrConfig = {
  provider: "siliconflow",
  apiKey: "",
  baseUrl: "https://api.siliconflow.cn/v1",
  model: "FunAudioLLM/SenseVoiceSmall",
  wakeWord: { ...DEFAULT_WAKE_WORD_CONFIG },
};

export const OPENAI_REALTIME_ASR_CONFIG: AsrConfig = {
  provider: "openai-realtime",
  apiKey: "",
  baseUrl: "https://api.openai.com/v1",
  model: "gpt-4o-realtime-preview",
  wakeWord: { ...DEFAULT_WAKE_WORD_CONFIG },
};

export const LOCAL_PARAFORMER_CONFIG: AsrConfig = {
  provider: "local-paraformer",
  apiKey: "",
  baseUrl: "",
  model: "sherpa-onnx-paraformer-zh-int8-2025-10-07",
  wakeWord: { ...DEFAULT_WAKE_WORD_CONFIG },
};

const STORAGE_KEY = "bclaw-asr-config";

export function getAsrConfig(): AsrConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as AsrConfig;
      // Merge with defaults to ensure all fields exist
      return {
        ...DEFAULT_ASR_CONFIG,
        ...parsed,
        wakeWord: { ...DEFAULT_WAKE_WORD_CONFIG, ...(parsed.wakeWord || {}) },
      };
    }
  } catch {
    // ignore parse errors
  }
  return { ...DEFAULT_ASR_CONFIG };
}

export function setAsrConfig(config: AsrConfig): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}
