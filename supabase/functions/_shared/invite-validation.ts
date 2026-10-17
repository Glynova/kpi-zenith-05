export type InviteRecord = {
  email: string;
  status: string;
  expires_at: string;
};

export type InviteValidationError = "invalid" | "used" | "expired" | "email_mismatch";

export function isInviteToken(token: unknown): token is string {
  return typeof token === "string" && /^[a-f0-9]{64}$/.test(token);
}

export async function hashInviteToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function validateInvite(
  invite: InviteRecord | null,
  email: string,
  now = Date.now(),
): InviteValidationError | null {
  if (!invite) return "invalid";
  if (invite.status !== "pending") return "used";
  const expiresAt = Date.parse(invite.expires_at);
  if (!Number.isFinite(expiresAt) || expiresAt <= now) return "expired";
  if (invite.email.trim().toLowerCase() !== email.trim().toLowerCase()) return "email_mismatch";
  return null;
}
