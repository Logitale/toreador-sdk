// ============================================================
// @toreador/sdk — Official TypeScript SDK for the Toreador API
// ============================================================
//
// Server-side only: the API key is a secret. Zero dependencies; works on
// Node.js 18+, Deno, Bun and edge runtimes (native fetch + WebCrypto).

// ---- Shared types ----

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

/** A (token, chain) pair, e.g. `{ token: "USDC", chain: "base" }`. */
export interface Rail {
  token: string;
  chain: string;
}

/** Pagination options for list endpoints (keyset pagination). */
export interface ListOptions {
  /** Page size, 1-100 (default 20 server-side). */
  limit?: number;
  /** Opaque cursor from a previous page's `next_cursor`. */
  cursor?: string;
  /** Only the items of this establishment (an id from `account.establishments()`). */
  establishment_id?: string;
}

export interface Page<T> {
  success: boolean;
  data: T[];
  has_more: boolean;
  next_cursor: string | null;
}

/** Per-request options for mutating calls. */
export interface RequestOptions {
  /** Idempotency-Key: retrying with the same key replays the original response (same key + different body → 409). */
  idempotencyKey?: string;
}

// ---- QR codes (native tokens and Solana SPL) ----

export interface GenerateQRRequest {
  /** Token symbol, e.g. BTC, ETH, SOL, POL, USDC (Solana). */
  token: string;
  /** Chain identifier, e.g. bitcoin, ethereum, polygon, base, arbitrum, bnb, avalanche, solana. */
  chainId: string;
  /** Amount in the token's natural unit, as a decimal string. */
  amount: string;
  /** Receiving address. Must be one of the wallets registered on your account. */
  recipientAddress: string;
  /** Output format of the QR code. Default "png" (base64 data URI); "svg" is vector markup; "text" is block characters to print in a terminal. */
  format?: "png" | "svg" | "text";
  /** For `format: "text"`: background of the terminal the text will be printed in. Default "dark". A wrong background gives an inverted QR code that many phones cannot read. */
  textBackground?: "dark" | "light";
  /** Establishment to attach the request to (defaults to the key's organisation). */
  establishment_id?: string;
}

export interface GenerateQRResponse {
  success: boolean;
  type: "native" | "spl";
  /** On-chain payment URI (BIP-21, EIP-681 or Solana Pay). */
  qrData: string;
  format: "png" | "svg" | "text";
  /** Present when `format` is "text": lines of block characters separated by "\n". Print as is, in a monospace font. Same QR code as the image outputs. */
  qrCodeText?: string;
  /** Present when `format` is "text": the background the text was drawn for. */
  textBackground?: "dark" | "light";
  /** Present when `format` is "png": base64 PNG data URI. */
  qrCodeURL?: string;
  /** Present when `format` is "svg": SVG markup. */
  qrCodeSvg?: string;
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
  /** Establishment where the QR code was generated. */
  establishmentId: string | null;
  establishmentName: string | null;
}

export type HistoryResponse = Page<PaymentRecord>;

// ---- Checkouts (fiat-denominated, the canonical resource for integrations) ----

export interface CreateCheckoutRequest {
  /** Invoice amount in fiat. */
  amount: number | string;
  currency: "USD" | "EUR";
  /** Receiving address. Must be one of the wallets registered on your account. */
  recipientAddress: string;
  /** Free-form description shown on the payment page (max 500 chars). */
  description?: string;
  /** Your own identifier (order id…), echoed in webhooks and payment objects (max 255 chars). */
  reference?: string;
  /**
   * Also offer stablecoins of the other currency; the token amount is computed from an
   * indicative reference rate fixed at rail selection. No conversion is performed: the payer
   * sends that stablecoin directly to recipientAddress.
   */
  conversion?: boolean;
  /** Also offer native crypto (ETH, POL…); amount computed from an indicative market rate. The merchant bears the volatility. */
  acceptNative?: boolean;
  /** Restrict the offered rails to this list (max 50). The API can only narrow, never add. */
  rails?: Rail[];
  /** Origin channel for your own statistics (lowercase letters, digits, "-" and "_"). */
  source?: string;
  /** Establishment to attach the checkout to (defaults to the key's organisation). */
  establishment_id?: string;
}

