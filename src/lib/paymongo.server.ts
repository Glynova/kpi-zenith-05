/**
 * PayMongo REST client. Server-only: secret keys are read from the environment
 * inside each call and never returned to the browser.
 *
 * Test and live credentials are kept strictly apart. Every call is made in an
 * explicit mode, and objects created in one mode are never mixed with the
 * other (plans, customers, subscriptions and webhook secrets are all tracked
 * per mode).
 *
 * Environment variables (either naming style works):
 *   PAYMONGO_MODE                     "test" | "live" (optional; inferred from keys)
 *   PAYMONGO_TEST_SECRET_KEY          sk_test_...
 *   PAYMONGO_TEST_PUBLIC_KEY          pk_test_...
 *   PAYMONGO_TEST_WEBHOOK_SECRET      whsk_... for the test-mode webhook
 *   PAYMONGO_LIVE_SECRET_KEY          sk_live_...
 *   PAYMONGO_LIVE_PUBLIC_KEY          pk_live_...
 *   PAYMONGO_LIVE_WEBHOOK_SECRET      whsk_... for the live-mode webhook
 *   PAYMONGO_SECRET_KEY / Secret_key  generic key, bucketed by its sk_test_/sk_live_ prefix
 *   PAYMONGO_PUBLIC_KEY / Public_key  generic key, bucketed by its pk_test_/pk_live_ prefix
 *   PAYMONGO_WEBHOOK_SECRET / Paymongo_Webhook_Secret / Webhook_Secret / WEBHOOK_SECRET  generic webhook secret
 *   PAYMONGO_API_BASE                 override for the local simulator used by tests
 */

const DEFAULT_BASE = "https://api.paymongo.com/v1";

export type PayMongoMode = "test" | "live";

export type PayMongoConfig = {
  /** The mode the app currently operates in. */
  mode: PayMongoMode;
  secretKey: string | null;
  publicKey: string | null;
  configured: boolean;
  test: { secretKey: string | null; publicKey: string | null; webhookSecret: string | null };
  live: { secretKey: string | null; publicKey: string | null; webhookSecret: string | null };
  apiBase: string;
};

function env(name: string): string | null {
  const v = process.env[name];
  return v && v.trim() ? v.trim() : null;
}

function bucket(prefixTest: string, prefixLive: string, ...names: string[]) {
  let test: string | null = null;
  let live: string | null = null;
  for (const n of names) {
    const v = env(n);
    if (!v) continue;
    if (v.startsWith(prefixTest) && !test) test = v;
    else if (v.startsWith(prefixLive) && !live) live = v;
  }
  return { test, live };
}

/** Generic webhook secret names, in priority order (env names are case-sensitive). */
export const GENERIC_WEBHOOK_SECRET_NAMES = [
  "PAYMONGO_WEBHOOK_SECRET",
  "Paymongo_Webhook_Secret",
  "PayMongo_Webhook_Secret",
  "Webhook_Secret",
  "WEBHOOK_SECRET",
] as const;

export type WebhookSecrets = {
  test: string | null;
  live: string | null;
  /** Env variable NAMES the secrets came from (never the values). */
  sources: { test: string | null; live: string | null };
};

/**
 * The single resolver used by webhook validation AND diagnostics.
 * Mode-specific names win; otherwise the generic secret serves both modes.
 */
export function resolveWebhookSecrets(): WebhookSecrets {
  let genericName: string | null = null;
  let generic: string | null = null;
  for (const n of GENERIC_WEBHOOK_SECRET_NAMES) {
    const v = env(n);
    if (v) {
      generic = v;
      genericName = n;
      break;
    }
  }
  const t = env("PAYMONGO_TEST_WEBHOOK_SECRET");
  const l = env("PAYMONGO_LIVE_WEBHOOK_SECRET");
  return {
    test: t ?? generic,
    live: l ?? generic,
    sources: {
      test: t ? "PAYMONGO_TEST_WEBHOOK_SECRET" : genericName,
      live: l ? "PAYMONGO_LIVE_WEBHOOK_SECRET" : genericName,
    },
  };
}

