# @toreador/sdk

[![npm version](https://img.shields.io/npm/v/@toreador/sdk.svg)](https://www.npmjs.com/package/@toreador/sdk)
[![npm downloads](https://img.shields.io/npm/dm/@toreador/sdk.svg)](https://www.npmjs.com/package/@toreador/sdk)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-%E2%89%A518-green.svg)](https://nodejs.org/)

Official TypeScript SDK for the [Toreador](https://toreador.io) API.

Accept crypto payments without holding funds: you invoice in **USD or EUR**, the payer
picks a **stablecoin and a network** (USDC, USDT, EURC and more on Ethereum, Base, Polygon,
Arbitrum, BNB Chain, Avalanche, Solana) or native crypto, and the payment goes straight to
the wallet registered on your account. You are notified of the on-chain confirmation through
**HMAC-signed webhooks** or by polling. Zero dependencies.

## Table of contents

- [Installation](#installation)
- [Quick start](#quick-start)
- [API reference](#api-reference)
- [Errors](#errors)
- [Webhooks](#webhooks)
- [Test keys and sandbox](#test-keys-and-sandbox)
- [Timeouts and cancellation](#timeouts-and-cancellation)
- [Links](#links)

## Installation

```bash
npm install @toreador/sdk
```

> **Server-side only.** The SDK takes your secret API key (`tor_live_…` or `tor_test_…`).
> Never ship it to a browser or a mobile app. For browser checkouts, redirect the customer
> to the hosted payment URL returned by `checkouts.create()` (the payer pays wallet-to-wallet).

## Quick start

```typescript
import Toreador from "@toreador/sdk";

const client = new Toreador({ apiKey: process.env.TOREADOR_API_KEY! });

// 1. Pick one of the wallets registered on your account (read-only).
const { wallets } = await client.account.wallets();

// 2. Create a checkout for an invoice of 49.90 USD.
const checkout = await client.checkouts.create(
  {
    amount: 49.9,
    currency: "USD",
    recipientAddress: wallets[0].address,
    reference: "order-1042",       // your own id, echoed in webhooks
    description: "Order #1042",
  },
  { idempotencyKey: "order-1042" }, // safe to retry
);

// 3. Send the customer to the hosted payment page (the payer pays wallet-to-wallet).
console.log(checkout.url);

// 4. Later: the unified payment object (by checkout id or session id).
const payment = await client.payments.retrieve(checkout.checkoutId);
console.log(payment.status, payment.txHash);
```

## API reference

### `new Toreador(options)`

| Option      | Type       | Required | Description |
|-------------|------------|----------|-------------|
| `apiKey`    | `string`   | Yes      | `tor_live_…` or `tor_test_…`, from your dashboard. |
| `baseURL`   | `string`   | No       | Defaults to `https://toreador.io/api/v1/public`. |
| `fetch`     | `function` | No       | Custom fetch implementation. |
| `timeoutMs` | `number`   | No       | Per-request timeout, default 30 000. `0` disables it. |
| `signal`    | `AbortSignal` | No    | Applied to every request. |

### Checkouts

| Method | Route | Notes |
|---|---|---|
| `client.checkouts.create(params, { idempotencyKey? })` | `POST /checkout` | `amount`, `currency` (USD/EUR), `recipientAddress` (a registered wallet), optional `reference`, `description`, `conversion`, `acceptNative`, `rails`, `source`. Returns `checkoutId`, `url`, `allowedRails`, `expiresAt`. |

### Payments

| Method | Route | Notes |
|---|---|---|
| `client.payments.retrieve(id)` | `GET /payment/{id}` | Unified payment object with timeline; `id` is a session id or a checkout id (`co_…`). |
| `client.payments.export({ from?, to?, format?, establishment_id? })` | `GET /export` | Payments observed as confirmed on-chain, with indicative reference-rate provenance (rate, source, timestamp). JSON by default; `format: "csv"` returns the CSV text. |
| `client.payments.export({ format: "quickbooks" \| "xero" \| "odoo" \| "pennylane", currency? })` | `GET /export` | The bank-transaction import file of that accounting software, as CSV text: one currency per file, confirmed payments only. You import it yourself; Toreador does not connect to these products. |

### Sessions (advanced, token-denominated)

| Method | Route |
|---|---|
| `client.sessions.create(params, { idempotencyKey? })` | `POST /create-session` |
| `client.sessions.list({ limit?, cursor?, establishment_id? })` | `GET /sessions` |
| `client.sessions.getStatus(sessionId)` | `GET /payment/{id}/status` |

### QR codes (native tokens and Solana SPL)

| Method | Route |
|---|---|
| `client.qrcode.generate({ token, chainId, amount, recipientAddress, format? })` | `POST /generate-qr` |
| `client.qrcode.history({ limit?, cursor?, establishment_id? })` | `GET /history` |

### Account, catalogue, compliance

| Method | Route | Notes |
|---|---|---|
| `client.ping()` | `GET /ping` | Environment, plan, owner email, API version. |
| `client.account.get()` | `GET /account` | Plan, subscription truth, quota (`used`, `limit`, `window`), limits. |
| `client.account.wallets()` | `GET /wallets` | Registered receiving wallets, with `acceptedRails` for exchange wallets and `ownershipProven`. |
| `client.account.establishments()` | `GET /establishments` | Establishments of the key's organization. Payments carry `establishmentId` and `establishmentName`, whoever on the team created them. |
| `client.tokens.list()` | `GET /tokens` | Payable (token, chain) pairs for the key's environment, chain metadata and explorer templates. Fetch it instead of hardcoding. |
| `client.compliance.screen(address)` | `GET /screen` | Sanctions screening (OFAC/EU/UN): `clear`, `sanctioned` or `unknown`. |

### Webhooks

| Method | Route | Notes |
|---|---|---|
| `client.webhooks.register({ url, events?, description? })` | `POST /webhooks` | Idempotent by URL. The signing `secret` is returned once: store it encrypted. The endpoint belongs to the environment of the key. |
| `client.webhooks.list()` | `GET /webhooks` | The endpoints of the key's environment. Never returns secrets. |
| `client.webhooks.delete(id)` | `DELETE /webhooks/{id}` | |

Lists are paginated with a cursor: `{ data, has_more, next_cursor }`.

## Errors

Every non-2xx response throws a `ToreadorError`:

```typescript
import { Toreador, ToreadorError } from "@toreador/sdk";

try {
  await client.checkouts.create({ amount: 10, currency: "USD", recipientAddress: "0x…" });
} catch (err) {
  if (err instanceof ToreadorError) {
    err.status;          // 402
    err.code;            // "quota_exceeded"
    err.type;            // "payment_required"
    err.message;         // human-readable
    err.requestId;       // for support
    err.docUrl;          // link to the error reference
    if (err.isQuotaExceeded) console.log(err.details.upgrade_url);
    if (err.isRateLimited) { /* retry after a short delay */ }
    if (err.isUnauthorized) { /* key revoked: reconnect */ }
  }
}
```

Stable codes you will meet: `invalid_amount`, `unsupported_currency`, `address_not_registered`
(the address is not a wallet of your account), `wallet_provider_unavailable`, `no_rail`,
`quota_exceeded` (402), `rate_limited` (429), `idempotency_conflict` (409). Timeouts and aborts
throw a `ToreadorError` with `status: 0`.

## Webhooks

Toreador signs every delivery with `Toreador-Signature: t=<unix>,v1=<hmac-sha256-hex>` over
`"<t>.<raw body>"`. Verify with a constant-time comparison and a 5-minute tolerance:

```typescript
import { Toreador, WebhookSignatureError, type SessionEventData } from "@toreador/sdk";

app.post("/webhook", express.raw({ type: "application/json" }), async (req, res) => {
  try {
    const event = await Toreador.webhooks.constructEvent<SessionEventData>(
      req.body.toString("utf8"),             // the RAW body
      req.header("Toreador-Signature"),
      process.env.TOREADOR_WEBHOOK_SECRET!,  // whsec_…
    );
    if (event.type === "session.completed" && !event.test) {
      // event.data.reference is your order id; event.data.checkoutId, txHash, amountUsd…
    }
    res.sendStatus(200);                     // 2xx acknowledges; otherwise Toreador retries
  } catch (err) {
    if (err instanceof WebhookSignatureError) return res.sendStatus(400);
    throw err;
  }
});
```

Events: `session.created`, `session.submitted`, `session.confirming`, `session.completed`,
`session.expired`, `session.failed`, `checkout.created`. Deduplicate on `event.id`: a delivery
may be retried.

Every event carries `test`: `true` for the test environment (test key, testnet payment). Never
fulfil a real order on a test event. `data` is typed by `SessionEventData` for the `session.*`
events and by `CheckoutCreatedEventData` for `checkout.created`.

An endpoint registered with a test key only receives test events, and a test key only lists,
replaces or deletes test endpoints; the same holds for a live key and live events.

## Test keys and sandbox

A `tor_test_…` key creates sandbox checkouts and sessions on testnets (Base Sepolia, Ethereum
Sepolia, Polygon Amoy…) outside your quota, with testnet explorer links in `tokens.list()`.
Use it for your integration tests; switch to `tor_live_…` for production.

The two environments are separate: a live key only reads live payments, a test key only reads test
payments (lists, export, and reading a payment by id).

## Timeouts and cancellation

```typescript
const client = new Toreador({
  apiKey: process.env.TOREADOR_API_KEY!,
  timeoutMs: 10_000,
  signal: controller.signal,
});
```

Runs wherever `fetch` and WebCrypto exist: Node.js 18+, Deno, Bun, Cloudflare Workers, Vercel Edge.

## Links

- Website: [toreador.io](https://toreador.io)
- API reference: [toreador.io/api-reference](https://toreador.io/api-reference)
- Pricing: [toreador.io/pricing](https://toreador.io/pricing)

## License

MIT
