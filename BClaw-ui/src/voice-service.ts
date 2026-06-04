import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getAsrConfig } from "./asr-config";
import { GatewayClient, type GatewayEventFrame } from "./gateway-client";

export type VoiceState = "idle" | "connecting" | "listening" | "processing" | "speaking" | "error";

export type VoiceCallbacks = {
  onStateChange?: (state: VoiceState) => void;
  onTranscript?: (role: "user" | "assistant", text: string, final: boolean) => void;
  onChatResponse?: (text: string, final: boolean) => void;
  onError?: (message: string) => void;
  onConnectionChange?: (connected: boolean) => void;
  onWakeWordActive?: (active: boolean) => void;
};

export type TalkSessionConfig = {
  gatewayUrl?: string;
  token?: string;
  password?: string;
  sessionKey?: string;
  voice?: string;
  model?: string;
};

type RelayEvent = {
  relaySessionId?: string;
  type?: string;
  audioBase64?: string;
  role?: "user" | "assistant";
  text?: string;
  final?: boolean;
  message?: string;
  reason?: string;
};

const DEFAULT_GATEWAY_URL = "ws://localhost:18789/ws";

export class VoiceService {
  private client: GatewayClient | null = null;
  private relaySessionId: string | null = null;
  private state: VoiceState = "idle";
  private unsubEvent: (() => void) | null = null;
  private unsubAudio: (() => void) | null = null;
  private config: TalkSessionConfig;
  private _isListening = false;
  private chatBuffer = "";
  private audioChunks: string[] = [];
  private asrAbortController: AbortController | null = null;

  // Wake word state
  private wakeListening = false;
  private wakeChunks: string[] = [];
  private wakeUnsub: (() => void) | null = null;
  private wakeTimer: ReturnType<typeof setInterval> | null = null;
  private wakeCooldown = false;

  constructor(
    private callbacks: VoiceCallbacks = {},
    config: TalkSessionConfig = {},
  ) {
    this.config = config;
  }

  get connected(): boolean {
    return this.client?.connected ?? false;
  }

  get currentState(): VoiceState {
    return this.state;
  }

  async connect(): Promise<void> {
    if (this.client?.connected) {
      console.log("[voice] connect skipped: already connected");
      return;
    }

    this.setState("connecting");
    const url = this.config.gatewayUrl || DEFAULT_GATEWAY_URL;
    console.log("[voice] connecting to", url);

    return new Promise((resolve, reject) => {
      let resolved = false;

      this.client = new GatewayClient(url, {
        token: this.config.token,
        password: this.config.password,
        onHello: (hello) => {
          console.log("[voice] gateway hello ok, connId=", hello.server?.connId);
          if (!resolved) {
            resolved = true;
            this.callbacks.onConnectionChange?.(true);
            this.setState("idle");
            resolve();
          }
        },
        onClose: (info) => {
          console.log("[voice] gateway closed:", info.code, info.reason);
          this.callbacks.onConnectionChange?.(false);
          if (!resolved) {
            resolved = true;
            reject(new Error(`Connection closed: ${info.reason}`));
          } else if (this.state !== "idle") {
            this.setState("idle");
          }
          this.cleanupSession();
        },
      });

      // Listen for gateway events
      this.unsubEvent = this.client.addEventListener((evt) => this.handleGatewayEvent(evt));

      this.client.connect();

      // Fallback timeout
      setTimeout(() => {
        if (!resolved) {
          console.warn("[voice] connection timeout after 10s");
          resolved = true;
          this.client?.disconnect();
          reject(new Error("Gateway connection timeout"));
        }
      }, 10000);
    });
  }

  disconnect(): void {
    this.asrAbortController?.abort();
    this.stopListening();
    this.stopWakeWordListening();
    this.unsubEvent?.();
    this.unsubEvent = null;
    this.client?.disconnect();
    this.client = null;
    this.callbacks.onConnectionChange?.(false);
    this.setState("idle");
  }