export function readConfig(): PayMongoConfig {
  const generic = bucket("sk_test_", "sk_live_", "PAYMONGO_SECRET_KEY", "Secret_key", "SECRET_KEY");
  const genericPub = bucket(
    "pk_test_",
    "pk_live_",
    "PAYMONGO_PUBLIC_KEY",
    "Public_key",
    "PUBLIC_KEY",
  );
  const wh = resolveWebhookSecrets();
  const test = {
    secretKey: env("PAYMONGO_TEST_SECRET_KEY") || generic.test,
    publicKey: env("PAYMONGO_TEST_PUBLIC_KEY") || genericPub.test,
    webhookSecret: wh.test,
  };
  const live = {
    secretKey: env("PAYMONGO_LIVE_SECRET_KEY") || generic.live,
    publicKey: env("PAYMONGO_LIVE_PUBLIC_KEY") || genericPub.live,
    webhookSecret: wh.live,
  };

  const explicit = env("PAYMONGO_MODE")?.toLowerCase();
  let mode: PayMongoMode;
  if (explicit === "test" || explicit === "live") mode = explicit;
  else if (test.secretKey && !live.secretKey) mode = "test";
  else if (live.secretKey && !test.secretKey) mode = "live";
  else mode = test.secretKey ? "test" : "live";

  const active = mode === "test" ? test : live;
  return {
    mode,
    secretKey: active.secretKey,
    publicKey: active.publicKey,
    configured: !!active.secretKey,
    test,
    live,
    apiBase: env("PAYMONGO_API_BASE") || DEFAULT_BASE,
  };
}

/** Webhook signing secret for a given mode (falls back to the generic secret). */
export function readWebhookSecret(mode?: PayMongoMode): string | null {
  const cfg = readConfig();
  const m = mode ?? cfg.mode;
  return (m === "test" ? cfg.test.webhookSecret : cfg.live.webhookSecret) ?? null;
}

export class PayMongoError extends Error {
  status: number;
  code: string | null;
  constructor(message: string, status: number, code: string | null = null) {
    super(message);
    this.name = "PayMongoError";
    this.status = status;
    this.code = code;
  }
}

type ApiError = { code?: string; detail?: string; source?: { pointer?: string } };

async function request<T>(
  mode: PayMongoMode,
  path: string,
  init: { method?: string; body?: unknown; idempotencyKey?: string; raw?: boolean } = {},
): Promise<T> {
  const cfg = readConfig();
  const secretKey = mode === "test" ? cfg.test.secretKey : cfg.live.secretKey;
  if (!secretKey) throw new PayMongoError(`PayMongo ${mode} mode is not configured`, 503);

  // Hard stop: automated tests must never reach the live API.
  if (
    secretKey.startsWith("sk_live_") &&
    (process.env["VITEST"] || process.env["NODE_ENV"] === "test") &&
    cfg.apiBase === DEFAULT_BASE
  ) {
    throw new PayMongoError("Refusing to call the live PayMongo API from a test run", 500);
  }

  const headers: Record<string, string> = {
    Authorization: `Basic ${btoa(`${secretKey}:`)}`,
    Accept: "application/json",
  };
  if (init.body !== undefined) headers["Content-Type"] = "application/json";
  if (init.idempotencyKey) headers["Idempotency-Key"] = init.idempotencyKey;

  const res = await fetch(`${cfg.apiBase}${path}`, {
    method: init.method ?? "GET",
    headers,
    body:
      init.body === undefined
        ? undefined
        : JSON.stringify(init.raw ? init.body : { data: { attributes: init.body } }),
  });

  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    /* non-JSON error body */
  }

  if (!res.ok) {
    const first = (json as { errors?: ApiError[] } | null)?.errors?.[0];
    const detail = first?.detail ?? `PayMongo request failed (${res.status})`;
    throw new PayMongoError(detail, res.status, first?.code ?? null);
  }
  return json as T;
}

export type Resource<A = Record<string, unknown>> = {
  data: { id: string; type: string; attributes: A };
};
export type ResourceList<A = Record<string, unknown>> = {
  data: { id: string; type: string; attributes: A }[];
  has_more?: boolean;
};

