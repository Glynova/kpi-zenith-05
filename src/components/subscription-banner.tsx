import { Link } from "@tanstack/react-router";
import { AlertTriangle, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useSubscription } from "@/lib/use-subscription";
import { STATUS_LABEL } from "@/lib/billing";

/** Thin status strip shown above every page when billing needs attention. */
export function SubscriptionBanner() {
  const { loading, isTrialing, trialDaysLeft, trialExpired, pastDue, readOnly, status } =
    useSubscription();

  if (loading) return null;

  if (readOnly) {
    return (
      <Strip tone="destructive" icon={<AlertTriangle className="size-4" />}>
        Your workspace is {STATUS_LABEL[status].toLowerCase()} — new transactions are paused. All
        data is safe and readable.
      </Strip>
    );
  }

  if (pastDue) {
    return (
      <Strip tone="destructive" icon={<AlertTriangle className="size-4" />}>
        Your last payment failed. Update billing to avoid losing paid features.
      </Strip>
    );
  }

  if (trialExpired) {
    return (
      <Strip tone="default" icon={<Sparkles className="size-4" />}>
        Your Pro trial has ended and the workspace moved to the Free plan.
      </Strip>
    );
  }

  if (isTrialing && (trialDaysLeft ?? 99) <= 7) {
    return (
      <Strip tone="default" icon={<Sparkles className="size-4" />}>
        {trialDaysLeft} day{trialDaysLeft === 1 ? "" : "s"} left on your Pro trial.
      </Strip>
    );
  }

  return null;
}

function Strip({
  tone,
  icon,
  children,
}: {
  tone: "default" | "destructive";
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  const styles =
    tone === "destructive"
      ? "border-destructive/40 bg-destructive/10"
      : "border-primary/40 bg-primary/10";
  return (
    <div
      className={`flex flex-wrap items-center gap-2 border-b px-4 py-2 text-sm sm:px-6 lg:px-8 ${styles}`}
    >
      {icon}
      <span className="min-w-0 flex-1">{children}</span>
      <Button asChild size="sm" variant="outline">
        <Link to="/billing">Manage billing</Link>
      </Button>
    </div>
  );
}
