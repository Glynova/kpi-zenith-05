import { createFileRoute } from "@tanstack/react-router";

import { verifyWebhookSignature } from "@/lib/paymongo.server";

/**
 * PayMongo webhook receiver.
 *
 * - The raw request body is read as text FIRST and the HMAC-SHA256 signature is
 *   verified against PAYMONGO_WEBHOOK_SECRET before anything is parsed or
 *   persisted (requests are rejected when the secret is missing).
 * - Events are recorded by their PayMongo id, so replays are idempotent.
 * - Only ids, amounts and statuses are stored — never card data.
 * - Every recognised or unrecognised event answers 2xx quickly; only signature
 *   or payload failures answer 4xx.
 */

type PayMongoEvent = {
  data?: {
    id?: string;
    attributes?: {
      type?: string;
      data?: { id?: string; attributes?: Record<string, unknown> };
    };
  };
};

/** PayMongo subscription event -> Daraven subscription status. */
const STATUS_MAP: Record<string, string> = {
  "subscription.activated": "active",
  "subscription.active": "active",
  "subscription.updated": "active",
  "subscription.resumed": "active",
  "subscription.cancelled": "cancelled",
  "subscription.canceled": "cancelled",
  "subscription.past_due": "past_due",
  "subscription.unpaid": "unpaid",
  "subscription.incomplete": "incomplete",
  "subscription.paused": "suspended",
};

const INVOICE_STATUS_MAP: Record<string, string> = {
  "subscription.invoice.created": "open",
  "subscription.invoice.finalized": "open",
  "subscription.invoice.upcoming": "draft",
  "subscription.invoice.paid": "paid",
  "subscription.invoice.payment_failed": "payment_failed",
  "subscription.invoice.voided": "void",
};

function toIso(value: unknown): string | undefined {
  if (typeof value === "number") return new Date(value * 1000).toISOString();
  if (typeof value === "string" && value) return value;
  return undefined;
}

