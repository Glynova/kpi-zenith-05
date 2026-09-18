import { describe, expect, it } from "vitest";

import { verifyWebhookSignature } from "./paymongo.server";
import { cycleKeyFor } from "./paymongo-events";

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
  const body = JSON.stringify({
    data: { id: "evt_1", attributes: { type: "subscription.activated" } },
  });

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

import {
  INVOICE_STATUS_MAP,
  nextStatusAfterFailure,
  SUBSCRIPTION_STATUS_MAP,
} from "./paymongo-events";

describe("PayMongo event mapping", () => {
  it("maps the subscription events we subscribe to", () => {
    expect(SUBSCRIPTION_STATUS_MAP["subscription.activated"]).toBe("active");
    expect(SUBSCRIPTION_STATUS_MAP["subscription.updated"]).toBe("active");
    expect(SUBSCRIPTION_STATUS_MAP["subscription.past_due"]).toBe("past_due");
    expect(SUBSCRIPTION_STATUS_MAP["subscription.unpaid"]).toBe("unpaid");
    expect(SUBSCRIPTION_STATUS_MAP["subscription.cancelled"]).toBe("cancelled");
  });

  it("maps the invoice events we subscribe to", () => {
    expect(INVOICE_STATUS_MAP["subscription.invoice.created"]).toBe("open");
    expect(INVOICE_STATUS_MAP["subscription.invoice.finalized"]).toBe("open");
    expect(INVOICE_STATUS_MAP["subscription.invoice.paid"]).toBe("paid");
    expect(INVOICE_STATUS_MAP["subscription.invoice.payment_failed"]).toBe("payment_failed");
  });

  it("ignores unknown events", () => {
    expect(SUBSCRIPTION_STATUS_MAP["some.unknown.event"]).toBeUndefined();
    expect(INVOICE_STATUS_MAP["some.unknown.event"]).toBeUndefined();
  });

  it("escalates active -> past_due -> unpaid on repeated failures", () => {
    expect(nextStatusAfterFailure("active")).toBe("past_due");
    expect(nextStatusAfterFailure("trialing")).toBe("past_due");
    expect(nextStatusAfterFailure("past_due")).toBe("unpaid");
    expect(nextStatusAfterFailure("unpaid")).toBe("unpaid");
  });
});

describe("cycleKeyFor", () => {
  it("gives invoice.paid and payment.paid the same key within one cycle", () => {
    const sub = { id: "s1", current_period_start: "2026-09-01T00:00:00.000Z" };
    expect(cycleKeyFor(sub, { amount: 99900 }, "inv_1")).toBe(
      cycleKeyFor(sub, { amount: 99900 }, null),
    );
  });

  it("changes key when the billing period advances", () => {
    const a = cycleKeyFor({ id: "s1", current_period_start: "2026-09-01T00:00:00.000Z" }, {});
    const b = cycleKeyFor({ id: "s1", current_period_start: "2026-10-01T00:00:00.000Z" }, {});
    expect(a).not.toBe(b);
  });

  it("falls back to the invoice id when no period is known", () => {
    expect(cycleKeyFor({ id: "s1", current_period_start: null }, {}, "inv_9")).toBe(
      "invoice:inv_9",
    );
  });

  it("returns null without a subscription", () => {
    expect(cycleKeyFor(null, {})).toBeNull();
  });
});
