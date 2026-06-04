import { invoke } from "@tauri-apps/api/core";

export type ProviderType = "anthropic" | "openai";

export type ModelConfig = {
  provider: ProviderType;
  apiKey: string;
  baseUrl: string;
  model: string;
  smallFastModel?: string;
  apiTimeoutMs: number;
  disableNonessentialTraffic: boolean;
};

export const DEFAULT_ANTHROPIC_CONFIG: ModelConfig = {
  provider: "anthropic",
  apiKey: "sk-kimi-xxxxxxxxxxxxxxxxxxxx",
  baseUrl: "https://api.kimi.com/coding/",
  model: "K2.6",
  smallFastModel: "kimi-k2-turbo-preview",
  apiTimeoutMs: 3000000,
  disableNonessentialTraffic: true,
};

export const DEFAULT_OPENAI_CONFIG: ModelConfig = {
  provider: "openai",
  apiKey: "",
  baseUrl: "https://api.openai.com/v1",
  model: "gpt-4o",
  apiTimeoutMs: 300000,
  disableNonessentialTraffic: false,
};

export async function getModelConfig(): Promise<ModelConfig> {
  return invoke("get_model_config");
}

export async function setModelConfig(config: ModelConfig): Promise<void> {
  return invoke("set_model_config", { config });
}

export async function restartGateway(): Promise<void> {
  return invoke("restart_gateway");
}
