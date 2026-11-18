// SDK tests (node:test), run against the build in dist/.
import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { Toreador, ToreadorError, webhooks, WebhookSignatureError } from "../dist/index.js";

// Client with a mocked fetch that records every request.
function mockClient(responseBody = { success: true }, status = 200, contentType = "application/json") {
  const calls = [];
  const fetchImpl = (url, init) => {
    calls.push({ url, init });
    const body = typeof responseBody === "string" ? responseBody : JSON.stringify(responseBody);
    return Promise.resolve(new Response(body, { status, headers: { "Content-Type": contentType } }));
  };
  const client = new Toreador({ apiKey: "tor_test_abc", fetch: fetchImpl });
  return { client, calls };
}

test("accepts live and test keys, rejects anything else", () => {
  assert.ok(new Toreador({ apiKey: "tor_live_x" }));
  assert.ok(new Toreador({ apiKey: "tor_test_x" }));
  assert.throws(() => new Toreador({ apiKey: "tdr_old" }), /tor_live_/);
  assert.throws(() => new Toreador({ apiKey: "" }), /required/);
});

test("qrcode.history serialises pagination", async () => {
  const { client, calls } = mockClient();
  await client.qrcode.history({ limit: 5, cursor: "abc123" });
  assert.ok(calls[0].url.endsWith("/history?limit=5&cursor=abc123"), calls[0].url);
  assert.equal(calls[0].init.method, "GET");
  assert.equal(calls[0].init.headers["X-API-Key"], "tor_test_abc");
});

test("checkouts.create posts the body and the Idempotency-Key", async () => {
  const { client, calls } = mockClient({ success: true, checkoutId: "co_1", url: "/pay/co_1" });
  const co = await client.checkouts.create(
    { amount: 49.9, currency: "USD", recipientAddress: "0xabc", reference: "order-12", rails: [{ token: "USDC", chain: "base" }] },
    { idempotencyKey: "order-12" },
  );
  assert.equal(co.checkoutId, "co_1");
  assert.ok(calls[0].url.endsWith("/checkout"));
  assert.equal(calls[0].init.method, "POST");
  assert.equal(calls[0].init.headers["Idempotency-Key"], "order-12");
  assert.deepEqual(JSON.parse(calls[0].init.body).rails, [{ token: "USDC", chain: "base" }]);
});

test("sessions.create sends the Idempotency-Key", async () => {
  const { client, calls } = mockClient({ success: true, sessionId: "abc" });
  await client.sessions.create({ token: "USDC", chainId: "polygon", amount: "10", recipientAddress: "0x" }, { idempotencyKey: "key-123" });
  assert.equal(calls[0].init.headers["Idempotency-Key"], "key-123");
});

test("payments.retrieve accepts checkout ids", async () => {
  const { client, calls } = mockClient({ success: true, id: "co_9", object: "payment" });
  await client.payments.retrieve("co_9");
  assert.ok(calls[0].url.endsWith("/payment/co_9"), calls[0].url);
});

test("payments.export returns JSON by default and raw CSV on demand", async () => {
  const json = mockClient({ success: true, count: 0, truncated: false, data: [] });
  const out = await json.client.payments.export({ from: 1, to: 2 });
  assert.equal(out.count, 0);
  // The API answers CSV when no format is given: JSON has to be asked for by name.
  assert.ok(json.calls[0].url.endsWith("/export?from=1&to=2&format=json"), json.calls[0].url);
  const bare = mockClient({ success: true, count: 0, truncated: false, data: [] });
  await bare.client.payments.export();
  assert.ok(bare.calls[0].url.endsWith("/export?format=json"), bare.calls[0].url);
  const csv = mockClient("id,completedAt\n", 200, "text/csv");
  const text = await csv.client.payments.export({ format: "csv" });
  assert.equal(text, "id,completedAt\n");
  assert.ok(csv.calls[0].url.endsWith("/export?format=csv"));
});

test("establishments: list, filter on lists and export", async () => {
  const { client, calls } = mockClient({ success: true, data: [] });
  await client.account.establishments();
  await client.sessions.list({ limit: 10, establishment_id: "est_1" });
  await client.qrcode.history({ establishment_id: "est_1" });
  await client.payments.export({ from: 1, establishment_id: "est_1" });
  assert.ok(calls[0].url.endsWith("/establishments"), calls[0].url);
  assert.ok(calls[1].url.endsWith("/sessions?limit=10&establishment_id=est_1"), calls[1].url);
  assert.ok(calls[2].url.endsWith("/history?establishment_id=est_1"), calls[2].url);
  assert.ok(calls[3].url.endsWith("/export?from=1&format=json&establishment_id=est_1"), calls[3].url);
});

