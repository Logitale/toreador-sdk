// ============================================================
// @toreador/sdk — Official TypeScript SDK for Toreador API
// ============================================================

// ---- Request types ----

export interface GenerateQRRequest {
  /** Token symbol: BTC, ETH, SOL, POL, USDC, USDT, EURC */
  token: string;
  /** Chain identifier: bitcoin, ethereum, polygon, solana, base */
  chainId: string;
  /** Amount to receive (as string to preserve decimal precision) */
  amount: string;
  /** Recipient wallet address */
  recipientAddress: string;
}

export interface CreateSessionRequest {
  /** Token symbol: USDC, USDT, EURC */
  token: string;
  /** Chain identifier: ethereum, polygon, base */
  chainId: string;
  /** Amount to receive */
  amount: string;
  /** Recipient wallet address */
  recipientAddress: string;
}

// ---- Response types ----

export interface TokenInfo {
  symbol: string;
  name: string;
  decimals: number;
}

export interface ChainInfo {
  id: string;
  name: string;
  symbol: string;
}

export interface GenerateQRResponse {
  success: boolean;
  type: "native" | "spl";
  qrData: string;
  qrCodeURL: string;
  token: TokenInfo;
  chain: ChainInfo;
  amount: string;
  recipientAddress: string;
}

export interface CreateSessionResponse {
  success: boolean;
  sessionId: string;
  securityCode: string;
  url: string;
  expiresAt: number;
  expiresIn: number;
  token: TokenInfo;
  chain: ChainInfo;
  amount: string;
  recipientAddress: string;
}

export interface PaymentRecord {
  id: string;
  type: string;
  chainId: string;
  token: string;
  amount: string;
  recipientAddress: string;
  createdAt: number | null;
}

export interface HistoryResponse {
  success: boolean;
  payments: PaymentRecord[];
}

export interface SessionRecord {
  id: string;
  status: string;
  token: string;
  chainId: string;
  amount: string;
  recipientAddress: string;
  txHash: string | null;
  confirmations: number;
  requiredConfirmations: number;
  expiresAt: number | null;
  submittedAt: number | null;
  completedAt: number | null;
  createdAt: number | null;
}

export interface SessionsListResponse {
  success: boolean;
  sessions: SessionRecord[];
}

export interface PaymentStatusResponse {
  success: boolean;
  sessionId: string;
  status: string;
  token: string;
  chainId: string;
  amount: string;
  recipientAddress: string;
  txHash: string | null;
  confirmations: number;
  requiredConfirmations: number;
  expiresAt: number;
  completedAt: number | null;
}

// ---- Error class ----

export class ToreadorError extends Error {
  public readonly status: number;
  public readonly body: unknown;

  constructor(message: string, status: number, body?: unknown) {
    super(message);
    this.name = "ToreadorError";
    this.status = status;
    this.body = body;
  }
}

export class WebhookSignatureError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WebhookSignatureError";
  }
}

// ---- Webhook event ----

export interface WebhookEvent<TData = unknown> {
  id: string;
  type: string;
  createdAt: number;
  data: TData;
}

// ---- Options ----

export interface ToreadorOptions {
  /** API key (format: tdr_xxxx). Required. */
  apiKey: string;
  /** Base URL override. Defaults to https://toreador.io/api/v1/public */
  baseURL?: string;
  /** Custom fetch implementation. Defaults to globalThis.fetch. */
  fetch?: typeof globalThis.fetch;
  /** Per-request timeout in milliseconds. Defaults to 30000 (30s). Set to 0 to disable. */
  timeoutMs?: number;
  /** Optional AbortSignal applied to every request (combined with the per-request timeout). */
  signal?: AbortSignal;
}

// ---- Namespace interfaces ----

export interface QRCodeNamespace {
  /** Generate a QR code for native tokens or Solana SPL tokens. */
  generate(params: GenerateQRRequest): Promise<GenerateQRResponse>;
  /** List your QR code generation history (last 50). */
  history(): Promise<HistoryResponse>;
}

export interface SessionsNamespace {
  /** Create a payment session for non-native EVM tokens (USDC/USDT/EURC). */
  create(params: CreateSessionRequest): Promise<CreateSessionResponse>;
  /** List your payment sessions (last 50). */
  list(): Promise<SessionsListResponse>;
  /** Check the status of a specific payment session. */
  getStatus(sessionId: string): Promise<PaymentStatusResponse>;
}

