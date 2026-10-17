# Team invitation domains and authentication

All invitation URLs and invitation auth redirects use the `APP_URL` constant in `src/lib/invite-links.ts`, sourced from `VITE_PUBLIC_APP_URL` with `https://daraven.com` as fallback. Set the public build variable to `https://daraven.com` in production. Server-generated invitation links prefer the server-side `APP_URL` environment variable and never use the request/browser origin. Do not set either variable to a Lovable preview host.

Password signup from `/invite/<token>` calls the `invite-signup` Supabase Edge Function. It checks the token hash, pending status, expiry and case-insensitive email match before creating a user with `email_confirm: true`. It then signs the new user in and calls the existing transactional acceptance function, which adds the member with the stored invitation role. The browser installs the returned session and navigates to `https://daraven.com/dashboard`. Invite-based password signup does not require email confirmation. Normal public signup at `/auth` continues to require email confirmation. Existing accounts can sign in from the invitation page; Google OAuth continues through the validated auth callback.

### Existing pending invitations

Invitation rows store only a token hash, so their original raw link cannot be reconstructed. Use **Resend** on a pending invitation to rotate its token and receive a fresh `https://daraven.com/invite/<token>` link; this invalidates the previous token. Previously shared preview links cannot be rewritten in a recipient's email or message.

The Edge Function must be deployed and frontend changes published before this flow is available on the live app; neither was performed here.

The New invitation role selector is independent of pending rows. Each row shows its stored role; its Resend action uses that same stored role, not the new invitation selector.

## Authentication domain requirements

In Lovable Cloud authentication URL settings, the production Site URL should be `https://daraven.com`. The redirect allowlist must include:

- `https://daraven.com/auth/callback` (including query parameters such as `?invite=<token>`)
- `https://daraven.com/invite/*` for older outstanding signup confirmation emails issued before invite signup became confirmation-free
- `https://daraven.com/reset-password`

For providers whose allowlist matcher treats queries literally, use `https://daraven.com/auth/callback**` to cover the optional invite query. Invite flows always return to Daraven production, including when initiated from a preview. Never add editor/project URLs or broad `https://**` rules.

Google uses the existing managed OAuth broker. Daraven's custom domain must be active in project domain settings; managed custom domains are included automatically. Do not replace its provider callback with the invitation URL: `/auth/callback?invite=<token>` is the application's return destination, not Google's provider callback. Keep the broker-managed callback unchanged.

No hosted authentication configuration was modified. The configuration tool available here does not expose Site URL/redirect allowlist inspection; those settings remain unverified and must be checked in Cloud authentication settings. A confirmation email may fall back to Site URL if its redirect is not allowed.

## Acceptance and safety

Owners/admins generate or reissue a private join link; no automatic invitation email is sent. Reissue replaces the pending token hash, invalidating the previous link. Tokens are random 32-byte values; only SHA-256 hashes are stored. Do not paste tokens into logs or analytics.

The existing transactional `accept_team_invitation` database function locks the invite, verifies the signed-in identity and confirmed invited email, rejects invalid/expired/revoked links, applies the stored non-owner role and joins the existing business. The edge function only sets email confirmed after validating the invite and matching its email. It returns the authenticated session and joined business ID; the browser selects that business before redirecting to the production dashboard. No separate business is created by this route. Existing membership RLS only allows admins to insert members; there is no self-join INSERT policy in the current database.

Reissue pending invitations created before this change to provide a production-domain link. This repair does not publish the app.