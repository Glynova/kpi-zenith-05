# Team invitation domains and authentication

Production links use `https://daraven.com/invite/<64-character-token>` when the runtime origin is Daraven or its known published app host. Real `id-preview--<project-id>.lovable.app` runtime origins keep that preview host. Localhost is never returned, even in development. Missing configuration on a local, unknown, or editor/project session produces a clear error before any invitation is saved or rotated. The server ignores the client-submitted origin and never trusts forwarded host headers.

### Exact configuration steps

1. Open **Project Settings → Secrets** and add `PUBLIC_APP_URL` with value `https://daraven.com`. This server variable is read inside invitation creation. No existing credentials need changing.
2. For browser email-confirmation/Google return URL resolution on a non-deployed session, set the public build variable `VITE_PUBLIC_APP_URL=https://daraven.com` in project environment configuration. This value is intentionally public, not a credential. Deployed Daraven and recognized app-preview origins do not require this fallback.
3. Use only an HTTPS deployed app origin, without credentials. Localhost, IP addresses, editor/project hosts and generic preview domains are rejected. A real preview origin is used only when observed at runtime, never by configuring an arbitrary preview URL as production.
4. After configuration, reissue previous localhost links from Pending invitations. Preview links may require project access; for outside staff use the public Daraven domain rather than a restricted preview.

No environment values or hosted settings were changed by this repair. Frontend and TanStack server-function changes require publication before affecting the published app; no publication was performed.

The New invitation role selector is independent of pending rows. Each row shows its stored role; its Resend action uses that same stored role, not the new invitation selector.

## Authentication domain requirements

In Lovable Cloud authentication URL settings, the production Site URL should be `https://daraven.com`. The redirect allowlist must include:

- `https://daraven.com/auth/callback` (including query parameters such as `?invite=<token>`)
- `https://daraven.com/invite/*` (email confirmation returning directly to the token route)
- `https://daraven.com/reset-password`
- Equivalent paths on `https://www.daraven.com` if sign-in is served there without redirecting to the canonical host
- The exact project's app-preview origin with `/auth/callback` (including queries) and `/invite/*` only when preview testing is needed

For providers whose allowlist matcher treats queries literally, use `https://daraven.com/auth/callback**` to cover the optional invite query, not a wildcard external host. Never add editor/project URLs or broad `https://**` rules. Configure preview callbacks on that exact preview host, not every preview project.

Google uses the existing managed OAuth broker. Daraven's custom domain must be active in project domain settings; managed custom domains are included automatically. Do not replace its provider callback with the invitation URL: `/auth/callback?invite=<token>` is the application's return destination, not Google's provider callback. Keep the broker-managed callback unchanged.

No hosted authentication configuration was modified by this repair. The configuration tool available here does not expose Site URL/redirect allowlist inspection; those settings remain unverified and must be checked in Cloud authentication settings. A confirmation email may fall back to Site URL if its redirect is not allowed.

## Acceptance and safety

Owners/admins generate or reissue a private join link; no automatic invitation email is sent. Reissue replaces the pending token hash, invalidating the previous link. Tokens are random 32-byte values; only SHA-256 hashes are stored. Do not paste tokens into logs or analytics.

The existing transactional `accept_team_invitation` database function locks the invite, verifies the signed-in identity and confirmed invited email, rejects invalid/expired/revoked links, applies the stored non-owner role and joins the existing business. It returns the joined business ID, which the UI selects before opening the workspace. Existing accounts can sign in; new invitees create their own password, confirm their email, and return directly to the invite (including in a new browser). No separate business is created by this route. The same accepting user can safely retry the database acceptance, without duplicate membership. Existing membership RLS only allows admins to insert members; there is no self-join INSERT policy in the current database.

Old links pointing at editor/project hosts cannot be rescued by Daraven because those hosts do not serve this app. Reissue them from Pending invitations and send the new Daraven link. This repair does not publish the app.