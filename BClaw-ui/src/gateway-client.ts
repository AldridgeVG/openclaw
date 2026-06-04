export type GatewayEventFrame = {
  type: "event";
  event: string;
  payload?: unknown;
  seq?: number;
};

export type GatewayResponseFrame = {
  type: "res";
  id: string;
  ok: boolean;
  payload?: unknown;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
};

export type GatewayHelloOk = {
  type: "hello-ok";
  protocol: number;
  server?: { version?: string; connId?: string };
  features?: { methods?: string[]; events?: string[] };
  auth: { role: string; scopes: string[] };
};

type Pending = {
  resolve: (value: unknown) => void;
  reject: (err: unknown) => void;
};

export type GatewayConnectParams = {
  minProtocol: number;
  maxProtocol: number;
  client: { id: string; version: string; platform: string; mode: string };
  role: string;
  scopes: string[];
  caps: string[];
  auth?: { token?: string; password?: string };
  userAgent: string;
  locale: string;
};

const MIN_PROTOCOL = 4;
const MAX_PROTOCOL = 4;

export class GatewayClient {
  private ws: WebSocket | null = null;
  private pending = new Map<string, Pending>();
  private eventListeners = new Set<(evt: GatewayEventFrame) => void>();
  private connectTimeout: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private url: string,
    private options?: {
      token?: string;
      password?: string;
      onHello?: (hello: GatewayHelloOk) => void;
      onClose?: (info: { code: number; reason: string }) => void;
    },
  ) {}

  connect(): void {
    this.pending.clear();
    console.log("[gateway-client] connecting to", this.url);

    try {
      this.ws = new WebSocket(this.url);
    } catch (err) {
      console.error("[gateway-client] WebSocket construction failed:", err);
      this.options?.onClose?.({ code: 1006, reason: String(err) });
      return;
    }

    this.ws.onopen = () => {
      console.log("[gateway-client] ws open");
      this.sendConnect();
    };

    this.ws.onmessage = (ev) => {
      this.handleMessage(String(ev.data));
    };

    this.ws.onclose = (ev) => {
      console.log("[gateway-client] ws close", ev.code, ev.reason);
      this.ws = null;
      this.flushPending(new Error(`Gateway closed: ${ev.code} ${ev.reason}`));
      this.options?.onClose?.({ code: ev.code, reason: ev.reason });
    };

    this.ws.onerror = (err) => {
      console.error("[gateway-client] ws error", err);
      // Errors are handled by onclose
    };
  }

  disconnect(): void {
    if (this.connectTimeout) {
      clearTimeout(this.connectTimeout);
      this.connectTimeout = null;
    }
    this.ws?.close();
    this.ws = null;
    this.flushPending(new Error("Gateway client disconnected"));
  }

  get connected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  request<T = unknown>(method: string, params?: unknown): Promise<T> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.warn("[gateway-client] request", method, "failed: not connected");
      return Promise.reject(new Error("Gateway not connected"));
    }
    const id = crypto.randomUUID();
    const frame = { type: "req", id, method, params };
    console.log("[gateway-client] req id=", id, "method=", method);
    const promise = new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (value: unknown) => void, reject });
    });
    this.ws.send(JSON.stringify(frame));
    return promise;
  }

  addEventListener(listener: (evt: GatewayEventFrame) => void): () => void {
    this.eventListeners.add(listener);
    return () => {
      this.eventListeners.delete(listener);
    };
  }

  private sendConnect(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.warn("[gateway-client] sendConnect skipped: ws not open");
      return;
    }

    const params: GatewayConnectParams = {
      minProtocol: MIN_PROTOCOL,
      maxProtocol: MAX_PROTOCOL,
      client: {
        id: "openclaw-control-ui",
        version: "0.1.0",
        platform: "desktop",
        mode: "ui",
      },
      role: "operator",
      scopes: [
        "operator.read",
        "operator.write",
        "operator.admin",
        "operator.approvals",
        "operator.pairing",
      ],
      caps: ["tool-events"],
      auth:
        this.options?.token || this.options?.password
          ? {
              token: this.options.token,
              password: this.options.password,
            }
          : undefined,
      userAgent: "BClaw/0.1.0",
      locale: navigator.language || "zh-CN",
    };
    console.log("[gateway-client] connect params auth=", params.auth ? "present" : "missing");

    // Give a small delay before sending connect to ensure WS is fully ready
    this.connectTimeout = setTimeout(() => {
      this.connectTimeout = null;
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        console.warn("[gateway-client] sendConnect timeout skipped: ws not open");
        return;
      }
      const id = crypto.randomUUID();
      const frame = { type: "req", id, method: "connect", params };
      console.log("[gateway-client] sending connect req id=", id);
      const promise = new Promise<GatewayHelloOk>((resolve, reject) => {
        this.pending.set(id, { resolve: resolve as (value: unknown) => void, reject });
      });
      this.ws.send(JSON.stringify(frame));
      promise
        .then((hello) => {
          console.log(
            "[gateway-client] connect ok, protocol=",
            hello.protocol,
            "role=",
            hello.auth.role,
          );
          this.options?.onHello?.(hello);
        })
        .catch((err) => {
          console.error("[gateway-client] connect failed:", err);
          this.ws?.close();
        });
    }, 100);
  }

  private handleMessage(raw: string): void {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      console.warn("[gateway-client] JSON parse failed:", raw.slice(0, 200));
      return;
    }

    const frame = parsed as { type?: unknown };

    if (frame.type === "event") {
      const evt = parsed as GatewayEventFrame;
      console.log("[gateway-client] event:", evt.event, evt.seq ?? "");
      for (const listener of this.eventListeners) {
        try {
          listener(evt);
        } catch (err) {
          console.error("[gateway-client] event listener error:", err);
        }
      }
      return;
    }

    if (frame.type === "res") {
      const res = parsed as GatewayResponseFrame;
      console.log(
        "[gateway-client] res id=",
        res.id,
        "ok=",
        res.ok,
        res.error ? "error=" + res.error.message : "",
      );
      const pending = this.pending.get(res.id);
      if (!pending) {
        console.warn("[gateway-client] no pending for id", res.id);
        return;
      }
      this.pending.delete(res.id);
      if (res.ok) {
        pending.resolve(res.payload);
      } else {
        pending.reject(new Error(res.error?.message || "Request failed"));
      }
      return;
    }
  }

  private flushPending(err: Error): void {
    for (const [, p] of this.pending) {
      p.reject(err);
    }
    this.pending.clear();
  }
}
