/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";

import { db, type Row } from "@/lib/db";
import { supabase } from "@/integrations/supabase/client";
import {
  DEFAULT_SETTINGS,
  DEFAULT_PRODUCT_CAPABILITIES,
  defaultsForType,
  type BusinessSettings,
  type FeatureKey,
  type ProductCapability,
} from "@/lib/business-config";

export type { AppRole } from "@/lib/permissions";
import type { AppRole } from "@/lib/permissions";

export type Membership = {
  id: string;
  role: AppRole;
  business_id: string;
  businesses: Row;
};

type Ctx = {
  loading: boolean;
  memberships: Membership[];
  business: Row | null;
  businessId: string | null;
  role: AppRole | null;
  canWrite: boolean;
  isAdmin: boolean;
  currency: string;
  userId: string | null;
  /** Resolved inventory configuration for the active business. */
  settings: BusinessSettings;
  /** Shorthand: is a capability enabled for the active business? */
  feature: (key: FeatureKey) => boolean;
  /** Is an optional product field switched on? */
  capability: (key: ProductCapability) => boolean;
  /** Setup wizard progress for the active business. */
  onboarding: Row | null;
  onboardingLoaded: boolean;
  switchBusiness: (id: string) => void;
  refresh: () => void;
  refreshSettings: () => void;
};

const BusinessContext = createContext<Ctx>({
  loading: true,
  memberships: [],
  business: null,
  businessId: null,
  role: null,
  canWrite: false,
  isAdmin: false,
  currency: "USD",
  userId: null,
  settings: DEFAULT_SETTINGS,
  feature: () => false,
  capability: () => false,
  onboarding: null,
  onboardingLoaded: false,
  switchBusiness: () => {},
  refresh: () => {},
  refreshSettings: () => {},
});


const STORAGE_KEY = "kpioptiva-business";

export function BusinessProvider({ children }: { children: ReactNode }) {
  const [userId, setUserId] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null));
    setSelected(window.localStorage.getItem(STORAGE_KEY));
  }, []);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["memberships", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await db
        .from("user_businesses")
        .select("id, role, business_id, businesses(*)")
        .eq("user_id", userId)
        .eq("status", "active");
      if (error) throw error;
      return (data ?? []) as Membership[];
    },
  });

  const memberships = useMemo(() => data ?? [], [data]);
  const active = useMemo(() => {
    if (!memberships.length) return null;
    return memberships.find((m) => m.business_id === selected) ?? memberships[0];
  }, [memberships, selected]);

  const businessId = active?.business_id ?? null;

  const { data: settingsRow, refetch: refetchSettings } = useQuery({
    queryKey: ["business-settings", businessId],
    enabled: !!businessId,
    queryFn: async () => {
      const { data, error } = await db
        .from("business_settings")
        .select("*")
        .eq("business_id", businessId)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as Row | null;
    },
  });

  const settings = useMemo<BusinessSettings>(() => {
    // Fall back to the recommended defaults for the business type until the
    // owner saves an explicit configuration.
    const base = {
      ...DEFAULT_SETTINGS,
      ...defaultsForType(active?.businesses?.type ?? "other"),
    } as BusinessSettings;
    return settingsRow ? ({ ...base, ...settingsRow } as BusinessSettings) : base;
  }, [settingsRow, active]);

  const capabilities = useMemo(() => {
    const stored = (settings.extra as Record<string, unknown> | undefined)?.["product_capabilities"];
    return { ...DEFAULT_PRODUCT_CAPABILITIES, ...((stored as Record<string, boolean>) ?? {}) };
  }, [settings]);

  const { data: onboardingRow, isFetched: onboardingLoaded } = useQuery({
    queryKey: ["business-onboarding", businessId],
    enabled: !!businessId,
    queryFn: async () => {
      const { data, error } = await db
        .from("business_onboarding")
        .select("*")
        .eq("business_id", businessId)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as Row | null;
    },
  });

  const value: Ctx = {
    loading: isLoading || !userId,
    memberships,
    business: active?.businesses ?? null,
    businessId,
    role: active?.role ?? null,
    canWrite: !!active && active.role !== "auditor",
    isAdmin: active?.role === "owner" || active?.role === "admin",
    currency: active?.businesses?.currency ?? "USD",
    userId,
    settings,
    feature: (key: FeatureKey) => !!settings[key],
    capability: (key: ProductCapability) => !!capabilities[key],
    onboarding: onboardingRow ?? null,
    onboardingLoaded: !!businessId && onboardingLoaded,
    switchBusiness: (id: string) => {
      window.localStorage.setItem(STORAGE_KEY, id);
      setSelected(id);
    },
    refresh: () => void refetch(),
    refreshSettings: () => void refetchSettings(),
  };


  return <BusinessContext.Provider value={value}>{children}</BusinessContext.Provider>;
}

export const useBusiness = () => useContext(BusinessContext);