export interface CheckoutResponse {
  success: boolean;
  checkoutId: string;
  reference: string | null;
  /**
   * Full address of the Toreador-hosted payment request page (the payer pays wallet-to-wallet to recipientAddress).
   * Pass it to the payer as is: the page lives on its own host, distinct from the API host — never rebuild it.
   */
  url: string;
  amount: number;
  currency: string;
  conversion: boolean;
  recipient: string;
  allowedRails: Rail[];
  expiresAt: number;
  expiresIn: number;
}

// ---- Sessions (token-denominated, advanced flow) ----

export interface CreateSessionRequest {
  /** Stablecoin symbol, e.g. USDC, USDT, EURC. */
  token: string;
  /** EVM chain identifier. */
  chainId: string;
  /** Amount in the token's natural unit. */
  amount: string;
  /** Receiving address. Must be one of the wallets registered on your account. */
  recipientAddress: string;
  establishment_id?: string;
}

export interface CreateSessionResponse {
  success: boolean;
  sessionId: string;
  /** Full address of the Toreador-hosted payment page. Pass it to the payer as is: its host is distinct from the API host. */
  url: string;
  expiresAt: number;
  expiresIn: number;
  token: TokenInfo;
  chain: ChainInfo;
  amount: string;
  recipientAddress: string;
}

export type SessionStatus = "pending" | "submitted" | "confirming" | "completed" | "expired" | "failed";

export interface SessionRecord {
  id: string;
  status: SessionStatus | string;
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
  amountUsd: number | null;
  priceUsd: number | null;
  /** Indicative reference rate used to compute the token amount; informational, no conversion performed. */
  fxRate: number | null;
  /** Source of the indicative reference rate (e.g. "ecb"). */
  fxSource: string | null;
  /** When the indicative reference rate was taken (epoch seconds). */
  fxQuotedAt: number | null;
  checkoutId: string | null;
  reference: string | null;
  invoice: { currency: string | null; amount: number | null } | null;
  /** Establishment where the payment request was created, whoever on the team created it. */
  establishmentId: string | null;
  establishmentName: string | null;
}

export type SessionsListResponse = Page<SessionRecord>;

export interface PaymentStatusResponse {
  success: boolean;
  sessionId: string;
  status: SessionStatus | string;
  token: string;
  chainId: string;
  amount: string;
  recipientAddress: string;
  txHash: string | null;
  confirmations: number;
  requiredConfirmations: number;
  expiresAt: number | null;
  completedAt: number | null;
}

// ---- Unified payment object ----

export interface PaymentTimelineEvent {
  type: string;
  at: number;
  data?: Record<string, unknown>;
}

/** Unified Payment object: a native QR (type=native) or a session (type=session), fetched by session id or checkout id. */
export interface UnifiedPayment {
  success: boolean;
  id: string;
  object: "payment";
  type: "native" | "session";
  status: string;
  token: string;
  chain: string;
  amount: string;
  recipient: string;
  txHash: string | null;
  confirmations?: number;
  requiredConfirmations?: number;
  createdAt: number;
  expiresAt?: number | null;
  completedAt?: number | null;
  checkoutId?: string | null;
  reference?: string | null;
  /** Establishment where the payment request was created. */
  establishmentId?: string | null;
  establishmentName?: string | null;
  timeline: PaymentTimelineEvent[];
}

// ---- Account, wallets, tokens ----

export interface PingResponse {
  ok: boolean;
  env: "test" | "live";
  plan: string | null;
  email: string | null;
  apiVersion: string;
}

