/**
 * Browser-side referral capture.
 *
 * The stored code is only a *hint*: real attribution is persisted server-side
 * against the business row the moment a workspace is created, so it never
 * depends on the cookie/localStorage surviving.
 */
const KEY = "daraven-referral";

type StoredReferral = { code: string; at: number };

export function storeReferralCode(code: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify({ code, at: Date.now() } satisfies StoredReferral));
    // Mirrored as a cookie so a server-rendered signup can read it too.
    document.cookie = `${KEY}=${encodeURIComponent(code)}; path=/; max-age=${60 * 60 * 24 * 30}; samesite=lax`;
  } catch {
    /* storage disabled — attribution simply falls back to promo codes */
  }
}

export function readReferralCode(maxAgeDays = 30): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredReferral;
    if (!parsed?.code) return null;
    if (Date.now() - parsed.at > maxAgeDays * 86_400_000) return null;
    return parsed.code;
  } catch {
    return null;
  }
}

export function clearReferralCode() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(KEY);
    document.cookie = `${KEY}=; path=/; max-age=0`;
  } catch {
    /* noop */
  }
}
