/* eslint-disable @typescript-eslint/no-explicit-any */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const ASSIGNABLE = [
  "admin",
  "manager",
  "accountant",
  "hr",
  "cashier",
  "inventory_staff",
  "warehouse_staff",
  "employee",
  "auditor",
] as const;

async function assertAdmin(supabase: any, userId: string, businessId: string) {
  const { data, error } = await supabase
    .from("user_businesses")
    .select("role")
    .eq("business_id", businessId)
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data || !["owner", "admin"].includes(data.role)) {
    throw new Error("Only owners and admins can manage the team");
  }
  return data.role as string;
}

export const listTeam = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ businessId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId, data.businessId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await (supabaseAdmin as any)
      .from("user_businesses")
      .select("id, user_id, role, status, created_at, profiles:user_id(email, full_name)")
      .eq("business_id", data.businessId)
      .order("created_at");
    if (error) throw new Error(error.message);
    return (rows ?? []).map((r: any) => ({
      id: r.id,
      user_id: r.user_id,
      role: r.role,
      status: r.status,
      email: r.profiles?.email ?? null,
      full_name: r.profiles?.full_name ?? null,
    }));
  });

export const addTeamMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        businessId: z.string().uuid(),
        email: z.string().email(),
        role: z.enum(ASSIGNABLE),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId, data.businessId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const email = data.email.trim().toLowerCase();

    const { data: profile } = await (supabaseAdmin as any)
      .from("profiles")
      .select("id, email")
      .ilike("email", email)
      .maybeSingle();

    if (!profile) {
      throw new Error(
        "No Daraven ERP account found for that email. Ask them to sign up first, then add them.",
      );
    }

    const { error } = await (supabaseAdmin as any).from("user_businesses").upsert(
      {
        business_id: data.businessId,
        user_id: profile.id,
        role: data.role,
        status: "active",
      },
      { onConflict: "user_id,business_id" },
    );
    if (error) throw new Error(error.message);
    return { ok: true, email: profile.email };
  });

export const updateTeamMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        businessId: z.string().uuid(),
        memberId: z.string().uuid(),
        role: z.enum(ASSIGNABLE).optional(),
        status: z.enum(["active", "suspended"]).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId, data.businessId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: member } = await (supabaseAdmin as any)
      .from("user_businesses")
      .select("id, role, user_id")
      .eq("id", data.memberId)
      .eq("business_id", data.businessId)
      .maybeSingle();
    if (!member) throw new Error("Member not found");
    if (member.role === "owner") throw new Error("The business owner cannot be modified");

    const patch: Record<string, string> = {};
    if (data.role) patch.role = data.role;
    if (data.status) patch.status = data.status;
    if (!Object.keys(patch).length) return { ok: true };

    const { error } = await (supabaseAdmin as any)
      .from("user_businesses")
      .update(patch)
      .eq("id", data.memberId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const removeTeamMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ businessId: z.string().uuid(), memberId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId, data.businessId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: member } = await (supabaseAdmin as any)
      .from("user_businesses")
      .select("id, role, user_id")
      .eq("id", data.memberId)
      .eq("business_id", data.businessId)
      .maybeSingle();
    if (!member) throw new Error("Member not found");
    if (member.role === "owner") throw new Error("The business owner cannot be removed");
    if (member.user_id === context.userId) throw new Error("You cannot remove yourself");

    const { error } = await (supabaseAdmin as any)
      .from("user_businesses")
      .delete()
      .eq("id", data.memberId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