export interface AccountResponse {
  success: boolean;
  /** Effective plan (rights and limits). */
  plan: string;
  env: "test" | "live";
  email: string | null;
  subscription: {
    status: "trialing" | "active";
    realPlan: string;
    onTrial: boolean;
    trialEndsAt: number | null;
    trialDaysRemaining: number | null;
  };
  quota: {
    used: number;
    limit: number | null;
    window: "day" | "month";
    remaining: number | null;
  };
  limits: {
    ratePerMinute: number | null;
    apiKeysMax: number | null;
    walletsMax: number | null;
  };
}

export interface Wallet {
  address: string;
  family: "evm" | "solana" | "bitcoin" | string;
  label: string;
  source: string;
  custodial: boolean;
  /** true when the address is proven to belong to the account: a signed proof for a self-custodial wallet, the connection itself for an exchange wallet. */
  ownershipProven: boolean;
  /** null = no restriction (self-custodial). Otherwise the only (token, chain) pairs this wallet can receive. */
  acceptedRails: Rail[] | null;
}

export interface WalletsResponse {
  success: boolean;
  wallets: Wallet[];
}

/** A point of sale of the organization. Its id is the `establishment_id` of a payment request and of the list filters. */
export interface Establishment {
  id: string;
  name: string;
  isDefault: boolean;
  organizationId: string;
  organizationName: string | null;
}

export interface EstablishmentsResponse {
  success: boolean;
  data: Establishment[];
}

export interface TokenChain {
  chain: string;
  type: "native" | "erc20" | "spl";
  contract: string | null;
}

export interface TokenEntry {
  symbol: string;
  name: string;
  decimals: number;
  isNative: boolean;
  /** Fiat currency the stablecoin is pegged to, null for native tokens. */
  peg: string | null;
  icon: string | null;
  chains: TokenChain[];
}

export interface ChainEntry {
  id: string;
  name: string;
  nativeToken: string;
  icon: string | null;
  color: string | null;
  family: "evm" | "solana" | "bitcoin";
  /** Transaction explorer URL template for the key's environment; replace `{hash}`. */
  explorerTx: string | null;
}

export interface TokensResponse {
  success: boolean;
  env: "test" | "live";
  chains: ChainEntry[];
  tokens: TokenEntry[];
}

// ---- Sanctions screening ----

export interface ScreenResponse {
  success: boolean;
  address: string;
  status: "clear" | "sanctioned" | "unknown";
  /** null when the verdict is unknown (invalid address, unsupported chain, oracle unavailable). */
  sanctioned: boolean | null;
  source: string;
}

// ---- Webhooks ----

export type WebhookEventType =
  | "session.created"
  | "session.submitted"
  | "session.confirming"
  | "session.completed"
  | "session.expired"
  | "session.failed"
  | "checkout.created";

/**
 * Environment of a webhook endpoint. An endpoint registered with an API key belongs to the environment of that key and
 * only receives its events; `null` is an endpoint created in the dashboard, which receives both.
 */
export type WebhookEnvironment = "live" | "test" | null;

export interface RegisterWebhookRequest {
  /** Public HTTPS endpoint. For keys issued through Connect, it must be on the key's domain. */
  url: string;
  /** Defaults to session.completed, session.failed and session.expired. */
  events?: WebhookEventType[];
  description?: string;
}

export interface RegisterWebhookResponse {
  success: boolean;
  id: string;
  /** Organization whose events the endpoint receives; null = every organization of the account. */
  organizationId: string | null;
  environment: WebhookEnvironment;
  url: string;
  events: WebhookEventType[];
  /** Signing secret, returned once. Store it encrypted. */
  secret: string;
  /** false when an endpoint with the same URL already existed (its secret was rotated). */
  created: boolean;
}

