import { useQuery, useQueryClient } from "@tanstack/react-query";

import { db } from "@/lib/db";
import { useBusiness } from "@/lib/business-context";
import {
  resolveAccess,
  type BillingSnapshot,
  type Entitlement,
  type FeatureKey,
  type LimitKey,
  type Plan,
  type ResolvedAccess,
  type Subscription,
} from "@/lib/billing";

const EMPTY: BillingSnapshot = { plans: [], entitlements: [], subscription: null };

export function usePlanCatalog() {
  return useQuery({
    queryKey: ["billing-plans"],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const [{ data: plans, error: pErr }, { data: ents, error: eErr }] = await Promise.all([
        db.from("subscription_plans").select("*").eq("status", "active").order("sort_order"),
        // Direct table reads are platform-admin only; signed-in users get the
        // shared plan feature list through this function.
        db.rpc("get_plan_entitlements"),
      ]);
      if (pErr) throw pErr;
      // Feature lists are only readable when signed in; public pages still show plans.
      if (eErr && !(plans ?? []).length) throw eErr;
      return { plans: (plans ?? []) as Plan[], entitlements: (ents ?? []) as Entitlement[] };
    },
  });
}

/** Live subscription snapshot + resolved entitlements for the active business. */
export function useSubscription() {
  const { businessId } = useBusiness();
  const queryClient = useQueryClient();
  const catalog = usePlanCatalog();

  const subQuery = useQuery({
    queryKey: ["subscription", businessId],
    enabled: !!businessId,
    queryFn: async () => {
      const { data, error } = await db
        .from("subscriptions")
        .select("*")
        .eq("business_id", businessId)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as Subscription | null;
    },
  });

  const snapshot: BillingSnapshot = {
    plans: catalog.data?.plans ?? EMPTY.plans,
    entitlements: catalog.data?.entitlements ?? EMPTY.entitlements,
    subscription: subQuery.data ?? null,
  };

  const access: ResolvedAccess = resolveAccess(snapshot);

  return {
    ...access,
    snapshot,
    plans: snapshot.plans,
    subscription: snapshot.subscription,
    loading: catalog.isLoading || subQuery.isLoading,
    error: (catalog.error ?? subQuery.error) as Error | null,
    refetch: () => {
      void catalog.refetch();
      void subQuery.refetch();
      void queryClient.invalidateQueries({ queryKey: ["billing-history", businessId] });
    },
  };
}

/** True when the business's plan includes a capability. */
export function useEntitlement(key: FeatureKey) {
  const { can, loading } = useSubscription();
  return { allowed: can(key), loading };
}

/** Limit helper, e.g. useLimit("max_users") -> { max, reached }. */
export function useLimit(key: LimitKey, current: number) {
  const { limit, withinLimit, loading } = useSubscription();
  return { max: limit(key), reached: !withinLimit(key, current), loading };
}
