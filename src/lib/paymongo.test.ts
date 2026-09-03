import { describe, expect, it } from "vitest";

import { verifyWebhookSignature } from "./paymongo.server";

const SECRET = "whsk_test_dummy_secret_for_unit_test";

async function sign(timestamp: string, body: string, secret = SECRET) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const bytes = await crypto.subtle.sign("HMAC", key, enc.encode(`${timestamp}.${body}`));
  return Array.from(new Uint8Array(bytes))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

describe("PayMongo webhook signature", () => {
  const body = JSON.stringify({ data: { id: "evt_1", attributes: { type: "subscription.activated" } } });

  it("accepts a valid test-mode (te) signature", async () => {
    const t = "1717000000";
    const sig = await sign(t, body);
    expect(await verifyWebhookSignature(body, `t=${t},te=${sig},li=`, SECRET)).toBe(true);
  });

  it("accepts a valid live-mode (li) signature", async () => {
    const t = "1717000001";
    const sig = await sign(t, body);
    expect(await verifyWebhookSignature(body, `t=${t},te=,li=${sig}`, SECRET)).toBe(true);
  });

  it("rejects a tampered body", async () => {
    const t = "1717000002";
    const sig = await sign(t, body);
    expect(await verifyWebhookSignature(body + " ", `t=${t},te=${sig}`, SECRET)).toBe(false);
  });

  it("rejects when the secret is missing", async () => {
    const t = "1717000003";
    const sig = await sign(t, body);
    expect(await verifyWebhookSignature(body, `t=${t},te=${sig}`, null)).toBe(false);
  });

  it("rejects a malformed header", async () => {
    expect(await verifyWebhookSignature(body, "garbage", SECRET)).toBe(false);
  });
});