export interface WebhookEndpoint {
  id: string;
  /** Organization whose events the endpoint receives; null = every organization of the account. */
  organizationId: string | null;
  environment: WebhookEnvironment;
  url: string;
  description: string | null;
  events: WebhookEventType[];
  /** false once disabled, by you or after repeated delivery failures. */
  enabled: boolean;
  /** Deliveries failed in a row; a success resets it. */
  consecutiveFailures: number;
  /** Epoch seconds. */
  lastSuccessAt: number | null;
  /** Epoch seconds. */
  lastFailureAt: number | null;
  /** Epoch seconds. */
  createdAt: number;
}

/** A signed event, as delivered to your endpoint. */
export interface WebhookEvent<TData = unknown> {
  /** Unique per event; a delivery may be retried, so deduplicate on it. */
  id: string;
  type: WebhookEventType | string;
  /** Epoch seconds. */
  createdAt: number;
  /** true for an event of the test environment (test key, testnet payment): never fulfil a real order on it. */
  test: boolean;
  data: TData;
}

/** `data` of every `session.*` event. */
export interface SessionEventData {
  sessionId: string;
  status: SessionStatus | string;
  token: string;
  chainId: string;
  amount: string;
  recipientAddress: string;
  txHash: string | null;
  confirmations: number;
  requiredConfirmations: number;
  expiresAt: number;
  submittedAt: number | null;
  completedAt: number | null;
  createdAt: number;
  /** The checkout the session belongs to, null for a session created directly. */
  checkoutId: string | null;
  /** The `reference` given when the checkout was created. Present on the events that follow `session.created`, for a session that belongs to a checkout. */
  reference?: string | null;
  establishmentId: string | null;
  amountUsd: number | null;
  priceUsd: number | null;
  /** Indicative reference rate used to compute the token amount; informational, no conversion performed. */
  fxRate: number | null;
  fxSource: string | null;
  fxQuotedAt: number | null;
}

/** `data` of the `checkout.created` event. */
export interface CheckoutCreatedEventData {
  checkoutId: string;
  reference: string | null;
  amount: number;
  currency: string;
  conversion: boolean;
  establishmentId: string | null;
}

// ---- Export ----

export interface ExportOptions {
  /** Unix seconds (inclusive) on completedAt. */
  from?: number;
  to?: number;
  /** Only the payments of this establishment (an id from `account.establishments()`). */
  establishment_id?: string;
}

/**
 * Bank-transaction import file of an accounting software: date, label, amount, one currency per file.
 * With a live key the file never contains a test payment; with a test key it contains only test payments.
 */
export type AccountingFormat = "quickbooks" | "xero" | "odoo" | "pennylane";

export interface AccountingExportOptions extends ExportOptions {
  format: AccountingFormat;
  /**
   * Currency of the file (e.g. "USD"). Optional when the period holds a single currency; otherwise the API answers
   * 400 `invalid_parameter` and lists the currencies present in `error_details.currencies`.
   */
  currency?: string;
}

export interface ExportRecord {
  id: string;
  completedAt: number | null;
  invoiceCurrency: string;
  invoiceAmount: number | "";
  /** Token actually paid on-chain by the payer to the recipient; Toreador does not settle anything. */
  settlementToken: string;
  /** Chain on which the payer actually paid the recipient; Toreador does not settle anything. */
  settlementChain: string;
  /** Amount actually paid on-chain by the payer to the recipient; Toreador does not settle anything. */
  settlementAmount: string;
  amountUsd: number | "";
  /** Indicative reference rate used to compute the amount; informational, no conversion performed. */
  fxRate: number | "";
  /** Source of the indicative reference rate (e.g. "ecb"). */
  fxSource: string;
  /** When the indicative reference rate was taken (epoch seconds). */
  fxQuotedAt: number | "";
  recipient: string;
  txHash: string;
  /** Establishment where the payment request was created ("" when none). */
  establishmentId: string;
  establishmentName: string;
}

