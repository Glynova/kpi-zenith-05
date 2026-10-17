import { describe, expect, it } from "vitest";
import { buildInviteUrl, invitationError, isInviteToken, publicAppBaseUrl } from "./invite-links";

const token = "a".repeat(64);
describe("first-party invitation URLs", () => {
  it("defaults production links to daraven.com", () => {
    expect(buildInviteUrl(token, "https://daravenerp.lovable.app")).toBe(
      `https://daraven.com/invite/${token}`,
    );
  });
  it("never uses lovableproject.com even when submitted or configured", () => {
    const link = buildInviteUrl(
      token,
      "https://project.lovableproject.com",
      "https://project.lovableproject.com",
    );
    expect(link).toBe(`https://daraven.com/invite/${token}`);
    expect(link).not.toContain("lovableproject.com");
  });
  it("does not trust arbitrary submitted origins", () => {
    expect(publicAppBaseUrl("https://attacker.example")).toBe("https://daraven.com");
  });
  it("uses a configured HTTPS public app base", () => {
    expect(publicAppBaseUrl("https://attacker.example", "https://www.daraven.com/path")).toBe(
      "https://www.daraven.com",
    );
  });
  it("keeps real app previews on their preview origin", () => {
    const origin = "https://id-preview--c5cdce3b-6d7c-40eb-9e3a-30c3cb8fa501.lovable.app";
    expect(buildInviteUrl(token, origin)).toBe(`${origin}/invite/${token}`);
  });
  it("only uses localhost in explicit development preview", () => {
    expect(publicAppBaseUrl("http://localhost:8080")).toBe("https://daraven.com");
    expect(publicAppBaseUrl("http://localhost:8080", undefined, true)).toBe(
      "http://localhost:8080",
    );
  });
  it("rejects invalid tokens and callback path injection", () => {
    expect(isInviteToken("//attacker.example")).toBe(false);
    expect(() => buildInviteUrl("invalid")).toThrow("not valid");
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