// ---- Main client class ----

interface ClientInternals {
  apiKey: string;
  baseURL: string;
  fetchImpl: typeof globalThis.fetch;
  timeoutMs: number;
  userSignal?: AbortSignal;
}

// The API key (and other sensitive internals) live in this module-level WeakMap,
// not as instance fields. This prevents accidental exposure via JSON.stringify,
// Object.keys, structured logging, error reporters, devtools, etc.
const internals = new WeakMap<Toreador, ClientInternals>();

const DEFAULT_TIMEOUT_MS = 30_000;

export class Toreador {
  public readonly qrcode: QRCodeNamespace;
  public readonly sessions: SessionsNamespace;

  constructor(options: ToreadorOptions) {
    if (!options.apiKey) {
      throw new Error("Toreador: apiKey is required");
    }
    if (!options.apiKey.startsWith("tdr_")) {
      throw new Error('Toreador: apiKey must start with "tdr_"');
    }

    internals.set(this, {
      apiKey: options.apiKey,
      baseURL: (options.baseURL || "https://toreador.io/api/v1/public").replace(/\/+$/, ""),
      fetchImpl: options.fetch || globalThis.fetch,
      timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      userSignal: options.signal,
    });

    this.qrcode = {
      generate: (params) => this.request<GenerateQRResponse>("POST", "/generate-qr", params),
      history: () => this.request<HistoryResponse>("GET", "/history"),
    };

    this.sessions = {
      create: (params) => this.request<CreateSessionResponse>("POST", "/create-session", params),
      list: () => this.request<SessionsListResponse>("GET", "/sessions"),
      getStatus: (id) => this.request<PaymentStatusResponse>("GET", `/payment/${encodeURIComponent(id)}/status`),
    };
  }

  private async request<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
    const ctx = internals.get(this);
    if (!ctx) {
      throw new Error("Toreador: client internals missing (constructor not run?)");
    }

    const url = `${ctx.baseURL}${path}`;

    const headers: Record<string, string> = {
      "X-API-Key": ctx.apiKey,
      "Accept": "application/json",
    };

    const init: RequestInit = { method, headers };

    if (body !== undefined) {
      headers["Content-Type"] = "application/json";
      init.body = JSON.stringify(body);
    }

    // Combine the per-request timeout with any user-provided signal so that
    // either source aborts the underlying fetch.
    const ctrl = new AbortController();
    const onUserAbort = () => ctrl.abort(ctx.userSignal?.reason);
    if (ctx.userSignal) {
      if (ctx.userSignal.aborted) {
        ctrl.abort(ctx.userSignal.reason);
      } else {
        ctx.userSignal.addEventListener("abort", onUserAbort, { once: true });
      }
    }
    const timer = ctx.timeoutMs > 0
      ? setTimeout(() => ctrl.abort(new DOMException("Request timed out", "TimeoutError")), ctx.timeoutMs)
      : null;
    init.signal = ctrl.signal;

    let res: Response;
    try {
      res = await ctx.fetchImpl(url, init);
    } catch (err) {
      if ((err as { name?: string })?.name === "AbortError" || (err as { name?: string })?.name === "TimeoutError") {
        throw new ToreadorError(
          ctrl.signal.reason instanceof DOMException && ctrl.signal.reason.name === "TimeoutError"
            ? `Request timed out after ${ctx.timeoutMs}ms`
            : "Request aborted",
          0,
        );
      }
      throw err;
    } finally {
      if (timer) clearTimeout(timer);
      if (ctx.userSignal) ctx.userSignal.removeEventListener("abort", onUserAbort);
    }

    let data: unknown;
    try {
      data = await res.json();
    } catch {
      throw new ToreadorError(`HTTP ${res.status}: failed to parse response`, res.status);
    }

    if (!res.ok) {
      throw new ToreadorError(
        (data as { error?: string })?.error || `HTTP ${res.status}`,
        res.status,
        data,
      );
    }

    return data as T;
  }
}

export default Toreador;

// ============================================================
// Webhooks — signature verification helper
// ============================================================

