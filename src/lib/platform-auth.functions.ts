/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Platform-admin authentication + authorization server functions.
 *
 * Authorization is always resolved server-side from public.platform_admins
 * (status = 'active'). Client state never grants access — every admin server
 * function re-verifies membership before touching privileged data.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const AUDIT_ACTIONS = [
  "admin_login_success",
  "admin_login_failed",
  "admin_access_denied",
  "admin_portal_access",
  "admin_logout",
  "admin_bootstrap",
] as const;

async function writeAudit(row: {
  user_id?: string | null;
  email?: string | null;
  action: (typeof AUDIT_ACTIONS)[number];
  success: boolean;
  detail?: Record<string, unknown> | null;
}) {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await (supabaseAdmin as any).from("platform_admin_audit").insert({
      user_id: row.user_id ?? null,
      email: row.email ? row.email.slice(0, 200) : null,
      action: row.action,
      success: row.success,
      detail: row.detail ?? null,
    });
  } catch {
    /* auditing must never break the auth flow */
  }
}

/** Who am I, from the platform-admin perspective? Server-authoritative. */
export const getPlatformAdminSession = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("platform_admins")
      .select("user_id, role, status")
      .eq("user_id", context.userId)
      .eq("status", "active")
      .maybeSingle();
    if (error) throw new Error(error.message);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { count } = await (supabaseAdmin as any)
      .from("platform_admins")
      .select("user_id", { count: "exact", head: true })
      .eq("status", "active");

    return {
      isPlatformAdmin: !!data,
      role: (data?.role ?? null) as string | null,
      email: (context.claims as any)?.email ?? null,
      userId: context.userId as string,
      /** True when nobody has claimed the platform yet (first-admin setup). */
      needsBootstrap: (count ?? 0) === 0,
    };
  });

/**
 * Records an admin auth event. Callable without a session so failed sign-ins
 * are recorded too; only a fixed set of actions and no credentials are stored.
 */
export const logAdminAuthEvent = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        action: z.enum(AUDIT_ACTIONS),
        success: z.boolean(),
        email: z.string().email().max(200).optional(),
        reason: z.string().max(300).optional(),
        path: z.string().max(300).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    await writeAudit({
      email: data.email ?? null,
      action: data.action,
      success: data.success,
      detail: { reason: data.reason ?? null, path: data.path ?? null },
    });
    return { ok: true };
  });

/**
 * Safe initial-admin setup. No credentials live in source:
 *  - if there is no active platform admin yet, the signed-in caller claims it;
 *  - otherwise a bootstrap token matching the PLATFORM_ADMIN_BOOTSTRAP_TOKEN
 *    server secret is required.
 */
export const bootstrapPlatformAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ token: z.string().max(300).optional() }).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;
    const email = ((context.claims as any)?.email ?? null) as string | null;

    const { count } = await admin
      .from("platform_admins")
      .select("user_id", { count: "exact", head: true })
      .eq("status", "active");

    if ((count ?? 0) > 0) {
      const expected = process.env["PLATFORM_ADMIN_BOOTSTRAP_TOKEN"];
      if (!expected || !data.token || data.token !== expected) {
        await writeAudit({
          user_id: context.userId,
          email,
          action: "admin_bootstrap",
          success: false,
          detail: { reason: "invalid_or_missing_bootstrap_token" },
        });
        throw new Error(
          "The platform already has an administrator. A valid bootstrap token is required.",
        );
      }
    }

    const { error } = await admin
      .from("platform_admins")
      .upsert(
        { user_id: context.userId, role: "superadmin", status: "active" },
        { onConflict: "user_id" },
      );
    if (error) throw new Error(error.message);

    await writeAudit({
      user_id: context.userId,
      email,
      action: "admin_bootstrap",
      success: true,
      detail: { first_admin: (count ?? 0) === 0 },
    });
    return { ok: true };
  });

/** Recent platform-admin auth/access audit entries (admins only). */
export const listAdminAuthAudit = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: me } = await context.supabase
      .from("platform_admins")
      .select("user_id")
      .eq("user_id", context.userId)
      .eq("status", "active")
      .maybeSingle();
    if (!me) throw new Error("Forbidden");
    const { data, error } = await context.supabase
      .from("platform_admin_audit")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return { entries: data ?? [] };
  });
