/* eslint-disable @typescript-eslint/no-explicit-any */
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { getMyAffiliateStatus, getPartnerDashboard } from "@/lib/affiliate.functions";
import { amIPlatformAdmin } from "@/lib/billing.functions";

/** Is the signed-in user an approved affiliate partner (and/or an applicant)? */
export function useAffiliateStatus() {
  const fetchStatus = useServerFn(getMyAffiliateStatus);
  // Re-verified server-side on focus and on an interval so suspending or
  // revoking a partner ends an already-open portal session.
  const query = useQuery({
    queryKey: ["affiliate-status"],
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    refetchInterval: 60_000,
    retry: false,
    queryFn: () => fetchStatus(),
  });
  return {
    partner: (query.data?.partner ?? null) as any,
    application: (query.data?.application ?? null) as any,
    isPartner: !!query.data?.partner && query.data.partner.status === "active",
    loading: query.isLoading,
    refetch: query.refetch,
  };
}

export function usePartnerDashboard(enabled = true) {
  const fetchDashboard = useServerFn(getPartnerDashboard);
  return useQuery({
    queryKey: ["partner-dashboard"],
    enabled,
    queryFn: () => fetchDashboard(),
  });
}

/** Platform-admin check — the server re-verifies on every admin call. */
export function usePlatformAdmin() {
  const check = useServerFn(amIPlatformAdmin);
  const query = useQuery({
    queryKey: ["platform-admin"],
    staleTime: 5 * 60_000,
    queryFn: () => check(),
  });
  return { isPlatformAdmin: !!query.data?.isPlatformAdmin, loading: query.isLoading };
}
