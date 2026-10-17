/* eslint-disable @typescript-eslint/no-explicit-any */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getRequestHeader } from "@tanstack/react-start/server";
import { buildInviteUrl } from "@/lib/invite-links";

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
      .select("id, user_id, role, status, created_at")
      .eq("business_id", data.businessId)
      .order("created_at");
    if (error) throw new Error(error.message);
    // No FK between memberships and profiles, so join in code.
    const ids = (rows ?? []).map((r: any) => r.user_id);
    const { data: profs } = ids.length
      ? await (supabaseAdmin as any).from("profiles").select("id, email, full_name").in("id", ids)
      : { data: [] };
    const byId = new Map((profs ?? []).map((p: any) => [p.id, p]));
    return (rows ?? []).map((r: any) => {
      const p: any = byId.get(r.user_id);
      return {
        id: r.id,
        user_id: r.user_id,
        role: r.role,
        status: r.status,
        email: p?.email ?? null,
        full_name: p?.full_name ?? null,
      };
    });
  });

function newToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
async function sha256Hex(v: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(v));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Creates (or re-issues) a pending invitation and returns a one-time join link.
 * Only the token hash is stored; the raw token exists only in the returned link.
 */
export const addTeamMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        businessId: z.string().uuid(),
        email: z.string().email(),
        role: z.enum(ASSIGNABLE),
        origin: z.string().url(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId, data.businessId);
    // Resolve before any write, so missing configuration cannot rotate an existing token.
    const token = newToken();
    const link = buildInviteUrl(token, getRequestHeader("origin"), process.env["PUBLIC_APP_URL"]);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;
    const email = data.email.trim().toLowerCase();

    const { data: profile } = await admin
      .from("profiles")
      .select("id")
      .ilike("email", email)
      .maybeSingle();
    if (profile) {
      const { data: existing } = await admin
        .from("user_businesses")
        .select("id, status")
        .eq("business_id", data.businessId)
        .eq("user_id", profile.id)
        .maybeSingle();
      if (existing?.status === "active") throw new Error("That person is already on your team");
    }

    const token_hash = await sha256Hex(token);
    const expires_at = new Date(Date.now() + 7 * 864e5).toISOString();
    const { data: pending } = await admin
      .from("team_invitations")
      .select("id")
      .eq("business_id", data.businessId)
      .ilike("email", email)
      .eq("status", "pending")
      .maybeSingle();
    const { error } = pending
      ? await admin
          .from("team_invitations")
          .update({
            token_hash,
            role: data.role,
            expires_at,
            invited_by: context.userId,
            updated_at: new Date().toISOString(),
          })
          .eq("id", pending.id)
      : await admin.from("team_invitations").insert({
          business_id: data.businessId,
          email,
          role: data.role,
          token_hash,
          expires_at,
          invited_by: context.userId,
        });
    if (error) throw new Error("Could not create the invitation");
    return { ok: true, email, link, reissued: !!pending, hasAccount: !!profile };
  });

export const listInvitations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ businessId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId, data.businessId);
    const { data: rows, error } = await (context.supabase as any)
      .from("team_invitations")
      .select("id, email, role, status, expires_at, created_at")
      .eq("business_id", data.businessId)
      .eq("status", "pending")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (rows ?? []) as Array<{
      id: string;
      email: string;
      role: string;
      status: string;
      expires_at: string;
    }>;
  });

export const revokeInvitation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ businessId: z.string().uuid(), invitationId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId, data.businessId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await (supabaseAdmin as any)
      .from("team_invitations")
      .update({ status: "revoked", updated_at: new Date().toISOString() })
      .eq("id", data.invitationId)
      .eq("business_id", data.businessId)
      .eq("status", "pending");
    if (error) throw new Error("Could not cancel the invitation");
    return { ok: true };
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