  async startWakeWordListening(): Promise<void> {
    if (this.wakeListening) return;
    if (this.state !== "idle") return;

    const asrConfig = getAsrConfig();
    if (!asrConfig.wakeWord.enabled || asrConfig.provider !== "local-paraformer") return;

    this.wakeListening = true;
    this.wakeChunks = [];
    this.wakeCooldown = false;
    this.callbacks.onWakeWordActive?.(true);
    console.log("[voice] startWakeWordListening, word=", asrConfig.wakeWord.wakeWord);

    try {
      await invoke("start_wake_capture", { sampleRate: 16000 });
    } catch (err) {
      console.warn("[voice] start_wake_capture failed:", err);
      this.wakeListening = false;
      return;
    }

    this.wakeUnsub = await listen<{ audio_base64: string; timestamp_ms: number }>(
      "audio:wake",
      (event) => {
        if (!this.wakeListening || this.wakeCooldown) return;
        this.wakeChunks.push(event.payload.audio_base64);
      },
    );

    // Periodic ASR check every 2.5 seconds
    this.wakeTimer = setInterval(async () => {
      if (!this.wakeListening || this.wakeCooldown || this.wakeChunks.length === 0) return;
      if (this.state !== "idle") return;

      const chunksToProcess = [...this.wakeChunks];
      this.wakeChunks = [];

      try {
        const allBytes = mergeBase64Chunks(chunksToProcess);
        const samples = new Int16Array(allBytes.buffer);
        const transcript = await invoke<string>("transcribe_audio", {
          samples: Array.from(samples),
          sampleRate: 16000,
        });
        console.log("[voice] wake ASR transcript:", transcript);

        if (transcript.includes(asrConfig.wakeWord.wakeWord)) {
          console.log("[voice] wake word detected!");
          this.wakeCooldown = true;
          // Play a short confirmation tone
          await playWakeTone().catch((e) => console.warn("[voice] play tone failed:", e));
          // Greeting confirmation before entering listening
          this.callbacks.onTranscript?.("assistant", "在", true);
          await this.stopWakeWordListening();
          await this.startListening();
          return;
        }
      } catch (err) {
        console.warn("[voice] wake ASR failed:", err);
      }
    }, 2500);
  }

  async stopWakeWordListening(): Promise<void> {
    if (!this.wakeListening) return;
    console.log("[voice] stopWakeWordListening");
    this.wakeListening = false;
    this.callbacks.onWakeWordActive?.(false);

    if (this.wakeTimer) {
      clearInterval(this.wakeTimer);
      this.wakeTimer = null;
    }

    this.wakeUnsub?.();
    this.wakeUnsub = null;
    this.wakeChunks = [];

    await invoke("stop_wake_capture").catch((e) =>
      console.warn("[voice] stop_wake_capture error:", e),
    );
  }

  async startListening(): Promise<void> {
    if (!this.client) {
      throw new Error("Not connected to gateway");
    }
    if (this._isListening) {
      console.log("[voice] startListening skipped: already listening");
      return;
    }

    // Stop wake word listening to avoid device conflict
    await this.stopWakeWordListening();

    const asrConfig = getAsrConfig();
    if (asrConfig.provider === "none") {
      throw new Error("语音识别已关闭，请在设置中配置 ASR 提供商");
    }

    this._isListening = true;
    this.setState("listening");
    console.log("[voice] startListening, mode=", asrConfig.provider);

    if (asrConfig.provider === "openai-realtime") {
      // Realtime mode: create talk session and stream audio
      if (!this.relaySessionId) {
        console.log("[voice] creating talk session...");
        await this.createTalkSession();
        console.log("[voice] talk session created, relaySessionId=", this.relaySessionId);
      }

      console.log("[voice] invoking start_capture");
      await invoke("start_capture", { sampleRate: 24000 });
      console.log("[voice] start_capture ok");

      this.unsubAudio = await listen<{ audio_base64: string; timestamp_ms: number }>(
        "audio:capture",
        (event) => {
          if (!this._isListening || !this.relaySessionId) return;
          this.sendAudio(event.payload.audio_base64, event.payload.timestamp_ms);
        },
      );
      console.log("[voice] audio capture listener attached");
    } else {
      // HTTP / Local ASR mode: accumulate audio chunks
      this.audioChunks = [];
      const sampleRate = asrConfig.provider === "local-paraformer" ? 16000 : 24000;
      console.log("[voice] invoking start_capture (ASR mode), sampleRate=", sampleRate);
      await invoke("start_capture", { sampleRate });
      console.log("[voice] start_capture ok");

      this.unsubAudio = await listen<{ audio_base64: string; timestamp_ms: number }>(
        "audio:capture",
        (event) => {
          if (!this._isListening) return;
          this.audioChunks.push(event.payload.audio_base64);
        },
      );
      console.log("[voice] audio capture listener attached (ASR mode)");
    }
  }