test("payments.export returns the import file of an accounting software as text", async () => {
  const file = "Date,Description,Amount\r\n04/10/2026,Toreador - 40 EURC (Base) - p_1,40.00\r\n";
  const { client, calls } = mockClient(file, 200, "text/csv");
  const text = await client.payments.export({ format: "quickbooks", currency: "EUR", from: 1, to: 2 });
  assert.equal(text, file);
  assert.ok(calls[0].url.endsWith("/export?from=1&to=2&format=quickbooks&currency=EUR"), calls[0].url);
  for (const format of ["xero", "odoo", "pennylane"]) {
    const other = mockClient("x", 200, "text/csv");
    assert.equal(await other.client.payments.export({ format }), "x");
    assert.ok(other.calls[0].url.endsWith(`/export?format=${format}`), other.calls[0].url);
  }
});

test("account, tokens, wallets, screen and webhooks target the right routes", async () => {
  const { client, calls } = mockClient({ success: true, data: [], wallets: [], tokens: [], chains: [] });
  await client.account.get();
  await client.account.wallets();
  await client.tokens.list();
  await client.compliance.screen("0xabc");
  await client.webhooks.register({ url: "https://example.test/hook" });
  await client.webhooks.list();
  await client.webhooks.delete("whk_1");
  await client.ping();
  const paths = calls.map((c) => c.init.method + " " + c.url.replace(/^.*\/api\/v1\/public/, ""));
  assert.deepEqual(paths, [
    "GET /account", "GET /wallets", "GET /tokens", "GET /screen?address=0xabc",
    "POST /webhooks", "GET /webhooks", "DELETE /webhooks/whk_1", "GET /ping",
  ]);
});

test("ToreadorError exposes the typed details", async () => {
  const body = {
    error: "Payment quota reached (150/150 per month).",
    error_details: { code: "quota_exceeded", type: "payment_required", message: "…", request_id: "req_1", doc_url: "https://toreador.io/docs/errors#quota_exceeded", used: 150, limit: 150, upgrade_url: "/billing/upgrade?from=api" },
  };
  const { client } = mockClient(body, 402);
  await assert.rejects(() => client.checkouts.create({ amount: 1, currency: "USD", recipientAddress: "0x" }), (err) => {
    assert.ok(err instanceof ToreadorError);
    assert.equal(err.status, 402);
    assert.equal(err.code, "quota_exceeded");
    assert.equal(err.type, "payment_required");
    assert.equal(err.requestId, "req_1");
    assert.equal(err.isQuotaExceeded, true);
    assert.equal(err.isRateLimited, false);
    assert.equal(err.details.upgrade_url, "/billing/upgrade?from=api");
    return true;
  });
});

test("constructEvent — valid HMAC signature", async () => {
  const secret = "whsec_test";
  const body = JSON.stringify({ id: "evt_1", type: "session.completed", createdAt: 1, test: true, data: { sessionId: "ps_1", reference: "order-1042" } });
  const t = Math.floor(Date.now() / 1000);
  const sig = crypto.createHmac("sha256", secret).update(`${t}.${body}`).digest("hex");
  const event = await webhooks.constructEvent(body, `t=${t},v1=${sig}`, secret);
  assert.equal(event.type, "session.completed");
  assert.equal(event.test, true);
  assert.equal(event.data.reference, "order-1042");
});

test("Toreador.webhooks is the named export, without a client and without a global variable", async () => {
  assert.equal(Toreador.webhooks, webhooks);
  assert.equal(typeof Toreador.webhooks.constructEvent, "function");
  assert.deepEqual(Object.keys(globalThis).filter((k) => k.toLowerCase().includes("toreador")), []);
});

test("constructEvent — rejects an invalid signature", async () => {
  const body = JSON.stringify({ id: "evt_1", type: "x", createdAt: 1, data: {} });
  const t = Math.floor(Date.now() / 1000);
  await assert.rejects(() => webhooks.constructEvent(body, `t=${t},v1=deadbeef`, "whsec_test"), WebhookSignatureError);
});

test("constructEvent — rejects a timestamp outside the tolerance window", async () => {
  const secret = "whsec_test";
  const body = JSON.stringify({ id: "e", type: "x", createdAt: 1, data: {} });
  const t = Math.floor(Date.now() / 1000) - 10_000;
  const sig = crypto.createHmac("sha256", secret).update(`${t}.${body}`).digest("hex");
  await assert.rejects(() => webhooks.constructEvent(body, `t=${t},v1=${sig}`, secret), WebhookSignatureError);
});

test("constructEvent — missing header", async () => {
  await assert.rejects(() => webhooks.constructEvent("{}", null, "s"), WebhookSignatureError);
});
