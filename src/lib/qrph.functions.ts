/* eslint-disable @typescript-eslint/no-explicit-any */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const QR_TTL_MS = 30 * 60 * 1000;

export type QrPhPayment = {
  qr_image: string;
  payment_intent_id: string;
  expires_at: string;
  amount_centavos: number;
  status: string;
};

async function pm(path: string, secret: string, base: string, body?: unknown) {
  const res = await fetch(`${base}${path}`, {
    method: body ? "POST" : "GET",
    headers: {
      Authorization: `Basic ${btoa(`${secret}:`)}`,
      Accept: "application/json",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json: any = await res.json().catch(() => null);
  if (!res.ok) {
    console.error("PayMongo QR Ph error", path, json);
    throw new Error(json?.errors?.[0]?.detail ?? "PayMongo request failed");
  }
  return json;
}

/** Create (or reuse) a QR Ph code for the unpaid balance of an invoice. */
export const createQrPhPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ invoiceId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<QrPhPayment> => {
    const supabase = context.supabase as any;
    // RLS: the caller must be able to read this invoice (business member).
    const { data: inv, error } = await supabase
      .from("invoices")
      .select("id, business_id, invoice_number, total, paid, status, document_status")
      .eq("id", data.invoiceId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!inv) throw new Error("Invoice not found");
    if (inv.document_status === "void" || ["cancelled", "voided", "draft"].includes(inv.status))
      throw new Error("This invoice can't be paid");

    const { data: canWrite } = await supabase.rpc("can_write_business", {
      _business_id: inv.business_id,
    });
    if (!canWrite) throw new Error("You don't have permission to collect payments");

    const balance = Number(inv.total ?? 0) - Number(inv.paid ?? 0);
    const amount = Math.round(balance * 100);
    if (amount < 100) throw new Error("Balance must be at least ₱1.00 for QR Ph");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;

    // Reuse a still-valid pending QR for the same amount.
    const { data: existing } = await admin
      .from("qrph_payments")
      .select("qr_image, payment_intent_id, expires_at, amount_centavos, status")
      .eq("invoice_id", inv.id)
      .eq("status", "pending")
      .eq("amount_centavos", amount)
      .gt("expires_at", new Date(Date.now() + 60_000).toISOString())
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (existing) return existing;

    const { readConfig } = await import("@/lib/paymongo.server");
    const cfg = readConfig();
    if (!cfg.secretKey) throw new Error("PayMongo is not configured");

    const pi = await pm("/payment_intents", cfg.secretKey, cfg.apiBase, {
      data: {
        attributes: {
          amount,
          currency: "PHP",
          payment_method_allowed: ["qrph"],
          description: `Invoice ${inv.invoice_number ?? inv.id}`,
          metadata: { invoice_id: inv.id, business_id: inv.business_id, source: "daraven_qrph" },
        },
      },
    });
    const method = await pm("/payment_methods", cfg.secretKey, cfg.apiBase, {
      data: { attributes: { type: "qrph" } },
    });
    const att = await pm(`/payment_intents/${pi.data.id}/attach`, cfg.secretKey, cfg.apiBase, {
      data: {
        attributes: { payment_method: method.data.id, client_key: pi.data.attributes.client_key },
      },
    });
    const qr: string | undefined = att?.data?.attributes?.next_action?.code?.image_url;
    if (!qr) throw new Error("PayMongo did not return a QR code");

    const row = {
      qr_image: qr,
      payment_intent_id: pi.data.id as string,
      expires_at: new Date(Date.now() + QR_TTL_MS).toISOString(),
      amount_centavos: amount,
      status: "pending",
    };
    const { error: insErr } = await admin.from("qrph_payments").insert({
      ...row,
      business_id: inv.business_id,
      invoice_id: inv.id,
      mode: cfg.mode,
      created_by: context.userId,
    });
    if (insErr) throw new Error(insErr.message);
    return row;
  });

/** Ask PayMongo directly whether a QR payment cleared (fallback if a webhook is missed). */
export const checkQrPhPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ paymentIntentId: z.string().min(3) }).parse(d))
  .handler(async ({ data, context }): Promise<{ status: string }> => {
    const supabase = context.supabase as any;
    const { data: row } = await supabase
      .from("qrph_payments")
      .select("status, amount_centavos, payment_intent_id")
      .eq("payment_intent_id", data.paymentIntentId)
      .maybeSingle();
    if (!row) throw new Error("Payment not found");
    if (row.status !== "pending") return { status: row.status };

    const { readConfig } = await import("@/lib/paymongo.server");
    const cfg = readConfig();
    if (!cfg.secretKey) return { status: row.status };
    const pi = await pm(`/payment_intents/${row.payment_intent_id}`, cfg.secretKey, cfg.apiBase);
    const attrs = pi?.data?.attributes ?? {};
    if (attrs.status === "succeeded") {
      const payment = (attrs.payments ?? [])[0];
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const result = await (supabaseAdmin as any).rpc("apply_qrph_payment", {
        _intent_id: row.payment_intent_id,
        _amount_centavos: Number(payment?.attributes?.amount ?? attrs.amount),
        _payment_id: payment?.id ?? null,
      });
      if (result.data === "paid" || result.data === "duplicate") return { status: "paid" };
    }
    return { status: row.status };
  });
