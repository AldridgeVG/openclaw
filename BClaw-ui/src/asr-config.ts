export type AsrProvider = "siliconflow" | "openai-realtime" | "local-paraformer" | "none";

export type AsrConfig = {
  provider: AsrProvider;
  apiKey: string;
  baseUrl: string;
  model: string;
};

export const DEFAULT_ASR_CONFIG: AsrConfig = {
  provider: "local-paraformer",
  apiKey: "",
  baseUrl: "",
  model: "sherpa-onnx-paraformer-zh-int8-2025-10-07",
};

export const SILICONFLOW_ASR_CONFIG: AsrConfig = {
  provider: "siliconflow",
  apiKey: "",
  baseUrl: "https://api.siliconflow.cn/v1",
  model: "FunAudioLLM/SenseVoiceSmall",
};

export const OPENAI_REALTIME_ASR_CONFIG: AsrConfig = {
  provider: "openai-realtime",
  apiKey: "",
  baseUrl: "https://api.openai.com/v1",
  model: "gpt-4o-realtime-preview",
};

export const LOCAL_PARAFORMER_CONFIG: AsrConfig = {
  provider: "local-paraformer",
  apiKey: "",
  baseUrl: "",
  model: "sherpa-onnx-paraformer-zh-int8-2025-10-07",
};

const STORAGE_KEY = "bclaw-asr-config";

export function getAsrConfig(): AsrConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as AsrConfig;
      // Merge with defaults to ensure all fields exist
      return { ...DEFAULT_ASR_CONFIG, ...parsed };
    }
  } catch {
    // ignore parse errors
  }
  return { ...DEFAULT_ASR_CONFIG };
}

export function setAsrConfig(config: AsrConfig): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}