  async stopListening(): Promise<void> {
    console.log("[voice] stopListening");
    this._isListening = false;
    this.unsubAudio?.();
    this.unsubAudio = null;
    await invoke("stop_capture").catch((e) => console.warn("[voice] stop_capture error:", e));

    if (this.audioChunks.length > 0) {
      // HTTP ASR mode: process accumulated audio
      const chunks = [...this.audioChunks];
      this.audioChunks = [];
      this.setState("processing");
      try {
        await this.transcribeAndSend(chunks);
      } catch (err) {
        console.error("[voice] ASR failed:", err);
        this.callbacks.onError?.(`语音识别失败: ${String(err)}`);
        this.setState("idle");
      }
      return;
    }

    if (this.state === "listening") {
      this.setState("processing");
    }
  }

  async cancelTurn(): Promise<void> {
    this.asrAbortController?.abort();
    if (!this.client || !this.relaySessionId) return;
    try {
      await this.client.request("talk.session.cancelTurn", {
        sessionId: this.relaySessionId,
      });
    } catch (err) {
      console.warn("cancelTurn failed:", err);
    }
  }

  async cancelOutput(): Promise<void> {
    this.asrAbortController?.abort();
    if (!this.client || !this.relaySessionId) return;
    try {
      await this.client.request("talk.session.cancelOutput", {
        sessionId: this.relaySessionId,
        reason: "user-cancel",
      });
    } catch (err) {
      console.warn("cancelOutput failed:", err);
    }
    await invoke("stop_playback").catch(() => undefined);
    if (this.state === "speaking") {
      this.setState("idle");
    }
  }

  async sendChat(message: string): Promise<void> {
    if (!this.client) throw new Error("Not connected");
    await this.client.request("chat.send", {
      sessionKey: this.config.sessionKey || "bclaw-voice-session",
      message,
      idempotencyKey: crypto.randomUUID(),
    });
  }

  private async createTalkSession(): Promise<void> {
    if (!this.client) throw new Error("Not connected");

    // Gateway-relay sessions must use talk.session.create (talk.client.create is for browser WebRTC)
    console.log("[voice] requesting talk.session.create...");
    const result = (await this.client.request("talk.session.create", {
      sessionKey: this.config.sessionKey || "bclaw-voice-session",
      mode: "realtime",
      transport: "gateway-relay",
      brain: "agent-consult",
    })) as { relaySessionId?: string; sessionId?: string };
    console.log("[voice] talk.session.create result:", JSON.stringify(result));
    this.relaySessionId = result.relaySessionId || (result.sessionId as string) || null;
    if (!this.relaySessionId) {
      throw new Error("talk.session.create returned no session id");
    }
  }

  private async sendAudio(audioBase64: string, timestampMs: number): Promise<void> {
    if (!this.client || !this.relaySessionId) return;
    console.log("[voice] sendAudio chunk, len=", audioBase64.length, "ts=", timestampMs);
    try {
      await this.client.request("talk.session.appendAudio", {
        sessionId: this.relaySessionId,
        audioBase64: audioBase64,
        timestamp: timestampMs,
      });
    } catch (err) {
      console.warn("[voice] appendAudio failed:", err);
    }
  }