export type PayMongoSubscriptionAttrs = {
  status: string;
  livemode?: boolean;
  plan?:
    { id: string; amount?: number; name?: string; interval?: string } | Record<string, unknown>;
  plan_id?: string;
  customer?: { id: string } | Record<string, unknown>;
  customer_id?: string;
  payment_method_id?: string | null;
  latest_invoice?:
    { id: string; status?: string; amount?: number } | Record<string, unknown> | null;
  latest_invoice_id?: string | null;
  current_period_start?: number | string | null;
  current_period_end?: number | string | null;
  next_billing_schedule?: number | string | null;
  cancel_at_period_end?: boolean;
  canceled_at?: number | string | null;
  cancelled_at?: number | string | null;
  created_at?: number;
  updated_at?: number;
  metadata?: Record<string, unknown> | null;
};

export type PayMongoInvoiceAttrs = {
  status: string;
  amount?: number;
  currency?: string;
  livemode?: boolean;
  subscription_id?: string;
  subscription?: { id: string } | Record<string, unknown>;
  payment_intent_id?: string | null;
  payment_intent?: { id: string; status?: string } | Record<string, unknown> | null;
  invoice_number?: string | null;
  due_at?: number | null;
  paid_at?: number | null;
  billing_cycle_start?: number | null;
  billing_cycle_end?: number | null;
  period_start?: number | null;
  period_end?: number | null;
  attempt_count?: number;
  next_payment_attempt?: number | null;
  created_at?: number;
  updated_at?: number;
};

export type PayMongoPaymentIntentAttrs = {
  status: string; // awaiting_payment_method | awaiting_next_action | processing | succeeded
  amount: number;
  currency: string;
  livemode?: boolean;
  client_key?: string;
  last_payment_error?:
    { failed_code?: string; failed_message?: string } | Record<string, unknown> | null;
  next_action?: { type: string; redirect?: { url: string; return_url?: string } } | null;
  payment_method?: { id: string } | null;
  payments?: { id: string; attributes?: Record<string, unknown> }[];
  metadata?: Record<string, unknown> | null;
  created_at?: number;
  updated_at?: number;
};

export type PayMongoPaymentAttrs = {
  status: string;
  amount: number;
  currency: string;
  livemode?: boolean;
  fee?: number;
  net_amount?: number;
  payment_intent_id?: string | null;
  description?: string | null;
  failed_code?: string | null;
  failed_message?: string | null;
  source?: { id?: string; type?: string; brand?: string; last4?: string } | null;
  paid_at?: number | null;
  created_at?: number;
  metadata?: Record<string, unknown> | null;
};

