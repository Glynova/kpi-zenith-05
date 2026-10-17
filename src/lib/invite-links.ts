export const DEFAULT_PUBLIC_APP_URL = "https://daraven.com";
export const PENDING_INVITE_KEY = "daraven_pending_invite";

export function isInviteToken(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}

export const INVITE_URL_CONFIG_ERROR = "Invitation links are not configured for this session. Set PUBLIC_APP_URL to https://daraven.com in Project Settings → Secrets and VITE_PUBLIC_APP_URL for browser confirmation links.";

function safePublicBase(value: string): string {
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.hostname === "localhost" ||
      url.hostname.endsWith(".localhost") ||
      !url.hostname.includes(".") ||
      /^[\d.]+$/.test(url.hostname) ||
      url.hostname.includes(":") ||
      /(^|\.)(lovableproject\.com|lovableproject-dev\.com|lovable\.app|lovable\.dev|gpt-eng\.com|gptengineer\.app)$/.test(
        url.hostname,
      )
    ) {
      throw new Error(INVITE_URL_CONFIG_ERROR);
    }
    return url.origin;
  } catch {
    throw new Error(INVITE_URL_CONFIG_ERROR);
  }
}

/** Only actual app previews are allowed, never editor/project hosts. */
export function publicAppBaseUrl(
  origin?: string,
  configured?: string,
): string {
  try {
    const url = new URL(origin ?? "");
    if (
      !url.username &&
      !url.password &&
      url.protocol === "https:" &&
      /^id-preview(?:-[a-z0-9]+)?--[a-f0-9-]{36}\.lovable\.app$/.test(url.hostname)
    )
      return url.origin;
  } catch {
    /* No usable deployed runtime origin. */
  }
  if (configured) return safePublicBase(configured);
  if (["https://daraven.com", "https://www.daraven.com", "https://daravenerp.lovable.app"].includes(origin ?? "")) return DEFAULT_PUBLIC_APP_URL;
  throw new Error(INVITE_URL_CONFIG_ERROR);
}

export function buildInviteUrl(
  token: string,
  origin?: string,
  configured?: string,
): string {
  if (!isInviteToken(token)) throw new Error("This invitation link is not valid");
  return `${publicAppBaseUrl(origin, configured)}/invite/${token}`;
}

export type InvitationState = { status: string; expired: boolean };
export function invitationError(invite: InvitationState | null): string | null {
  if (!invite) return "This invitation link is not valid.";
  if (invite.status === "accepted") return "This invitation was already used.";
  if (invite.status !== "pending") return "This invitation was cancelled.";
  if (invite.expired) return "This invitation has expired. Ask the workspace owner for a new link.";
  return null;
}