/**
 * Verify the `Toreador-Signature` header against a raw request body and your
 * endpoint signing secret, then parse the body as a Toreador webhook event.
 *
 * Usage (Node/Express):
 *
 *   app.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
 *     try {
 *       const event = await Toreador.webhooks.constructEvent(
 *         req.body.toString('utf8'),
 *         req.headers['toreador-signature'] as string,
 *         process.env.TOREADOR_WEBHOOK_SECRET!
 *       );
 *       // ... handle event.type
 *       res.sendStatus(204);
 *     } catch (err) {
 *       if (err instanceof WebhookSignatureError) return res.sendStatus(400);
 *       throw err;
 *     }
 *   });
 *
 * IMPORTANT: pass the **raw** body bytes/string, not a parsed JSON object.
 *
 * @param rawBody       The exact bytes the server received (UTF-8 string).
 * @param signatureHeader The full `Toreador-Signature` header value.
 * @param secret        Your endpoint signing secret (`whsec_...`).
 * @param toleranceSeconds Maximum allowed clock skew. Defaults to 300 (5 min).
 */
export interface WebhooksNamespace {
  constructEvent<TData = unknown>(
    rawBody: string,
    signatureHeader: string | null | undefined,
    secret: string,
    toleranceSeconds?: number,
  ): Promise<WebhookEvent<TData>>;
}

function parseSignatureHeader(header: string): { t: number; v1: string[] } {
  const parts = header.split(",").map((s) => s.trim());
  let timestamp: number | null = null;
  const v1: string[] = [];
  for (const part of parts) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    const name = part.slice(0, eq);
    const value = part.slice(eq + 1);
    if (name === "t") {
      const n = Number(value);
      if (Number.isFinite(n)) timestamp = n;
    } else if (name === "v1") {
      v1.push(value);
    }
  }
  if (timestamp === null || v1.length === 0) {
    throw new WebhookSignatureError("Malformed Toreador-Signature header");
  }
  return { t: timestamp, v1 };
}

function timingSafeHexEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

async function hmacSha256Hex(secret: string, data: string): Promise<string> {
  const enc = new TextEncoder();
  // crypto.subtle is available in Node 18+, Deno, browsers, edge runtimes.
  const subtle = (globalThis as { crypto?: { subtle?: SubtleCrypto } }).crypto?.subtle;
  if (!subtle) {
    throw new Error("Toreador.webhooks: WebCrypto SubtleCrypto is not available in this runtime");
  }
  const key = await subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await subtle.sign("HMAC", key, enc.encode(data));
  const bytes = new Uint8Array(sig);
  let hex = "";
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, "0");
  }
  return hex;
}

export const webhooks: WebhooksNamespace = {
  async constructEvent<TData = unknown>(
    rawBody: string,
    signatureHeader: string | null | undefined,
    secret: string,
    toleranceSeconds = 300,
  ): Promise<WebhookEvent<TData>> {
    if (!signatureHeader) {
      throw new WebhookSignatureError("Missing Toreador-Signature header");
    }
    if (!secret) {
      throw new WebhookSignatureError("Missing webhook secret");
    }

    const { t, v1 } = parseSignatureHeader(signatureHeader);

    // Reject stale or future-dated signatures.
    const nowSeconds = Math.floor(Date.now() / 1000);
    if (Math.abs(nowSeconds - t) > toleranceSeconds) {
      throw new WebhookSignatureError("Signature timestamp outside tolerance window");
    }

    const expected = await hmacSha256Hex(secret, `${t}.${rawBody}`);
    const matched = v1.some((candidate) => timingSafeHexEqual(candidate, expected));
    if (!matched) {
      throw new WebhookSignatureError("Signature mismatch");
    }

    let parsed: WebhookEvent<TData>;
    try {
      parsed = JSON.parse(rawBody) as WebhookEvent<TData>;
    } catch {
      throw new WebhookSignatureError("Body is not valid JSON");
    }
    return parsed;
  },
};

// Expose `Toreador.webhooks.constructEvent(...)` as a static-style API in
// addition to the named `webhooks` export. Namespace merge gives TS users
// proper typing for `Toreador.webhooks.constructEvent(...)`.
// deno-lint-ignore no-namespace
export namespace Toreador {
  // eslint-disable-next-line @typescript-eslint/no-redeclare
  export const webhooks: WebhooksNamespace = (
    globalThis as unknown as { __toreador_webhooks?: WebhooksNamespace }
  ).__toreador_webhooks ?? assignAndGetWebhooks();
}

function assignAndGetWebhooks(): WebhooksNamespace {
  (globalThis as unknown as { __toreador_webhooks?: WebhooksNamespace }).__toreador_webhooks = webhooks;
  return webhooks;
}
