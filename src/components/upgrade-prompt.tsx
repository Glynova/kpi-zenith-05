import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Lock, Sparkles, ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { FEATURE_LABEL, type FeatureKey } from "@/lib/billing";
import { useSubscription } from "@/lib/use-subscription";

export function UpgradePrompt({
  feature,
  plan = "Pro",
  description,
}: {
  feature: FeatureKey;
  plan?: string;
  description?: string;
}) {
  const label = FEATURE_LABEL[feature] ?? feature;
  return (
    <Card className="mx-auto max-w-lg text-center shadow-elevate-2">
      <CardContent className="space-y-4 py-12">
        <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Lock className="size-5" />
        </div>
        <div className="space-y-1.5">
          <h2 className="font-display text-xl font-semibold">{label} is a {plan} feature</h2>
          <p className="text-sm text-muted-foreground">
            {description ??
              `Upgrade your workspace to unlock ${label.toLowerCase()} and the rest of the ${plan} toolkit. Your existing data stays exactly as it is.`}
          </p>
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          <Button asChild>
            <Link to="/billing">
              <Sparkles className="size-4" /> Upgrade to {plan}
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/pricing">
              Compare plans <ArrowRight className="size-4" />
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/** Wrap any screen/section that requires an entitlement. */
export function FeatureGate({
  feature,
  plan,
  children,
}: {
  feature: FeatureKey;
  plan?: string;
  children: ReactNode;
}) {
  const { can, loading } = useSubscription();
  if (loading) return <Skeleton className="h-64 w-full" />;
  if (!can(feature)) return <UpgradePrompt feature={feature} plan={plan} />;
  return <>{children}</>;
}
