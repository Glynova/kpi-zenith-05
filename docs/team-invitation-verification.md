# Invitation repair verification — 17 October 2026

## Changes

- `src/lib/invite-links.ts` — single `APP_URL` constant, invite URL builder, OAuth callback URL builder, token format check and invitation state handling.
- `src/lib/invite-links.test.ts` — 8 tests, including fixed production destinations for invite and auth redirect URLs, malformed tokens, invalid/expired/revoked/used invitation states.
- `src/lib/team.functions.ts` — generated and reissued links use `APP_URL`; client origin and public URL configuration are not accepted.
- `supabase/functions/invite-signup/index.ts` — validates invitation token hash, pending status, expiry and email match; creates a confirmed auth user, signs in, accepts the invitation under that user session and returns the session/business ID. Deletes the new auth user if sign-in/acceptance fails.
- `supabase/functions/_shared/invite-validation.ts` — token hash and invitation state/email validation shared by the Edge Function.
- `supabase/config.toml` — disables gateway JWT verification only for the token-gated `invite-signup` endpoint.
- `src/routes/invite.$token.tsx` — invokes the Edge Function for password signup, installs its session, selects the returned workspace and redirects to `${APP_URL}/dashboard`; existing-user sign-in and Google callback remain available.
- `src/lib/invite-signup.test.ts` — token format/hash, status, expiry and email-match tests.
- `src/components/team-access.tsx` — invite requests no longer send the browser origin; pending-invite resend rotates the token and returns a fresh production-domain link.
- `src/routes/auth_.callback.tsx` — validated invitation query survives OAuth return even when session storage is absent.
- `docs/team-invitations.md` — fixed domain behavior, required production auth redirect paths and pending-invite replacement guidance.
- `AGENTS.md`, `roadmap.md` — architectural rule and verification/blocker status.
- Project memory — recorded first-party URL and secure existing-workspace requirements.

## Actual checks

- `npx vitest run src/lib/invite-signup.test.ts src/lib/invite-links.test.ts`: all **11 focused tests passed**.
- Targeted ESLint on the changed invitation route, helper, server function, team component and tests: **passed**.
- `npm run build`: **passed**.
- Full `npx vitest run`: **61 passed, 1 unrelated failure** in `src/lib/qrph.test.ts`; it expected the secret source label `Paymongo_Webhook_Secret` but received `PAYMONGO_WEBHOOK_SECRET`.
- Edge Function local runtime/type check was not available because neither Deno nor the Supabase CLI is installed in this workspace.
- Current database function definitions and current membership/invitation RLS read and reviewed: verified email, token hash lookup, expiry/revocation, row lock, stored role and business-scoped activation remain in the existing transactional acceptance function. Current INSERT membership policy requires business admin; historical self-join policy is not present.
- Browser: real `/invite/invalid` showed invalid-link message. Real anonymous lookup of an unknown well-formed token returned HTTP 200 with `[]` and showed invalid-link message.
- Browser, simulated lookup responses only: pending invitation showed create-login, Google, and existing-user sign-in controls; switching to existing-user sign-in worked. Expired and revoked invitations hid login/acceptance controls. Revoked page checked at 390px with no horizontal overflow; desktop checked at 1280px. Screenshots inspected. **Zero browser runtime errors.**
- Direct read-query tool could not execute the lookup function because that tool's role lacks EXECUTE; browser anonymous access subsequently succeeded and independently verified the real invalid-token path.

## Not tested or changed

No invitation created/reissued against real customers; no accounts created; no email sent. The new Edge Function was not deployed or invoked, so actual confirmed-user creation, sign-in, acceptance and dashboard access were **not** exercised end-to-end. Actual Google sign-in and hosted email redirect allowlist remain unverified. Earlier UI expired/revoked checks used simulated lookup replies, not expired/revoked database records. URL and invite validation tests are pure unit tests, not a published-host check.

No migration was necessary: existing `0048_team_invitations.sql` already supplies the hashed token table, RLS and transactional acceptance. No database writes, permissions changes, secret changes, hosted authentication changes, Edge Function deployment or publication occurred. Hosted Site URL/redirect allowlist remains unverified: see `team-invitations.md`. Previously distributed pending invites must be reissued to create a fresh link on `APP_URL`; unpublished changes do not fix the currently published site.