export const Route = createFileRoute("/api/public/webhooks/paymongo")({
  server: {
    handlers: {
      // Non-sensitive readiness probe (never reveals the secret itself).
      GET: async () =>
        Response.json({
          endpoint: "/api/public/webhooks/paymongo",
          method: "POST",
          signatureVerification: "hmac-sha256 (te/li)",
          webhookSecretConfigured: !!process.env["PAYMONGO_WEBHOOK_SECRET"],
        }),
      POST: async ({ request }) => {
        // 1. Raw body, untouched, for HMAC verification.
        const raw = await request.text();
        const secret = process.env["PAYMONGO_WEBHOOK_SECRET"] ?? null;
        const ok = await verifyWebhookSignature(
          raw,
          request.headers.get("paymongo-signature"),
          secret,
        );
        if (!ok) return new Response("Invalid signature", { status: 401 });

        let event: PayMongoEvent;
        try {
          event = JSON.parse(raw) as PayMongoEvent;
        } catch {
          return new Response("Invalid payload", { status: 400 });
        }

        const eventId = event.data?.id;
        const type = event.data?.attributes?.type ?? "unknown";
        const resource = event.data?.attributes?.data;
        const attrs = (resource?.attributes ?? {}) as Record<string, any>;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const admin = supabaseAdmin as any;

        // 2. Idempotency: a repeated delivery hits the unique external_event_id.
        if (eventId) {
          const { data: seen } = await admin
            .from("subscription_events")
            .select("id")
            .eq("external_event_id", eventId)
            .maybeSingle();
          if (seen) return new Response("ok (duplicate)");
        }

        // 3. Locate the Daraven subscription this event belongs to.
        const subscriptionExternalId: string | undefined = type.startsWith("subscription.invoice")
          ? (attrs["subscription_id"] as string | undefined)
          : type.startsWith("subscription")
            ? resource?.id
            : (attrs["subscription_id"] as string | undefined);

        let sub: any = null;
        if (subscriptionExternalId) {
          const { data } = await admin
            .from("subscriptions")
            .select("id, business_id, plan_id, status")
            .eq("paymongo_subscription_id", subscriptionExternalId)
            .maybeSingle();
          sub = data;
        }

        const { error: eventError } = await admin.from("subscription_events").insert({
          subscription_id: sub?.id ?? null,
          business_id: sub?.business_id ?? null,
          event_type: type,
          external_event_id: eventId ?? null,
          payload: {
            type,
            resource_id: resource?.id ?? null,
            status: attrs["status"] ?? null,
            amount: attrs["amount"] ?? null,
          },
        });
        // Unique violation = concurrent duplicate delivery; still a success.
        if (eventError && (eventError as any).code === "23505") {
          return new Response("ok (duplicate)");
        }

        if (sub) {
          // 4a. Subscription lifecycle.
          const mapped = STATUS_MAP[type];
          if (mapped) {
            await admin
              .from("subscriptions")
              .update({
                status: mapped,
                current_period_start:
                  toIso(attrs["current_period_start"]) ?? undefined,
                current_period_end:
                  toIso(attrs["next_billing_schedule"]) ??
                  toIso(attrs["current_period_end"]) ??
                  undefined,
                cancelled_at: mapped === "cancelled" ? new Date().toISOString() : null,
              })
              .eq("id", sub.id);
          }

          // 4b. Subscription invoices.
          const invoiceStatus = INVOICE_STATUS_MAP[type];
          if (invoiceStatus && resource?.id) {
            const paid = invoiceStatus === "paid";
            await admin.from("billing_invoices").upsert(
              {
                business_id: sub.business_id,
                subscription_id: sub.id,
                external_invoice_id: resource.id,
                invoice_number:
                  (attrs["number"] as string) ?? (attrs["invoice_number"] as string) ?? null,
                amount: Number(attrs["amount"] ?? attrs["total"] ?? 0) / 100,
                currency: (attrs["currency"] as string) ?? "PHP",
                status: invoiceStatus,
                due_date: toIso(attrs["due_date"]) ?? null,
                paid_at: paid ? (toIso(attrs["paid_at"]) ?? new Date().toISOString()) : null,
              },
              { onConflict: "external_invoice_id" },
            );

            if (paid) {
              await admin
                .from("subscriptions")
                .update({ status: "active", cancelled_at: null })
                .eq("id", sub.id);
            }
            if (invoiceStatus === "payment_failed") {
              // Retries are handled by PayMongo; we escalate past_due -> unpaid
              // on a second failure. Tenant data is never removed.
              const next = sub.status === "past_due" || sub.status === "unpaid" ? "unpaid" : "past_due";
              await admin.from("subscriptions").update({ status: next }).eq("id", sub.id);
            }
          }

          // 4c. Individual payments.
          if (type.startsWith("payment.")) {
            const paid = type === "payment.paid";
            await admin.from("subscription_payments").upsert(
              {
                business_id: sub.business_id,
                subscription_id: sub.id,
                paymongo_payment_id: resource?.id ?? null,
                amount: Number(attrs["amount"] ?? 0) / 100,
                currency: (attrs["currency"] as string) ?? "PHP",
                status: paid ? "paid" : "failed",
                paid_at: paid ? new Date().toISOString() : null,
                failure_reason: paid
                  ? null
                  : ((attrs["last_payment_error"] as string) ?? "Payment failed"),
              },
              { onConflict: "paymongo_payment_id" },
            );
            if (paid) {
              await admin
                .from("subscriptions")
                .update({ status: "active", cancelled_at: null })
                .eq("id", sub.id);
            } else {
              const next = sub.status === "past_due" || sub.status === "unpaid" ? "unpaid" : "past_due";
              await admin.from("subscriptions").update({ status: next }).eq("id", sub.id);
            }
          }
        }

        // 5. Unrecognised events are acknowledged so PayMongo stops retrying.
        return new Response("ok");
      },
    },
  },
});