  private async transcribeAndSend(audioBase64Chunks: string[]): Promise<void> {
    const asrConfig = getAsrConfig();
    console.log(
      "[voice] transcribeAndSend, provider=",
      asrConfig.provider,
      "chunks=",
      audioBase64Chunks.length,
    );

    if (asrConfig.provider === "local-paraformer") {
      // Local ASR via Rust
      const allBytes = mergeBase64Chunks(audioBase64Chunks);
      const samples = new Int16Array(allBytes.buffer);
      const sampleRate = 16000;
      console.log("[voice] local ASR samples=", samples.length, "sampleRate=", sampleRate);
      const transcript = await invoke<string>("transcribe_audio", {
        samples: Array.from(samples),
        sampleRate,
      });
      if (!transcript.trim()) {
        throw new Error("本地 ASR 返回空文本");
      }
      console.log("[voice] local ASR transcript:", transcript);
      this.callbacks.onTranscript?.("user", transcript, true);
      await this.sendChat(transcript);
      return;
    }

    // HTTP ASR
    if (!asrConfig.apiKey) {
      throw new Error("ASR API Key 未配置");
    }

    const allBytes = mergeBase64Chunks(audioBase64Chunks);
    const wavBlob = pcm16ToWav(allBytes, 24000, 1);

    const formData = new FormData();
    formData.append("file", wavBlob, "audio.wav");
    formData.append("model", asrConfig.model);

    this.asrAbortController = new AbortController();

    const url = asrConfig.baseUrl.replace(/\/$/, "") + "/audio/transcriptions";
    console.log("[voice] posting ASR to", url);

    const resp = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${asrConfig.apiKey}`,
      },
      body: formData,
      signal: this.asrAbortController.signal,
    });

    this.asrAbortController = null;

    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`ASR API error ${resp.status}: ${text}`);
    }

    const result = (await resp.json()) as { text?: string };
    const transcript = result.text?.trim();

    if (!transcript) {
      throw new Error("ASR 返回空文本");
    }

    console.log("[voice] ASR transcript:", transcript);
    this.callbacks.onTranscript?.("user", transcript, true);

    // Send to LLM via gateway chat
    await this.sendChat(transcript);
  }

  private handleGatewayEvent(evt: GatewayEventFrame): void {
    if (evt.event === "chat") {
      const payload = (evt.payload || {}) as {
        state?: string;
        deltaText?: string;
        replace?: boolean;
        errorMessage?: string;
      };
      console.log("[voice] chat event state=", payload.state);
      switch (payload.state) {
        case "delta":
          if (payload.replace) {
            this.chatBuffer = payload.deltaText || "";
          } else {
            this.chatBuffer += payload.deltaText || "";
          }
          this.callbacks.onChatResponse?.(this.chatBuffer, false);
          break;
        case "final":
          this.callbacks.onChatResponse?.(this.chatBuffer, true);
          this.chatBuffer = "";
          break;
        case "error":
          this.callbacks.onError?.(payload.errorMessage || "Chat error");
          this.chatBuffer = "";
          break;
        case "aborted":
          this.callbacks.onChatResponse?.(this.chatBuffer, true);
          this.chatBuffer = "";
          break;
      }
      return;
    }

    if (evt.event !== "talk.event") return;

    const payload = (evt.payload || {}) as RelayEvent;
    console.log(
      "[voice] talk.event type=",
      payload.type,
      "relaySessionId=",
      payload.relaySessionId,
      "currentSession=",
      this.relaySessionId,
    );
    if (payload.relaySessionId && payload.relaySessionId !== this.relaySessionId) {
      console.log("[voice] ignoring event for different session");
      return;
    }

    switch (payload.type) {
      case "ready":
        console.log("[voice] event: ready");
        if (this._isListening) {
          this.setState("listening");
        }
        break;

      case "inputAudio":
        console.log("[voice] event: inputAudio");
        if (this._isListening) {
          this.setState("listening");
        }
        break;

      case "audio":
        console.log("[voice] event: audio, base64len=", payload.audioBase64?.length ?? 0);
        if (payload.audioBase64) {
          this.setState("speaking");
          this.playAudio(payload.audioBase64);
        }
        break;

      case "clear":
        console.log("[voice] event: clear");
        invoke("stop_playback").catch(() => undefined);
        break;

      case "transcript":
        console.log(
          "[voice] event: transcript role=",
          payload.role,
          "final=",
          payload.final,
          "text=",
          payload.text?.slice(0, 50),
        );
        if (payload.role && payload.text) {
          this.callbacks.onTranscript?.(payload.role, payload.text, payload.final ?? false);
          if (payload.role === "user" && payload.final) {
            this.setState("processing");
          }
        }
        break;

      case "error":
        console.error("[voice] event: error", payload.message, payload.reason);
        this.callbacks.onError?.(payload.message || "Talk session error");
        this.setState("error");
        break;

      case "close":
        console.log("[voice] event: close");
        this.cleanupSession();
        this.setState("idle");
        break;

      default:
        console.log("[voice] event: unknown type", payload.type);
        break;
    }
  }

  private async playAudio(audioBase64: string): Promise<void> {
    console.log("[voice] playAudio, base64 length=", audioBase64.length);
    try {
      await invoke("play_audio", { audioBase64 });
      console.log("[voice] playAudio ok");
    } catch (err) {
      console.warn("[voice] play_audio failed:", err);
    }
  }

  private cleanupSession(): void {
    console.log("[voice] cleanupSession");
    this.relaySessionId = null;
    this._isListening = false;
    this.audioChunks = [];
    this.asrAbortController?.abort();
    this.asrAbortController = null;
    this.unsubAudio?.();
    this.unsubAudio = null;
    invoke("stop_capture").catch(() => undefined);
    invoke("stop_playback").catch(() => undefined);
    // Keep wake word running unless disconnecting (handled by caller)
  }

  private setState(state: VoiceState): void {
    if (this.state === state) return;
    console.log("[voice] state:", this.state, "->", state);
    this.state = state;
    this.callbacks.onStateChange?.(state);

    // Auto-restart wake word listening when returning to idle
    if (state === "idle" && !this.wakeListening && !this._isListening && this.connected) {
      const asrConfig = getAsrConfig();
      if (asrConfig.wakeWord.enabled && asrConfig.provider === "local-paraformer") {
        this.startWakeWordListening().catch((err) => {
          console.warn("[voice] auto-restart wake word failed:", err);
        });
      }
    }
  }
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

function pcm16ToWav(pcmData: Uint8Array, sampleRate: number, channels: number): Blob {
  const wavHeader = new ArrayBuffer(44);
  const view = new DataView(wavHeader);
  const byteRate = sampleRate * channels * 2;
  const blockAlign = channels * 2;
  const dataSize = pcmData.length;

  // RIFF chunk descriptor
  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeString(view, 8, "WAVE");
  // fmt sub-chunk
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true); // Subchunk1Size
  view.setUint16(20, 1, true); // AudioFormat = PCM
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true); // BitsPerSample
  // data sub-chunk
  writeString(view, 36, "data");
  view.setUint32(40, dataSize, true);

  const wav = new Uint8Array(44 + dataSize);
  wav.set(new Uint8Array(wavHeader), 0);
  wav.set(pcmData, 44);
  return new Blob([wav], { type: "audio/wav" });
}

function writeString(view: DataView, offset: number, str: string) {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}

/// Generate a short dual-beep confirmation tone (similar to Siri/Alexa wake sound)
/// and play it via Rust audio playback. Returns immediately; playback is async.
async function playWakeTone(): Promise<void> {
  const sampleRate = 24000;
  const beepDuration = 0.18; // 180ms per beep
  const gapDuration = 0.06; // 60ms gap
  const freq1 = 880; // A5
  const freq2 = 1175; // D6 (approx)

  const samplesPerBeep = Math.floor(beepDuration * sampleRate);
  const gapSamples = Math.floor(gapDuration * sampleRate);
  const totalSamples = samplesPerBeep * 2 + gapSamples;

  const bytes = new Uint8Array(totalSamples * 2);
  const view = new DataView(bytes.buffer);
  let writeOffset = 0;

  const writeBeep = (freq: number) => {
    for (let i = 0; i < samplesPerBeep; i++) {
      const t = i / sampleRate;
      const attack = Math.min(1, i / (sampleRate * 0.02));
      const decay = Math.min(1, (samplesPerBeep - i) / (sampleRate * 0.06));
      const envelope = attack * decay;
      const sample = Math.sin(2 * Math.PI * freq * t) * envelope * 0.6;
      const pcm16 = Math.max(-32768, Math.min(32767, Math.round(sample * 32767)));
      view.setInt16(writeOffset, pcm16, true);
      writeOffset += 2;
    }
  };

  writeBeep(freq1);
  // Gap (silence)
  for (let i = 0; i < gapSamples; i++) {
    view.setInt16(writeOffset, 0, true);
    writeOffset += 2;
  }
  writeBeep(freq2);

  // Safely encode Uint8Array to base64 without spread/stack issues
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const base64 = btoa(binary);
  console.log("[voice] playWakeTone generated, base64 len=", base64.length);
  await invoke("play_audio", { audioBase64: base64 });
  console.log("[voice] playWakeTone invoked ok");
}
