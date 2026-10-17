export const DEFAULT_PUBLIC_APP_URL = "https://daraven.com";
export const PENDING_INVITE_KEY = "daraven_pending_invite";

export function isInviteToken(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}

function safePublicBase(value?: string): string {
  if (!value) return DEFAULT_PUBLIC_APP_URL;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password ||
      /(^|\.)(lovableproject\.com|lovableproject-dev\.com|lovable\.app|lovable\.dev|gpt-eng\.com|gptengineer\.app)$/.test(url.hostname)) {
      return DEFAULT_PUBLIC_APP_URL;
    }
    return url.origin;
  } catch {
    return DEFAULT_PUBLIC_APP_URL;
  }
}

/** Only actual app previews are allowed, never editor/project hosts. */
export function publicAppBaseUrl(origin?: string, configured?: string, localPreview = false): string {
  try {
    const url = new URL(origin ?? "");
    if (!url.username && !url.password && (
      (url.protocol === "https:" && /^id-preview(?:-[a-z0-9]+)?--[a-f0-9-]{36}\.lovable\.app$/.test(url.hostname)) ||
      (localPreview && url.protocol === "http:" && url.hostname === "localhost" && url.port === "8080")
    )) return url.origin;
  } catch { /* Invalid origins use the canonical public app. */ }
  return safePublicBase(configured);
}

export function buildInviteUrl(token: string, origin?: string, configured?: string, localPreview = false): string {
  if (!isInviteToken(token)) throw new Error("This invitation link is not valid");
  return `${publicAppBaseUrl(origin, configured, localPreview)}/invite/${token}`;
}

export type InvitationState = { status: string; expired: boolean };
export function invitationError(invite: InvitationState | null): string | null {
  if (!invite) return "This invitation link is not valid.";
  if (invite.status === "accepted") return "This invitation was already used.";
  if (invite.status !== "pending") return "This invitation was cancelled.";
  if (invite.expired) return "This invitation has expired. Ask the workspace owner for a new link.";
  return null;
}