/**
 * Capability route guard.
 *
 * Settings → capability engine → route guard. A module whose capability is
 * switched off (or whose prerequisites are missing) cannot be opened, even by
 * typing the URL. Hidden navigation is never the security boundary — the
 * database policies and RPC checks still apply underneath this.
 */
import { useNavigate } from "@tanstack/react-router";
import { SlidersHorizontal } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useBusiness } from "@/lib/business-context";
import { capabilityLabel, capabilityStatus, routeCapability } from "@/lib/capabilities";

export function useRouteCapability(pathname: string) {
  const { settings } = useBusiness();
  const key = routeCapability(pathname);
  if (!key) return { key: null, allowed: true, missing: [] as string[] };
  const status = capabilityStatus(settings, key);
  return {
    key,
    allowed: status.usable,
    missing: status.missing.map((m) => capabilityLabel(m)),
  };
}

export function CapabilityBlocked({
  capability,
  missing,
}: {
  capability: string;
  missing: string[];
}) {
  const navigate = useNavigate();
  const { isAdmin } = useBusiness();
  return (
    <div className="mx-auto max-w-md space-y-3 py-16 text-center">
      <SlidersHorizontal className="mx-auto size-10 text-muted-foreground" />
      <h1 className="font-display text-xl font-semibold">{capability} is switched off</h1>
      <p className="text-sm text-muted-foreground">
        {missing.length
          ? `This area also needs ${missing.join(" and ")} switched on first.`
          : "Turn this on in Settings to use this area."}
      </p>
      <Button variant="outline" onClick={() => navigate({ to: "/settings" })}>
        {isAdmin ? "Open settings" : "Ask an admin to enable it"}
      </Button>
    </div>
  );
}
