# @toreador/sdk

Official TypeScript SDK for the [Toreador](https://toreador.io) crypto QR code API.

Generate QR codes for native crypto payments (BTC, ETH, SOL, POL) and create
payment sessions for EVM stablecoins (USDC, USDT, EURC).

## Installation

```bash
npm install @toreador/sdk
```

> ⚠️ **Server-side only.** This SDK takes your **secret** API key (`tdr_...`).
> Never use it in browser code, mobile apps, or any client-side bundle — the
> key would be visible to every visitor and could be stolen and used against
> your rate limits / quota. For browser checkouts, redirect the user to the
> hosted payment URL returned by `sessions.create()` (`session.url`) instead
> of calling the SDK from the browser.

## Quick Start

```typescript
import Toreador from "@toreador/sdk";

const client = new Toreador({ apiKey: "tdr_your_key_here" });

// Generate a Bitcoin QR code
const qr = await client.qrcode.generate({
  token: "BTC",
  chainId: "bitcoin",
  amount: "0.001",
  recipientAddress: "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh",
});

console.log(qr.qrCodeURL); // data:image/png;base64,...
```

## API Reference

### `new Toreador(options)`

| Option    | Type       | Required | Description                                                                  |
|-----------|------------|----------|------------------------------------------------------------------------------|
| `apiKey`  | `string`   | Yes      | Your API key (`tdr_xxxx`). Get one from your [dashboard](https://toreador.io/dashboard). |
| `baseURL` | `string`   | No       | API base URL. Defaults to `https://toreador.io/api/v1/public`.               |
| `fetch`   | `function` | No       | Custom fetch implementation. Defaults to `globalThis.fetch`.                 |

### `client.qrcode.generate(params)`

Generate a QR code for native tokens (BTC, ETH, SOL, POL) or Solana SPL tokens.

```typescript
const result = await client.qrcode.generate({
  token: "USDC",
  chainId: "solana",
  amount: "250",
  recipientAddress: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
});
```

**Returns:** `{ success, type, qrData, qrCodeURL, token, chain, amount, recipientAddress }`

### `client.qrcode.history()`

List your last 50 QR code generations.

```typescript
const { payments } = await client.qrcode.history();
```

### `client.sessions.create(params)`

Create a payment session for non-native EVM tokens (USDC, USDT, EURC on Ethereum/Polygon/Base).

```typescript
const session = await client.sessions.create({
  token: "USDC",
  chainId: "ethereum",
  amount: "100",
  recipientAddress: "0x742d35Cc6634C0532925a3b844Bc9e7595f2bD18",
});

console.log(session.url);       // Payment page URL
console.log(session.expiresIn); // Seconds until expiry
```

### `client.sessions.list()`

List your last 50 payment sessions.

```typescript
const { sessions } = await client.sessions.list();
```

### `client.sessions.getStatus(sessionId)`

Check the status of a payment session.

```typescript
const status = await client.sessions.getStatus("session_id_here");
console.log(status.status); // 'pending' | 'submitted' | 'confirming' | 'completed' | 'expired' | 'failed'
```

## Error Handling

All API errors throw a `ToreadorError` with `status` and `body` properties:

```typescript
import { Toreador, ToreadorError } from "@toreador/sdk";

try {
  await client.qrcode.generate({ ... });
} catch (err) {
  if (err instanceof ToreadorError) {
    console.error(err.message); // "Missing required fields: ..."
    console.error(err.status);  // 400
    console.error(err.body);    // Full error response
  }
}
```

## Supported Tokens & Chains

| Token | Chains                          | Method             |
|-------|---------------------------------|--------------------|
| BTC   | bitcoin                         | `qrcode.generate`  |
| ETH   | ethereum, polygon, base         | `qrcode.generate`  |
| SOL   | solana                          | `qrcode.generate`  |
| POL   | polygon                         | `qrcode.generate`  |
| USDC  | ethereum, polygon, base, solana | `sessions.create` or `qrcode.generate` (Solana) |
| USDT  | ethereum, polygon, base         | `sessions.create`  |
| EURC  | ethereum, base                  | `sessions.create`  |

## Requirements

- Node.js 18+ (uses native `fetch`)
- Deno (works out of the box)
- Pro plan API key from [toreador.io](https://toreador.io)

**Not for browser use** — see the warning at the top of this file.

## Timeouts and cancellation

Every request has a 30-second default timeout. Override or cancel via:

```typescript
const client = new Toreador({
  apiKey: "tdr_your_key_here",
  timeoutMs: 10_000,           // optional, ms; set to 0 to disable
  signal: someAbortController.signal, // optional, applies to every request
});
```

Timeouts and aborted requests both throw a `ToreadorError` with `status: 0`.

## License

MIT
