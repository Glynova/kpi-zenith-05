import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, Loader2, QrCode } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { getPlanQrPhStatus, startPlanQrPh } from "@/lib/billing.functions";

type Props = {
  businessId: string;
  planSlug: "pro" | "business";
  planName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPaid?: () => void;
};

type Qr = {
  checkoutId: string;
  qrImage: string;
  amountCentavos: number;
  expiresAt: string;
  mode: string;
};

/**
 * Shows the PayMongo QR Ph code for one month of a plan. It only READS status;
 * the plan is switched on by the verified PayMongo webhook on the server.
 */
export function PlanQrPhDialog({
  businessId,
  planSlug,
  planName,
  open,
  onOpenChange,
  onPaid,
}: Props) {
  const start = useServerFn(startPlanQrPh);
  const status = useServerFn(getPlanQrPhStatus);
  const [qr, setQr] = useState<Qr | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [state, setState] = useState<"idle" | "pending" | "paid" | "expired" | "failed">("idle");
  const [left, setLeft] = useState(0);
  const paidOnce = useRef(false);

  const generate = useCallback(async () => {
    setLoading(true);
    setError(null);
    setState("idle");
    setQr(null);
    try {
      const res = (await start({ data: { businessId, planSlug } })) as Qr | undefined;
      if (!res?.qrImage || !res.checkoutId) throw new Error("No QR code was returned. Please try again.");
      setQr(res);
      setState("pending");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create the QR code");
    } finally {
      setLoading(false);
    }
  }, [start, businessId, planSlug]);

  useEffect(() => {
    if (open) {
      paidOnce.current = false;
      void generate();
    } else {
      setQr(null);
      setState("idle");
      setError(null);
    }
  }, [open, generate]);

  // Poll server status (set only by the verified webhook).
  useEffect(() => {
    if (!qr || state !== "pending") return;
    const id = setInterval(async () => {
      try {
        const r = await status({ data: { businessId, checkoutId: qr.checkoutId } });
        if (r.status === "succeeded" && !paidOnce.current) {
          paidOnce.current = true;
          setState("paid");
          onPaid?.();
        } else if (r.status === "failed") {
          setState("failed");
          setError(r.failure_reason ?? "Payment failed");
        } else if (r.status === "expired") setState("expired");
      } catch {
        /* keep waiting */
      }
    }, 4000);
    return () => clearInterval(id);
  }, [qr, state, status, businessId, onPaid]);

  useEffect(() => {
    if (!qr || state !== "pending") return;
    const tick = () => {
      const s = Math.max(0, Math.floor((new Date(qr.expiresAt).getTime() - Date.now()) / 1000));
      setLeft(s);
      if (s === 0) setState("expired");
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [qr, state]);

  const amount = qr
    ? (qr.amountCentavos / 100).toLocaleString("en-PH", { style: "currency", currency: "PHP" })
    : "";
  const mm = String(Math.floor(left / 60)).padStart(2, "0");
  const ss = String(left % 60).padStart(2, "0");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <QrCode className="size-5" /> Pay {planName} with QR Ph
          </DialogTitle>
          <DialogDescription>
            One month of {planName}. Scan with GCash, Maya or any bank app that supports QR Ph.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col items-center gap-4 py-2">
          {loading && <Loader2 className="size-8 animate-spin text-muted-foreground" />}
          {error && state !== "pending" && (
            <p className="text-center text-sm text-destructive">{error}</p>
          )}
          {!loading && (error || state === "failed") && (
            <Button onClick={generate}>Try again</Button>
          )}
          {qr && state === "pending" && (
            <>
              <img
                src={qr.qrImage}
                alt="QR Ph payment code"
                className="size-64 rounded-md border bg-background p-2"
              />
              <p className="text-2xl font-semibold">{amount}</p>
              {qr.mode !== "live" && (
                <p className="text-xs text-muted-foreground">
                  Test mode — no real money is charged.
                </p>
              )}
              <p className="text-sm text-muted-foreground">
                Expires in {mm}:{ss} · Waiting for payment…
              </p>
            </>
          )}
          {state === "paid" && (
            <div className="flex flex-col items-center gap-2 py-6">
              <CheckCircle2 className="size-14 text-primary" />
              <p className="text-lg font-semibold">Payment received — {planName} is active</p>
              <Button onClick={() => onOpenChange(false)}>Done</Button>
            </div>
          )}
          {state === "expired" && (
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
