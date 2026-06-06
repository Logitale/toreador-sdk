// SDK tests (node:test) — exécutés contre le build dist/.
import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { Toreador, webhooks, WebhookSignatureError } from "../dist/index.js";

// ---- Helper : client avec fetch mocké qui capture la dernière requête ----
function mockClient(responseBody = { success: true }, status = 200) {
  const calls = [];
  const fetchImpl = (url, init) => {
    calls.push({ url, init });
    return Promise.resolve(
      new Response(JSON.stringify(responseBody), {
        status,
        headers: { "Content-Type": "application/json" },
      }),
    );
  };
  const client = new Toreador({ apiKey: "tdr_test", fetch: fetchImpl });
  return { client, calls };
}

test("qrcode.history sérialise la pagination en query string", async () => {
  const { client, calls } = mockClient();
  await client.qrcode.history({ limit: 5, cursor: "abc123" });
  assert.equal(calls.length, 1);
  assert.ok(calls[0].url.endsWith("/history?limit=5&cursor=abc123"), calls[0].url);
  assert.equal(calls[0].init.method, "GET");
  assert.equal(calls[0].init.headers["X-API-Key"], "tdr_test");
});

test("sessions.create envoie l'en-tête Idempotency-Key", async () => {
  const { client, calls } = mockClient({ success: true, sessionId: "abc" });
  await client.sessions.create(
    { token: "USDC", chainId: "polygon", amount: "10", recipientAddress: "0x" },
    { idempotencyKey: "key-123" },
  );
  assert.equal(calls[0].init.headers["Idempotency-Key"], "key-123");
  assert.equal(calls[0].init.method, "POST");
});

test("payments.retrieve cible GET /payment/:id", async () => {
  const { client, calls } = mockClient({ success: true, id: "p1", object: "payment" });
  await client.payments.retrieve("3f9a1c2b");
  assert.ok(calls[0].url.endsWith("/payment/3f9a1c2b"), calls[0].url);
  assert.equal(calls[0].init.method, "GET");
});

test("constructEvent — signature HMAC valide", async () => {
  const secret = "whsec_test";
  const body = JSON.stringify({ id: "evt_1", type: "session.completed", createdAt: 1, data: {} });
  const t = Math.floor(Date.now() / 1000);
  const sig = crypto.createHmac("sha256", secret).update(`${t}.${body}`).digest("hex");
  const event = await webhooks.constructEvent(body, `t=${t},v1=${sig}`, secret);
  assert.equal(event.type, "session.completed");
});

test("constructEvent — rejette une signature invalide", async () => {
  const body = JSON.stringify({ id: "evt_1", type: "x", createdAt: 1, data: {} });
  const t = Math.floor(Date.now() / 1000);
  await assert.rejects(
    () => webhooks.constructEvent(body, `t=${t},v1=deadbeef`, "whsec_test"),
    WebhookSignatureError,
  );
});

test("constructEvent — rejette un timestamp hors tolérance", async () => {
  const secret = "whsec_test";
  const body = JSON.stringify({ id: "e", type: "x", createdAt: 1, data: {} });
  const t = Math.floor(Date.now() / 1000) - 10_000; // trop vieux
  const sig = crypto.createHmac("sha256", secret).update(`${t}.${body}`).digest("hex");
  await assert.rejects(
    () => webhooks.constructEvent(body, `t=${t},v1=${sig}`, secret),
    WebhookSignatureError,
  );
});

test("constructEvent — header manquant", async () => {
  await assert.rejects(() => webhooks.constructEvent("{}", null, "s"), WebhookSignatureError);
});
