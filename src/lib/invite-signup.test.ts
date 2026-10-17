import { describe, expect, it } from "vitest";
import {
  hashInviteToken,
  isInviteToken,
  validateInvite,
} from "../../supabase/functions/_shared/invite-validation";

const token = "a".repeat(64);
const pendingInvite = {
  email: "member@example.com",
  status: "pending",
  expires_at: "2026-10-18T00:00:00.000Z",
};

describe("invite signup validation", () => {
  it("accepts only 64-character hexadecimal tokens", () => {
    expect(isInviteToken(token)).toBe(true);
    expect(isInviteToken("short")).toBe(false);
    expect(isInviteToken("g".repeat(64))).toBe(false);
  });

  it("hashes tokens using the database SHA-256 representation", async () => {
    await expect(hashInviteToken(token)).resolves.toBe(
      "ffe054fe7ae0cb6dc65c3af9b61d5209f439851db43d0ba5997337df154668eb",
    );
  });

  it("requires a pending, unexpired invite and matching email", () => {
    expect(
      validateInvite(pendingInvite, " MEMBER@example.com ", Date.parse("2026-10-17T00:00:00Z")),
    ).toBeNull();
    expect(validateInvite(null, "member@example.com")).toBe("invalid");
    expect(validateInvite({ ...pendingInvite, status: "accepted" }, pendingInvite.email)).toBe(
      "used",
    );
    expect(
      validateInvite({ ...pendingInvite, expires_at: "2026-10-16T00:00:00Z" }, pendingInvite.email),
    ).toBe("expired");
    expect(validateInvite({ ...pendingInvite, expires_at: "invalid" }, pendingInvite.email)).toBe(
      "expired",
    );
    expect(validateInvite(pendingInvite, "other@example.com")).toBe("email_mismatch");
  });
});
