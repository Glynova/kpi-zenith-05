import { createFileRoute } from "@tanstack/react-router";

import { verifyWebhookSignature } from "@/lib/paymongo.server";

/**
 * PayMongo webhook receiver.
 *
 * - Signature is verified against PAYMONGO_WEBHOOK_SECRET before anything is
 *   persisted (requests are rejected when the secret is missing).
 * - Events are stored by their PayMongo id, so replays are idempotent.
 * - Only ids, amounts and statuses are stored — never card data.
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

const STATUS_MAP: Record<string, string> = {
  "subscription.active": "active",
  "subscription.updated": "active",
  "subscription.cancelled": "cancelled",
  "subscription.past_due": "past_due",
  "subscription.unpaid": "unpaid",
  "subscription.incomplete": "incomplete",
};

export const Route = createFileRoute("/api/public/webhooks/paymongo")({
  server: {
    handlers: {
      POST: async ({ request }) => {
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

        // Idempotency: a repeated delivery hits the unique external_event_id.
        if (eventId) {
          const { data: seen } = await admin
            .from("subscription_events")
            .select("id")
            .eq("external_event_id", eventId)
            .maybeSingle();
          if (seen) return new Response("ok");
        }

        const subscriptionExternalId: string | undefined =
          type.startsWith("subscription") ? resource?.id : attrs["subscription_id"];

        let sub: any = null;
        if (subscriptionExternalId) {
          const { data } = await admin
            .from("subscriptions")
            .select("id, business_id, plan_id")
            .eq("paymongo_subscription_id", subscriptionExternalId)
            .maybeSingle();
          sub = data;
        }

        await admin.from("subscription_events").insert({
          subscription_id: sub?.id ?? null,
          business_id: sub?.business_id ?? null,
          event_type: type,
          external_event_id: eventId ?? null,
          payload: { type, resource_id: resource?.id ?? null, status: attrs["status"] ?? null },
        });

        if (sub) {
          const mapped = STATUS_MAP[type];
          if (mapped) {
            await admin
              .from("subscriptions")
              .update({
                status: mapped,
                current_period_start: attrs["current_period_start"] ?? undefined,
                current_period_end: attrs["next_billing_schedule"] ?? undefined,
                cancelled_at: mapped === "cancelled" ? new Date().toISOString() : null,
              })
              .eq("id", sub.id);
          }

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
                failure_reason: paid ? null : ((attrs["last_payment_error"] as string) ?? "Payment failed"),
              },
              { onConflict: "paymongo_payment_id" },
            );
            if (!paid) {
              await admin.from("subscriptions").update({ status: "past_due" }).eq("id", sub.id);
            }
          }
        }

        return new Response("ok");
      },
    },
  },
});
