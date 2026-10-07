import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, Loader2, QrCode } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { checkQrPhPayment, createQrPhPayment, type QrPhPayment } from "@/lib/qrph.functions";

type Props = {
  invoiceId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPaid?: () => void;
};

export function QrPhPaymentDialog({ invoiceId, open, onOpenChange, onPaid }: Props) {
  const create = useServerFn(createQrPhPayment);
  const check = useServerFn(checkQrPhPayment);
  const [qr, setQr] = useState<QrPhPayment | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "pending" | "paid" | "expired">("idle");
  const [secondsLeft, setSecondsLeft] = useState(0);

  const markPaid = useCallback(() => {
    setStatus((s) => {
      if (s !== "paid") onPaid?.();
      return "paid";
    });
  }, [onPaid]);

  const generate = useCallback(async () => {
    setLoading(true);
    setError(null);
    setStatus("idle");
    try {
      const res = await create({ data: { invoiceId } });
      setQr(res);
      setStatus("pending");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create the QR code");
    } finally {
      setLoading(false);
    }
  }, [create, invoiceId]);

  useEffect(() => {
    if (open) void generate();
    else {
      setQr(null);
      setStatus("idle");
      setError(null);
    }
  }, [open, generate]);

  // Live update when the payment webhook marks it paid.
  useEffect(() => {
    if (!qr) return;
    const channel = supabase
      .channel(`qrph-${qr.payment_intent_id}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "qrph_payments",
          filter: `payment_intent_id=eq.${qr.payment_intent_id}`,
        },
        (payload) => {
          const s = (payload.new as { status: string }).status;
          if (s === "paid") markPaid();
          if (s === "expired" || s === "failed") setStatus("expired");
        },
      )
      .subscribe();
    // Fallback poll every 10s in case the live update is missed.
    const poll = setInterval(async () => {
      try {
        const r = await check({ data: { paymentIntentId: qr.payment_intent_id } });
        if (r.status === "paid") markPaid();
      } catch {
        /* keep waiting */
      }
    }, 10_000);
    return () => {
      clearInterval(poll);
      void supabase.removeChannel(channel);
    };
  }, [qr, check, markPaid]);

  useEffect(() => {
    if (!qr || status !== "pending") return;
    const tick = () => {
      const left = Math.max(0, Math.floor((new Date(qr.expires_at).getTime() - Date.now()) / 1000));
      setSecondsLeft(left);
      if (left === 0) setStatus("expired");
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [qr, status]);

  const mm = String(Math.floor(secondsLeft / 60)).padStart(2, "0");
  const ss = String(secondsLeft % 60).padStart(2, "0");
  const amount = qr
    ? (qr.amount_centavos / 100).toLocaleString("en-PH", { style: "currency", currency: "PHP" })
    : "";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <QrCode className="size-5" /> Pay via QR Ph
          </DialogTitle>
          <DialogDescription>
            Scan with GCash, Maya or any bank app that supports QR Ph.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col items-center gap-4 py-2">
          {loading && <Loader2 className="size-8 animate-spin text-muted-foreground" />}
          {error && (
            <>
              <p className="text-center text-sm text-destructive">{error}</p>
              <Button onClick={generate}>Try again</Button>
            </>
          )}
          {qr && status === "pending" && (
            <>
              <img
                src={qr.qr_image}
                alt="QR Ph payment code"
                className="size-64 rounded-md border bg-background p-2"
              />
              <p className="text-2xl font-semibold">{amount}</p>
              <p className="text-sm text-muted-foreground">
                Expires in {mm}:{ss} · Waiting for payment…
              </p>
            </>
          )}
          {status === "paid" && (
            <div className="flex flex-col items-center gap-2 py-6">
              <CheckCircle2 className="size-14 text-primary" />
              <p className="text-lg font-semibold">Payment received</p>
              <Button onClick={() => onOpenChange(false)}>Done</Button>
            </div>
          )}
          {status === "expired" && (
            <div className="flex flex-col items-center gap-3 py-6">
              <p className="text-sm text-muted-foreground">This QR code has expired.</p>
              <Button onClick={generate}>Make a new QR code</Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
