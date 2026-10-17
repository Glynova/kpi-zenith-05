import { describe, expect, it } from "vitest";
import {
  APP_URL,
  buildInviteAuthRedirectUrl,
  buildInviteUrl,
  invitationError,
  isInviteToken,
} from "./invite-links";

const token = "a".repeat(64);
describe("production invitation URLs", () => {
  it("uses the single production APP_URL for invite links", () => {
    expect(APP_URL).toBe(import.meta.env.VITE_PUBLIC_APP_URL || "https://daraven.com");
    expect(buildInviteUrl(token)).toBe(`${APP_URL}/invite/${token}`);
  });
  it("uses an explicit server APP_URL without adding a duplicate slash", () => {
    expect(buildInviteUrl(token, "https://daraven.com/")).toBe(
      `https://daraven.com/invite/${token}`,
    );
  });
  it("uses APP_URL for signup confirmation and OAuth callback redirects", () => {
    expect(buildInviteAuthRedirectUrl(token)).toBe(`${APP_URL}/auth/callback?invite=${token}`);
  });
  it("rejects malformed tokens for every invitation URL", () => {
    expect(isInviteToken("//attacker.example")).toBe(false);
    expect(() => buildInviteUrl("invalid")).toThrow("not valid");
    expect(() => buildInviteAuthRedirectUrl("invalid")).toThrow("not valid");
  });
});
describe("invitation acceptance states", () => {
  it("rejects invalid invitations", () =>
    expect(invitationError(null)).toBe("This invitation link is not valid."));
  it("rejects expired invitations", () =>
    expect(invitationError({ status: "pending", expired: true })).toBe(
      "This invitation has expired. Ask the workspace owner for a new link.",
    ));
  it("rejects revoked invitations", () =>
    expect(invitationError({ status: "revoked", expired: false })).toBe(
      "This invitation was cancelled.",
    ));
  it("rejects used invitations", () =>
    expect(invitationError({ status: "accepted", expired: false })).toBe(
      "This invitation was already used.",
    ));
  it("allows valid pending invitations", () =>
    expect(invitationError({ status: "pending", expired: false })).toBeNull());
});
