/**
 * Minimal PayMongo REST client. Server-only: secret keys are read from the
 * environment inside each call and never returned to the browser.
 *
 * PayMongo's automated subscriptions product must be activated on the merchant
 * account before recurring billing works, and currently covers Visa/Mastercard
 * cards and Maya. Until credentials + activation exist, `isConfigured()` is
 * false and the app stays in a clearly labelled unconfigured/test state.
 */

const BASE = "https://api.paymongo.com/v1";

export type PayMongoConfig = {
  secretKey: string | null;
  publicKey: string | null;
  /** PayMongo keys are prefixed sk_test_ / sk_live_. */
  mode: "test" | "live" | "unknown";
  configured: boolean;
};

export function readConfig(): PayMongoConfig {
  const secretKey =
    process.env["PAYMONGO_SECRET_KEY"] || process.env["Secret_key"] || null;
  const publicKey =
    process.env["PAYMONGO_PUBLIC_KEY"] || process.env["Public_key"] || null;
  const mode = secretKey?.startsWith("sk_live_")
    ? "live"
    : secretKey?.startsWith("sk_test_")
      ? "test"
      : "unknown";
  return { secretKey, publicKey, mode, configured: !!secretKey };
}

/** The webhook signing secret, accepting either configured name. */
export function readWebhookSecret(): string | null {
  return (
    process.env["PAYMONGO_WEBHOOK_SECRET"] ||
    process.env["Webhook_Secret"] ||
    process.env["WEBHOOK_SECRET"] ||
    null
  );
}

export class PayMongoError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function request<T>(
  path: string,
  init: { method?: string; body?: unknown; idempotencyKey?: string } = {},
): Promise<T> {
  const { secretKey } = readConfig();
  if (!secretKey) throw new PayMongoError("PayMongo is not configured", 503);

  const headers: Record<string, string> = {
    Authorization: `Basic ${btoa(`${secretKey}:`)}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  if (init.idempotencyKey) headers["Idempotency-Key"] = init.idempotencyKey;

  const res = await fetch(`${BASE}${path}`, {
    method: init.method ?? "GET",
    headers,
    body: init.body ? JSON.stringify({ data: { attributes: init.body } }) : undefined,
  });

  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    /* non-JSON error body */
  }

  if (!res.ok) {
    const detail =
      (json as { errors?: { detail?: string }[] } | null)?.errors?.[0]?.detail ??
      `PayMongo request failed (${res.status})`;
    throw new PayMongoError(detail, res.status);
  }
  return json as T;
}

type Resource = { data: { id: string; attributes: Record<string, unknown> } };

export const paymongo = {
  isConfigured: () => readConfig().configured,

  /** Create (or reuse) a recurring plan in PHP centavos. */
  async createPlan(input: { name: string; amount: number; description?: string }) {
    return request<Resource>("/plans", {
      method: "POST",
      body: {
        name: input.name,
        description: input.description,
        amount: Math.round(input.amount * 100),
        currency: "PHP",
        interval: "month",
        interval_count: 1,
      },
      idempotencyKey: `plan-${input.name}-${input.amount}`,
    });
  },

  async createCustomer(input: {
    firstName: string;
    lastName: string;
    email: string;
    phone?: string;
    idempotencyKey: string;
  }) {
    return request<Resource>("/customers", {
      method: "POST",
      body: {
        first_name: input.firstName,
        last_name: input.lastName,
        email: input.email,
        phone: input.phone ?? "",
        default_device: "email",
      },
      idempotencyKey: input.idempotencyKey,
    });
  },

  async createSubscription(input: {
    customerId: string;
    planId: string;
    paymentMethodId?: string;
    idempotencyKey: string;
  }) {
    return request<Resource>("/subscriptions", {
      method: "POST",
      body: {
        customer_id: input.customerId,
        plan_id: input.planId,
        payment_method_id: input.paymentMethodId,
      },
      idempotencyKey: input.idempotencyKey,
    });
  },

  async getSubscription(id: string) {
    return request<Resource>(`/subscriptions/${id}`);
  },

  async cancelSubscription(id: string) {
    return request<Resource>(`/subscriptions/${id}/cancel`, { method: "POST", body: {} });
  },
};

/**
 * Verify a PayMongo webhook signature header:
 *   t=<timestamp>,te=<test sig>,li=<live sig>
 * signed payload is `${t}.${rawBody}` with HMAC-SHA256 of the webhook secret.
 */
export async function verifyWebhookSignature(
  rawBody: string,
  header: string | null,
  secret: string | null,
): Promise<boolean> {
  if (!secret) return false;
  if (!header) return false;
  const parts = Object.fromEntries(
    header.split(",").map((p) => {
      const [k, v] = p.split("=");
      return [k?.trim(), v?.trim()];
    }),
  ) as Record<string, string | undefined>;

  const timestamp = parts["t"];
  // te = test-mode signature, li = live-mode signature. Either may be present;
  // accept the one that matches so the same endpoint serves both modes.
  const candidates = [parts["te"], parts["li"]].filter(Boolean) as string[];
  if (!timestamp || candidates.length === 0) return false;

  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sigBytes = await crypto.subtle.sign("HMAC", key, enc.encode(`${timestamp}.${rawBody}`));
  const expected = Array.from(new Uint8Array(sigBytes))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return candidates.some((provided) => {
    if (expected.length !== provided.length) return false;
    let diff = 0;
    for (let i = 0; i < expected.length; i++)
      diff |= expected.charCodeAt(i) ^ provided.charCodeAt(i);
    return diff === 0;
  });
}
