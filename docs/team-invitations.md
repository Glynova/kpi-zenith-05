# Team invitation domains and authentication

All invitation URLs use the single `APP_URL` constant in `src/lib/invite-links.ts`, currently `https://daraven.com`. This applies to copied join links, signup confirmation email returns and OAuth callback redirects. Runtime origins, Lovable preview hosts, client-submitted origins and environment overrides do not affect invitation URLs.

### Existing pending invitations

Invitation rows store only a token hash, so their original raw link cannot be reconstructed. Use **Resend** on a pending invitation to rotate its token and receive a fresh `https://daraven.com/invite/<token>` link; this invalidates the previous token. Previously shared preview links cannot be rewritten in a recipient's email or message.

Frontend and TanStack server-function changes require publication before affecting the published app; no publication was performed.

The New invitation role selector is independent of pending rows. Each row shows its stored role; its Resend action uses that same stored role, not the new invitation selector.

## Authentication domain requirements

In Lovable Cloud authentication URL settings, the production Site URL should be `https://daraven.com`. The redirect allowlist must include:

- `https://daraven.com/auth/callback` (including query parameters such as `?invite=<token>`)
- `https://daraven.com/invite/*` (email confirmation returning directly to the token route)
- `https://daraven.com/reset-password`

For providers whose allowlist matcher treats queries literally, use `https://daraven.com/auth/callback**` to cover the optional invite query. Invite flows always return to Daraven production, including when initiated from a preview. Never add editor/project URLs or broad `https://**` rules.

Google uses the existing managed OAuth broker. Daraven's custom domain must be active in project domain settings; managed custom domains are included automatically. Do not replace its provider callback with the invitation URL: `/auth/callback?invite=<token>` is the application's return destination, not Google's provider callback. Keep the broker-managed callback unchanged.

No hosted authentication configuration was modified. The configuration tool available here does not expose Site URL/redirect allowlist inspection; those settings remain unverified and must be checked in Cloud authentication settings. A confirmation email may fall back to Site URL if its redirect is not allowed.

## Acceptance and safety

Owners/admins generate or reissue a private join link; no automatic invitation email is sent. Reissue replaces the pending token hash, invalidating the previous link. Tokens are random 32-byte values; only SHA-256 hashes are stored. Do not paste tokens into logs or analytics.

The existing transactional `accept_team_invitation` database function locks the invite, verifies the signed-in identity and confirmed invited email, rejects invalid/expired/revoked links, applies the stored non-owner role and joins the existing business. It returns the joined business ID, which the UI selects before opening the workspace. Existing accounts can sign in; new invitees create their own password, confirm their email, and return directly to the invite (including in a new browser). No separate business is created by this route. The same accepting user can safely retry the database acceptance, without duplicate membership. Existing membership RLS only allows admins to insert members; there is no self-join INSERT policy in the current database.

Reissue pending invitations created before this change to provide a production-domain link. This repair does not publish the app.