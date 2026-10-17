export const APP_URL = "https://daraven.com";
export const PENDING_INVITE_KEY = "daraven_pending_invite";

export function isInviteToken(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}

export function buildInviteUrl(token: string): string {
  if (!isInviteToken(token)) throw new Error("This invitation link is not valid");
  return `${APP_URL}/invite/${token}`;
}

export function buildInviteAuthRedirectUrl(token: string): string {
  if (!isInviteToken(token)) throw new Error("This invitation link is not valid");
  return `${APP_URL}/auth/callback?invite=${encodeURIComponent(token)}`;
}

export type InvitationState = { status: string; expired: boolean };
export function invitationError(invite: InvitationState | null): string | null {
  if (!invite) return "This invitation link is not valid.";
  if (invite.status === "accepted") return "This invitation was already used.";
  if (invite.status !== "pending") return "This invitation was cancelled.";
  if (invite.expired) return "This invitation has expired. Ask the workspace owner for a new link.";
  return null;
}
