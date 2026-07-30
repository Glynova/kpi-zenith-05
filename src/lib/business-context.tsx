/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";

import { db, type Row } from "@/lib/db";
import { supabase } from "@/integrations/supabase/client";

export type AppRole =
  | "owner"
  | "admin"
  | "manager"
  | "accountant"
  | "cashier"
  | "inventory_staff"
  | "warehouse_staff"
  | "employee"
  | "auditor";

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
  switchBusiness: (id: string) => void;
  refresh: () => void;
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
  switchBusiness: () => {},
  refresh: () => {},
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

  const value: Ctx = {
    loading: isLoading || !userId,
    memberships,
    business: active?.businesses ?? null,
    businessId: active?.business_id ?? null,
    role: active?.role ?? null,
    canWrite: !!active && active.role !== "auditor",
    isAdmin: active?.role === "owner" || active?.role === "admin",
    currency: active?.businesses?.currency ?? "USD",
    userId,
    switchBusiness: (id: string) => {
      window.localStorage.setItem(STORAGE_KEY, id);
      setSelected(id);
    },
    refresh: () => void refetch(),
  };

  return <BusinessContext.Provider value={value}>{children}</BusinessContext.Provider>;
}

export const useBusiness = () => useContext(BusinessContext);