export interface ExportJsonResponse {
  success: boolean;
  count: number;
  truncated: boolean;
  data: ExportRecord[];
}

// ---- Errors ----

/** Typed error details carried by every API error response. */
export interface ErrorDetails {
  code: string;
  type: string;
  message: string;
  request_id: string | null;
  doc_url: string;
  [key: string]: unknown;
}

export class ToreadorError extends Error {
  public readonly status: number;
  public readonly body: unknown;
  /** Stable machine-readable code (e.g. "quota_exceeded", "address_not_registered"), or "" when unavailable. */
  public readonly code: string;
  public readonly type: string;
  public readonly requestId: string | null;
  public readonly docUrl: string | null;

  constructor(message: string, status: number, body?: unknown) {
    super(message);
    this.name = "ToreadorError";
    this.status = status;
    this.body = body;
    const details = (body as { error_details?: Partial<ErrorDetails> } | undefined)?.error_details;
    this.code = typeof details?.code === "string" ? details.code : "";
    this.type = typeof details?.type === "string" ? details.type : "";
    this.requestId = typeof details?.request_id === "string" ? details.request_id : null;
    this.docUrl = typeof details?.doc_url === "string" ? details.doc_url : null;
  }

  /** 402: the plan's monthly quota is reached. `details` carries used, limit and upgrade_url. */
  get isQuotaExceeded(): boolean {
    return this.status === 402;
  }

  /** 429: rate limit reached; retry after a short delay. */
  get isRateLimited(): boolean {
    return this.status === 429;
  }

  /** 401: the key is missing, invalid or revoked. */
  get isUnauthorized(): boolean {
    return this.status === 401;
  }

  /** Extra fields of `error_details` (for a 402: used, limit, upgrade_url). */
  get details(): Record<string, unknown> {
    const details = (this.body as { error_details?: Record<string, unknown> } | undefined)?.error_details;
    return details && typeof details === "object" ? details : {};
  }
}

export class WebhookSignatureError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WebhookSignatureError";
  }
}

// ---- Options ----

export interface ToreadorOptions {
  /** API key: `tor_live_…` or `tor_test_…` (a test key creates sandbox requests on testnets). Required. */
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

// ---- Namespaces ----

export interface QRCodeNamespace {
  /** Generate a QR code for a native token or a Solana SPL token. */
  generate(params: GenerateQRRequest, options?: RequestOptions): Promise<GenerateQRResponse>;
  /** List your QR code generations (paginated). */
  history(options?: ListOptions): Promise<HistoryResponse>;
}

export interface CheckoutsNamespace {
  /** Create a fiat-denominated checkout; the payer picks the stablecoin and network on the Toreador-hosted payment request page and pays wallet-to-wallet to recipientAddress. */
  create(params: CreateCheckoutRequest, options?: RequestOptions): Promise<CheckoutResponse>;
}

export interface SessionsNamespace {
  /** Create a token-denominated payment session (advanced flow). */
  create(params: CreateSessionRequest, options?: RequestOptions): Promise<CreateSessionResponse>;
  /** List your payment sessions (paginated), with reference-rate provenance and checkout correlation. */
  list(options?: ListOptions): Promise<SessionsListResponse>;
  /** Check the status of a session by id. */
  getStatus(sessionId: string): Promise<PaymentStatusResponse>;
}

export interface PaymentsNamespace {
  /** Retrieve a unified Payment object by session id or checkout id (`co_…`), with its timeline. */
  retrieve(id: string): Promise<UnifiedPayment>;
  /** Accounting export of payments confirmed on-chain, with reference-rate provenance. JSON by default; `format: "csv"` returns the CSV text. */
  export(options?: ExportOptions & { format?: "json" }): Promise<ExportJsonResponse>;
  export(options: ExportOptions & { format: "csv" }): Promise<string>;
  /** The import file of an accounting software (QuickBooks, Xero, Odoo, Pennylane), as CSV text; you import it yourself. */
  export(options: AccountingExportOptions): Promise<string>;
}

export interface AccountNamespace {
  /** Plan, environment, subscription truth, quota and limits of the key's account. */
  get(): Promise<AccountResponse>;
  /** Receiving wallets registered on the account (read-only). */
  wallets(): Promise<WalletsResponse>;
  /** Establishments of the key's organization (read-only). */
  establishments(): Promise<EstablishmentsResponse>;
}

export interface TokensNamespace {
  /** Supported payment matrix (tokens × chains) for the key's environment, with explorer templates. */
  list(): Promise<TokensResponse>;
}

export interface WebhooksClientNamespace {
  /** Register (or update, idempotent by URL) your webhook endpoint. The secret is returned once. */
  register(params: RegisterWebhookRequest): Promise<RegisterWebhookResponse>;
  /** List the endpoints of the key's environment (never the secrets): a test key only sees test endpoints. */
  list(): Promise<{ success: boolean; data: WebhookEndpoint[] }>;
  /** Delete an endpoint. */
  delete(id: string): Promise<{ success: boolean }>;
}

export interface ComplianceNamespace {
  /** Sanctions screening of an address (OFAC/EU/UN). */
  screen(address: string): Promise<ScreenResponse>;
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
const KEY_PREFIXES = ["tor_live_", "tor_test_"];

function query(params: Record<string, string | number | undefined>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") p.set(k, String(v));
  }
  const s = p.toString();
  return s ? `?${s}` : "";
}

export class Toreador {
  public readonly qrcode: QRCodeNamespace;
  public readonly checkouts: CheckoutsNamespace;
  public readonly sessions: SessionsNamespace;
  public readonly payments: PaymentsNamespace;
  public readonly account: AccountNamespace;
  public readonly tokens: TokensNamespace;
  public readonly webhooks: WebhooksClientNamespace;
  public readonly compliance: ComplianceNamespace;

