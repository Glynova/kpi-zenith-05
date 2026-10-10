import { afterEach, describe, expect, it, vi } from "vitest";

import {
  resolveWebhookSecrets,
  verifyWebhookSignatureDetailed,
} from "./paymongo.server";
import { createQrPhIntent } from "./plan-qrph.server";
import {
  decidePaidEvent,
  extractQrImage,
  nextPeriodEnd,
  sanitizePayMongoError,
  toCentavos,
  type CheckoutForEvent,
} from "./qrph-core";

const NAMES = ["PAYMONGO_WEBHOOK_SECRET", "Paymongo_Webhook_Secret", "PAYMONGO_TEST_WEBHOOK_SECRET", "PAYMONGO_LIVE_WEBHOOK_SECRET"];
afterEach(() => {
  for (const n of NAMES) delete process.env[n];
  vi.unstubAllGlobals();
});

async function sign(secret: string, body: string, t: number, key: "te" | "li") {
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const s = await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(`${t}.${body}`));
  const hex = Array.from(new Uint8Array(s)).map((b) => b.toString(16).padStart(2, "0")).join("");
  return `t=${t},${key}=${hex}`;
}

describe("webhook secret resolution", () => {
  it("reads Paymongo_Webhook_Secret and reports only the name", () => {
    process.env["Paymongo_Webhook_Secret"] = "whsk_a";
    const r = resolveWebhookSecrets();
    expect(r.live).toBe("whsk_a");
    expect(r.sources.live).toBe("Paymongo_Webhook_Secret");
    expect(JSON.stringify(r.sources)).not.toContain("whsk_a");
  });
  it("prefers the standard alias, mode-specific wins", () => {
    process.env["Paymongo_Webhook_Secret"] = "whsk_a";
    process.env["PAYMONGO_WEBHOOK_SECRET"] = "whsk_b";
    process.env["PAYMONGO_TEST_WEBHOOK_SECRET"] = "whsk_t";
    const r = resolveWebhookSecrets();
    expect(r.live).toBe("whsk_b");
    expect(r.test).toBe("whsk_t");
  });
});

describe("signature verification", () => {
  const body = '{"data":{"id":"evt_1"}}';
  it("accepts a valid live signature over the raw body", async () => {
    const t = Math.floor(Date.now() / 1000);
    const h = await sign("whsk_live", body, t, "li");
    const r = await verifyWebhookSignatureDetailed(body, h, { live: "whsk_live" }, { toleranceSeconds: 600 });
    expect(r).toMatchObject({ valid: true, mode: "live" });
  });
  it("rejects wrong secret, tampered body and stale timestamps", async () => {
    const t = Math.floor(Date.now() / 1000);
    const h = await sign("whsk_live", body, t, "li");
    expect((await verifyWebhookSignatureDetailed(body, h, { live: "other" })).valid).toBe(false);
    expect((await verifyWebhookSignatureDetailed(body + " ", h, { live: "whsk_live" })).valid).toBe(false);
    const old = await sign("whsk_live", body, t - 4000, "li");
    expect((await verifyWebhookSignatureDetailed(body, old, { live: "whsk_live" }, { toleranceSeconds: 600 })).valid).toBe(false);
  });
});

describe("amounts and QR parsing", () => {
  it("converts plan prices to centavos", () => {
    expect(toCentavos(999)).toBe(99900);
    expect(toCentavos("1999.00")).toBe(199900);
    expect(() => toCentavos(-1)).toThrow();
  });
  it("extracts next_action.code.image_url", () => {
    expect(extractQrImage({ data: { attributes: { next_action: { code: { image_url: "data:image/png;base64,AA" } } } } })).toBe("data:image/png;base64,AA");
    expect(extractQrImage({ data: { attributes: {} } })).toBeNull();
    expect(extractQrImage({ data: { attributes: { next_action: { code: { image_url: "javascript:x" } } } } })).toBeNull();
  });
  it("sanitizes keys out of errors", () => {
    expect(sanitizePayMongoError(new Error("bad sk_live_abc123 key"))).toBe("bad [key] key");
  });
  it("creates intent → qrph method → attach with server amount", async () => {
    const calls: { url: string; body: any }[] = [];
    vi.stubGlobal("fetch", async (url: string, init: any) => {
      const body = init.body ? JSON.parse(init.body) : null;
      calls.push({ url, body });
      const json = url.endsWith("/payment_intents")
        ? { data: { id: "pi_1", attributes: { client_key: "ck" } } }
        : url.endsWith("/payment_methods")
          ? { data: { id: "pm_1" } }
          : { data: { attributes: { next_action: { code: { image_url: "data:image/png;base64,QQ" } } } } };
      return new Response(JSON.stringify(json), { status: 200 });
    });
    const r = await createQrPhIntent({ base: "http://sim", secret: "sk_test_x", amountCentavos: 99900, description: "d", metadata: {}, idempotencyKey: "k" });
    expect(r).toEqual({ intentId: "pi_1", qrImage: "data:image/png;base64,QQ" });
    expect(calls[0]!.body.data.attributes).toMatchObject({ amount: 99900, currency: "PHP", payment_method_allowed: ["qrph"] });
    expect(calls[1]!.body.data.attributes.type).toBe("qrph");
    expect(calls[2]!.body.data.attributes).toEqual({ payment_method: "pm_1", client_key: "ck" });
  });
  it("surfaces sanitized PayMongo errors", async () => {
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ errors: [{ detail: "qrph not enabled" }] }), { status: 400 }));
    await expect(createQrPhIntent({ base: "http://sim", secret: "s", amountCentavos: 99900, description: "d", metadata: {}, idempotencyKey: "k" })).rejects.toThrow("qrph not enabled");
  });
});

describe("paid event decision", () => {
  const co: CheckoutForEvent = { id: "c1", business_id: "b1", status: "awaiting_action", currency: "PHP", amount_centavos: 99900, test_mode: false, payment_method_type: "qrph", paymongo_payment_intent_id: "pi_1" };
  const ev = { signatureMode: "live" as const, intentId: "pi_1", amount: 99900, currency: "PHP", status: "paid", livemode: true, metadata: { checkout_id: "c1", business_id: "b1" } };
  it("activates only a fully matching verified paid event", () => {
    expect(decidePaidEvent(ev, co).action).toBe("activate");
  });
  it("ignores duplicates and failed/expired checkouts", () => {
    expect(decidePaidEvent(ev, { ...co, status: "succeeded" })).toEqual({ action: "ignore", reason: "duplicate" });
    expect(decidePaidEvent(ev, { ...co, status: "expired" }).action).toBe("ignore");
    expect(decidePaidEvent(ev, null).action).toBe("ignore");
  });
  it("rejects amount, currency, mode, tenant and status mismatches", () => {
    expect(decidePaidEvent({ ...ev, amount: 100 }, co).action).toBe("reject");
    expect(decidePaidEvent({ ...ev, currency: "USD" }, co).action).toBe("reject");
    expect(decidePaidEvent({ ...ev, signatureMode: "test" }, co).action).toBe("reject");
    expect(decidePaidEvent({ ...ev, metadata: { business_id: "b2" } }, co).action).toBe("reject");
    expect(decidePaidEvent({ ...ev, status: "failed" }, co).action).toBe("reject");
  });
  it("renewal extends from the current end for the same plan", () => {
    const now = new Date("2026-01-10T00:00:00Z");
    const r = nextPeriodEnd(now, { plan_id: "p", current_period_end: "2026-01-20T00:00:00Z" }, "p");
    expect(r.end.toISOString()).toBe("2026-02-20T00:00:00.000Z");
  });
});
