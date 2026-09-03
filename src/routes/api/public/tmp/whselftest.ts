import { createFileRoute } from "@tanstack/react-router";
import { readWebhookSecret } from "@/lib/paymongo.server";

export const Route = createFileRoute("/api/public/tmp/whselftest")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const secret = readWebhookSecret();
        if (!secret) return Response.json({ error: "no secret" }, { status: 500 });
        const url = new URL(request.url);
        const type = url.searchParams.get("type") ?? "subscription.activated";
        const evtId = url.searchParams.get("evt") ?? `evt_selftest_${Date.now()}`;
        const body = JSON.stringify({
          data: { id: evtId, attributes: { type, data: { id: "sub_selftest", attributes: { status: "active", amount: 99900, currency: "PHP" } } } },
        });
        const t = String(Math.floor(Date.now() / 1000));
        const enc = new TextEncoder();
        const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
        const sig = Array.from(new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(`${t}.${body}`))))
          .map((b) => b.toString(16).padStart(2, "0")).join("");
        const started = Date.now();
        const res = await fetch(`${url.origin}/api/public/webhooks/paymongo`, {
          method: "POST",
          headers: { "content-type": "application/json", "paymongo-signature": `t=${t},te=${sig},li=` },
          body,
        });
        const badRes = await fetch(`${url.origin}/api/public/webhooks/paymongo`, {
          method: "POST",
          headers: { "content-type": "application/json", "paymongo-signature": `t=${t},te=deadbeef,li=` },
          body,
        });
        return Response.json({
          type,
          signedStatus: res.status,
          signedBody: await res.text(),
          tamperedStatus: badRes.status,
          ms: Date.now() - started,
        });
      },
    },
  },
});