  constructor(options: ToreadorOptions) {
    if (!options.apiKey) {
      throw new Error("Toreador: apiKey is required");
    }
    if (!KEY_PREFIXES.some((p) => options.apiKey.startsWith(p))) {
      throw new Error('Toreador: apiKey must start with "tor_live_" or "tor_test_"');
    }

    internals.set(this, {
      apiKey: options.apiKey,
      baseURL: (options.baseURL || "https://toreador.io/api/v1/public").replace(/\/+$/, ""),
      fetchImpl: options.fetch || globalThis.fetch,
      timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      userSignal: options.signal,
    });

    this.qrcode = {
      generate: (params, options) => this.request<GenerateQRResponse>("POST", "/generate-qr", params, options),
      history: (options) => this.request<HistoryResponse>("GET", `/history${query({ limit: options?.limit, cursor: options?.cursor, establishment_id: options?.establishment_id })}`),
    };

    this.checkouts = {
      create: (params, options) => this.request<CheckoutResponse>("POST", "/checkout", params, options),
    };

    this.sessions = {
      create: (params, options) => this.request<CreateSessionResponse>("POST", "/create-session", params, options),
      list: (options) => this.request<SessionsListResponse>("GET", `/sessions${query({ limit: options?.limit, cursor: options?.cursor, establishment_id: options?.establishment_id })}`),
      getStatus: (id) => this.request<PaymentStatusResponse>("GET", `/payment/${encodeURIComponent(id)}/status`),
    };

    const exportPayments = (options?: ExportOptions & { format?: "json" | "csv" | AccountingFormat; currency?: string }) => {
      // The API answers CSV when no format is given: JSON, the default of this method, is asked for by name.
      const format = options?.format ?? "json";
      const path = `/export${query({ from: options?.from, to: options?.to, format, currency: options?.currency, establishment_id: options?.establishment_id })}`;
      // Everything but JSON is a file: its text is returned as is.
      return format === "json"
        ? this.request<ExportJsonResponse>("GET", path)
        : this.request<string>("GET", path, undefined, undefined, "text");
    };
    this.payments = {
      retrieve: (id) => this.request<UnifiedPayment>("GET", `/payment/${encodeURIComponent(id)}`),
      export: exportPayments as PaymentsNamespace["export"],
    };

    this.account = {
      get: () => this.request<AccountResponse>("GET", "/account"),
      wallets: () => this.request<WalletsResponse>("GET", "/wallets"),
      establishments: () => this.request<EstablishmentsResponse>("GET", "/establishments"),
    };

    this.tokens = {
      list: () => this.request<TokensResponse>("GET", "/tokens"),
    };

    this.webhooks = {
      register: (params) => this.request<RegisterWebhookResponse>("POST", "/webhooks", params),
      list: () => this.request<{ success: boolean; data: WebhookEndpoint[] }>("GET", "/webhooks"),
      delete: (id) => this.request<{ success: boolean }>("DELETE", `/webhooks/${encodeURIComponent(id)}`),
    };

    this.compliance = {
      screen: (address) => this.request<ScreenResponse>("GET", `/screen${query({ address })}`),
    };
  }

