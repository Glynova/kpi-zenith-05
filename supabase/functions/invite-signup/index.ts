import { createClient } from "npm:@supabase/supabase-js@2";
import { hashInviteToken, isInviteToken, validateInvite } from "../_shared/invite-validation.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function respond(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function handleRequest(request: Request): Promise<Response> {
  try {
    return await handleRequestInner(request);
  } catch (error) {
    console.error(
      "invite-signup request failed",
      error instanceof Error ? error.message : "Unknown error",
    );
    return respond(
      { code: "internal_error", message: "Could not process this invitation. Please try again." },
      500,
    );
  }
}

async function handleRequestInner(request: Request): Promise<Response> {
  if (request.method === "OPTIONS")
    return new Response(null, { status: 204, headers: corsHeaders });
  if (request.method !== "POST") return respond({ code: "method_not_allowed" }, 405);

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return respond({ code: "invalid_request", message: "Invalid request body." }, 400);
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return respond({ code: "invalid_request", message: "Invalid request body." }, 400);
  }

  const body = payload as Record<string, unknown>;
  const { token, password } = body;
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const fullName = typeof body.fullName === "string" ? body.fullName.trim() : "";
  if (
    !isInviteToken(token) ||
    !email ||
    !/^\S+@\S+\.\S+$/.test(email) ||
    typeof password !== "string" ||
    password.length < 8
  ) {
    return respond(
      {
        code: "invalid_request",
        message: "Check the invitation and account details, then try again.",
      },
      400,
    );
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const publicKey = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
  if (!supabaseUrl || !serviceRoleKey || !publicKey) {
    return respond(
      { code: "server_configuration", message: "Account setup is temporarily unavailable." },
      500,
    );
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
  const userClient = createClient(supabaseUrl, publicKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });

  const tokenHash = await hashInviteToken(token);
  const { data: invite, error: lookupError } = await admin
    .from("team_invitations")
    .select("email, status, expires_at")
    .eq("token_hash", tokenHash)
    .maybeSingle();
  if (lookupError) {
    return respond(
      { code: "invite_lookup_failed", message: "Could not validate this invitation." },
      500,
    );
  }

  const invalidReason = validateInvite(invite, email);
  if (invalidReason) {
    const messages = {
      invalid: "This invitation link is not valid.",
      used: "This invitation was already used or cancelled.",
      expired: "This invitation has expired. Ask the workspace owner for a new link.",
      email_mismatch: "This invitation was sent to a different email address.",
    };
    return respond({ code: invalidReason, message: messages[invalidReason] }, 400);
  }

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });
  if (createError || !created.user) {
    if (
      createError?.code === "email_exists" ||
      /already (registered|exists)/i.test(createError?.message ?? "")
    ) {
      return respond(
        {
          code: "account_exists",
          message: "An account already exists for this email. Sign in to accept the invitation.",
        },
        409,
      );
    }
    return respond(
      { code: "account_creation_failed", message: "Could not create this account." },
      400,
    );
  }

  try {
    const { data: authData, error: signInError } = await userClient.auth.signInWithPassword({
      email,
      password,
    });
    if (signInError || !authData.session) throw new Error("Could not sign in the new account.");

    const { data: businessId, error: acceptError } = await userClient.rpc(
      "accept_team_invitation",
      { _token: token },
    );
    if (acceptError || typeof businessId !== "string") {
      throw new Error("Could not accept this invitation.");
    }

    return respond({ session: authData.session, businessId });
  } catch {
    await admin.auth.admin.deleteUser(created.user.id);
    return respond(
      {
        code: "invite_acceptance_failed",
        message: "Could not finish joining this workspace. Ask the owner to resend the invitation.",
      },
      400,
    );
  }
}

Deno.serve(handleRequest);