/** Build a client bound to one mode. Pass no mode to use the configured one. */
export function paymongoClient(mode?: PayMongoMode) {
  const m: PayMongoMode = mode ?? readConfig().mode;
  return {
    mode: m,
    isConfigured: () => {
      const c = readConfig();
      return !!(m === "test" ? c.test.secretKey : c.live.secretKey);
    },

    // ---- Plans -------------------------------------------------------------
    /** Create a monthly recurring plan. `amount` is in PHP (not centavos). */
    createPlan(input: { name: string; amount: number; description?: string; slug?: string }) {
      return request<Resource>(m, "/subscriptions/plans", {
        method: "POST",
        body: {
          name: input.name,
          description: input.description,
          amount: Math.round(input.amount * 100),
          currency: "PHP",
          interval: "month",
          interval_count: 1,
          cycle_count: 0,
          metadata: input.slug ? { slug: input.slug, app: "daraven" } : { app: "daraven" },
        },
        idempotencyKey: `plan-${m}-${input.slug ?? input.name}-${input.amount}`,
      });
    },
    getPlan(id: string) {
      return request<Resource>(m, `/subscriptions/plans/${id}`);
    },

    // ---- Customers ---------------------------------------------------------
    createCustomer(input: {
      firstName: string;
      lastName: string;
      email: string;
      phone?: string;
      idempotencyKey: string;
    }) {
      return request<Resource>(m, "/customers", {
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
    getCustomer(id: string) {
      return request<Resource>(m, `/customers/${id}`);
    },
    findCustomerByEmail(email: string) {
      return request<ResourceList>(m, `/customers?email=${encodeURIComponent(email)}`);
    },

    // ---- Subscriptions -----------------------------------------------------
    createSubscription(input: {
      customerId: string;
      planId: string;
      paymentMethodId?: string;
      returnUrl?: string;
      metadata?: Record<string, string>;
      idempotencyKey: string;
    }) {
      return request<Resource<PayMongoSubscriptionAttrs>>(m, "/subscriptions", {
        method: "POST",
        body: {
          customer_id: input.customerId,
          plan_id: input.planId,
          ...(input.paymentMethodId ? { payment_method_id: input.paymentMethodId } : {}),
          ...(input.returnUrl ? { return_url: input.returnUrl } : {}),
          ...(input.metadata ? { metadata: input.metadata } : {}),
        },
        idempotencyKey: input.idempotencyKey,
      });
    },
    getSubscription(id: string) {
      return request<Resource<PayMongoSubscriptionAttrs>>(m, `/subscriptions/${id}`);
    },
    cancelSubscription(id: string) {
      return request<Resource<PayMongoSubscriptionAttrs>>(m, `/subscriptions/${id}/cancel`, {
        method: "POST",
        body: {},
      });
    },
    changeSubscriptionPlan(id: string, planId: string) {
      return request<Resource<PayMongoSubscriptionAttrs>>(m, `/subscriptions/${id}/plan`, {
        method: "PUT",
        body: { plan_id: planId },
      });
    },
    changeSubscriptionPaymentMethod(id: string, paymentMethodId: string, returnUrl?: string) {
      return request<Resource<PayMongoSubscriptionAttrs>>(
        m,
        `/subscriptions/${id}/payment_method`,
        {
          method: "PUT",
          body: {
            payment_method_id: paymentMethodId,
            ...(returnUrl ? { return_url: returnUrl } : {}),
          },
        },
      );
    },
    /** Test mode only: advance one billing cycle immediately. */
    triggerTestCycle(id: string) {
      if (m !== "test") throw new PayMongoError("test_cycle is only available in test mode", 400);
      return request<Resource<PayMongoSubscriptionAttrs>>(m, `/subscriptions/${id}/test_cycle`, {
        method: "POST",
        body: {},
      });
    },

    // ---- Invoices ----------------------------------------------------------
    getInvoice(id: string) {
      return request<Resource<PayMongoInvoiceAttrs>>(m, `/subscriptions/invoices/${id}`);
    },
    payInvoice(id: string, input: { paymentMethodId?: string; returnUrl?: string } = {}) {
      return request<Resource<PayMongoInvoiceAttrs>>(m, `/subscriptions/invoices/${id}/pay`, {
        method: "POST",
        body: {
          ...(input.paymentMethodId ? { payment_method_id: input.paymentMethodId } : {}),
          ...(input.returnUrl ? { return_url: input.returnUrl } : {}),
        },
      });
    },

    // ---- Payment intents / methods / payments --------------------------------
    getPaymentIntent(id: string) {
      return request<Resource<PayMongoPaymentIntentAttrs>>(m, `/payment_intents/${id}`);
    },
    attachPaymentIntent(id: string, input: { paymentMethodId: string; returnUrl: string }) {
      return request<Resource<PayMongoPaymentIntentAttrs>>(m, `/payment_intents/${id}/attach`, {
        method: "POST",
        body: { payment_method: input.paymentMethodId, return_url: input.returnUrl },
      });
    },
    getPaymentMethod(id: string) {
      return request<Resource>(m, `/payment_methods/${id}`);
    },
    getPayment(id: string) {
      return request<Resource<PayMongoPaymentAttrs>>(m, `/payments/${id}`);
    },

    // ---- Checkout sessions (one-time hosted payment page) --------------------
    createCheckoutSession(input: {
      amount: number; // PHP
      name: string;
      description: string;
      email?: string;
      successUrl: string;
      cancelUrl: string;
      reference: string;
      metadata: Record<string, string>;
    }) {
      return request<Resource<{ checkout_url: string; status: string }>>(m, "/checkout_sessions", {
        method: "POST",
        body: {
          line_items: [
            {
              name: input.name,
              description: input.description,
              amount: Math.round(input.amount * 100),
              currency: "PHP",
              quantity: 1,
            },
          ],
          payment_method_types: ["gcash", "paymaya", "card", "qrph", "grab_pay"],
          description: input.description,
          success_url: input.successUrl,
          cancel_url: input.cancelUrl,
          reference_number: input.reference,
          send_email_receipt: true,
          show_description: true,
          show_line_items: true,
          ...(input.email ? { billing: { email: input.email } } : {}),
          metadata: input.metadata,
        },
        idempotencyKey: `cs-${input.reference}`,
      });
    },

    // ---- Webhooks (diagnostics only) ----------------------------------------
    listWebhooks() {
      return request<
        ResourceList<{ url: string; status: string; events: string[]; livemode?: boolean }>
      >(m, "/webhooks");
    },
  };
}

/** Client bound to the currently configured mode (delegates lazily so env is read per call). */
export const paymongo = {
  isConfigured: () => readConfig().configured,
  mode: () => readConfig().mode,
  client: paymongoClient,
  createPlan: (...a: Parameters<ReturnType<typeof paymongoClient>["createPlan"]>) =>
    paymongoClient().createPlan(...a),
  createCustomer: (...a: Parameters<ReturnType<typeof paymongoClient>["createCustomer"]>) =>
    paymongoClient().createCustomer(...a),
  createSubscription: (...a: Parameters<ReturnType<typeof paymongoClient>["createSubscription"]>) =>
    paymongoClient().createSubscription(...a),
  getSubscription: (id: string) => paymongoClient().getSubscription(id),
  cancelSubscription: (id: string) => paymongoClient().cancelSubscription(id),
};

/** Parse `t=<ts>,te=<sig>,li=<sig>` into its parts. */
function parseSignatureHeader(header: string | null) {
  if (!header) return null;
  const parts: Record<string, string> = {};
  for (const piece of header.split(",")) {
    const idx = piece.indexOf("=");
    if (idx === -1) continue;
    const k = piece.slice(0, idx).trim();
    const v = piece.slice(idx + 1).trim();
    if (k) parts[k] = v;
  }
  if (!parts["t"]) return null;
  return { timestamp: parts["t"], te: parts["te"] || null, li: parts["li"] || null };
}

async function hmacHex(secret: string, payload: string) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sigBytes = await crypto.subtle.sign("HMAC", key, enc.encode(payload));
  return Array.from(new Uint8Array(sigBytes))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function timingSafeEqualHex(a: string, b: string) {
  if (a.length !== b.length || a.length === 0) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export type SignatureCheck = {
  valid: boolean;
  /** Which signature component matched: te = test mode, li = live mode. */
  mode: PayMongoMode | null;
  reason?: string;
};

/**
 * Verify a PayMongo webhook signature against per-mode secrets.
 *   header:  t=<timestamp>,te=<test sig>,li=<live sig>
 *   payload: `${t}.${rawBody}` signed with HMAC-SHA256 of the webhook secret.
 * The `te` component is checked with the test secret and `li` with the live
 * secret so a single endpoint can safely serve both modes.
 */
export async function verifyWebhookSignatureDetailed(
  rawBody: string,
  header: string | null,
  secrets: { test?: string | null; live?: string | null },
  opts: { toleranceSeconds?: number; now?: number } = {},
): Promise<SignatureCheck> {
  const parsed = parseSignatureHeader(header);
  if (!parsed) return { valid: false, mode: null, reason: "malformed_header" };
  if (!secrets.test && !secrets.live) return { valid: false, mode: null, reason: "no_secret" };

  const ts = Number(parsed.timestamp);
  if (!Number.isFinite(ts)) return { valid: false, mode: null, reason: "bad_timestamp" };
  if (opts.toleranceSeconds) {
    const now = opts.now ?? Math.floor(Date.now() / 1000);
    if (Math.abs(now - ts) > opts.toleranceSeconds)
      return { valid: false, mode: null, reason: "stale_timestamp" };
  }

  const payload = `${parsed.timestamp}.${rawBody}`;
  if (parsed.te && secrets.test) {
    const expected = await hmacHex(secrets.test, payload);
    if (timingSafeEqualHex(expected, parsed.te)) return { valid: true, mode: "test" };
  }
  if (parsed.li && secrets.live) {
    const expected = await hmacHex(secrets.live, payload);
    if (timingSafeEqualHex(expected, parsed.li)) return { valid: true, mode: "live" };
  }
  return { valid: false, mode: null, reason: "signature_mismatch" };
}

/** Single-secret convenience wrapper (same secret used for te and li). */
export async function verifyWebhookSignature(
  rawBody: string,
  header: string | null,
  secret: string | null,
): Promise<boolean> {
  if (!secret) return false;
  const res = await verifyWebhookSignatureDetailed(rawBody, header, { test: secret, live: secret });
  return res.valid;
}