  /** Connectivity and key check: environment, plan, owner email, API version. */
  ping(): Promise<PingResponse> {
    return this.request<PingResponse>("GET", "/ping");
  }

  private async request<T>(
    method: "GET" | "POST" | "DELETE",
    path: string,
    body?: unknown,
    options?: RequestOptions,
    parse: "json" | "text" = "json",
  ): Promise<T> {
    const ctx = internals.get(this);
    if (!ctx) {
      throw new Error("Toreador: client internals missing (constructor not run?)");
    }

    const url = `${ctx.baseURL}${path}`;

    const headers: Record<string, string> = {
      "X-API-Key": ctx.apiKey,
      "Accept": parse === "text" ? "text/csv, application/json" : "application/json",
    };

    if (options?.idempotencyKey) {
      headers["Idempotency-Key"] = options.idempotencyKey;
    }

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

    if (parse === "text" && res.ok) {
      return (await res.text()) as unknown as T;
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

export interface WebhooksNamespace {
  /**
   * Verify the `Toreador-Signature` header against the raw request body and your endpoint signing secret, then parse
   * the body as a Toreador event. Throws a `WebhookSignatureError` when the signature does not match.
   *
   * Pass the RAW body, exactly as received: a parsed then re-serialised JSON object does not match the signature.
   *
   *   app.post("/webhook", express.raw({ type: "application/json" }), async (req, res) => {
   *     try {
   *       const event = await Toreador.webhooks.constructEvent<SessionEventData>(
   *         req.body.toString("utf8"),
   *         req.header("Toreador-Signature"),
   *         process.env.TOREADOR_WEBHOOK_SECRET!,
   *       );
   *       // handle event.type, then acknowledge
   *       res.sendStatus(200);
   *     } catch (err) {
   *       if (err instanceof WebhookSignatureError) return res.sendStatus(400);
   *       throw err;
   *     }
   *   });
   *
   * @param rawBody          The exact body the server received, as a UTF-8 string.
   * @param signatureHeader  The full `Toreador-Signature` header value (`t=<unix>,v1=<hex>`).
   * @param secret           Your endpoint signing secret (`whsec_…`).
   * @param toleranceSeconds Maximum age of the signature and maximum clock skew. Defaults to 300 (5 minutes).
   */
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

const webhookHelpers: WebhooksNamespace = {
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

/** Webhook helpers, also reachable as `Toreador.webhooks`. */
export const webhooks: WebhooksNamespace = webhookHelpers;

// Merged with the class: `Toreador.webhooks.constructEvent(…)` needs no client instance, hence no API key.
// deno-lint-ignore no-namespace
export namespace Toreador {
  export const webhooks: WebhooksNamespace = webhookHelpers;
}
