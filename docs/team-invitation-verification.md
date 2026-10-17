# Invitation repair verification — 17 October 2026

## Changes

- `src/lib/invite-links.ts` — shared canonical public URL/preview resolver, token format check and invitation state handling.
- `src/lib/invite-links.test.ts` — 12 tests, including exact `https://daraven.com` production destination, rejection of editor/project origins, preview-only origin usage, malformed tokens, invalid/expired/revoked/used invitation states.
- `src/lib/team.functions.ts` — generated links use server-observed Origin and optional `PUBLIC_APP_URL`, not the client-supplied origin.
- `src/routes/invite.$token.tsx` — invalid-token guard, lookup error handling, canonical confirmation return, Google return with token, selection of the business returned by acceptance and membership refresh; no separate business creation.
- `src/routes/auth_.callback.tsx` — validated invitation query survives OAuth return even when session storage is absent.
- `docs/team-invitations.md` — public URL configuration, precise required authentication redirect paths and old-link replacement guidance.
- `AGENTS.md`, `roadmap.md` — architectural rule and verification/blocker status.
- Project memory — recorded first-party URL and secure existing-workspace requirements.

## Actual checks

- `bunx vitest run`: all **63 tests across 6 files passed**, including 12 new invitation tests.
- Targeted ESLint on all five invitation implementation/test files: **passed**, after formatting.
- Harness compilation log: **build OK** following code changes. No manual build or standalone typecheck command was run (this environment performs those automatically); no separate typecheck result was exposed, so standalone typecheck is **not claimed**.
- Current database function definitions and current membership/invitation RLS read and reviewed: verified email, token hash lookup, expiry/revocation, row lock, stored role and business-scoped activation remain in the existing transactional acceptance function. Current INSERT membership policy requires business admin; historical self-join policy is not present.
- Browser: real `/invite/invalid` showed invalid-link message. Real anonymous lookup of an unknown well-formed token returned HTTP 200 with `[]` and showed invalid-link message.
- Browser, simulated lookup responses only: pending invitation showed create-login, Google, and existing-user sign-in controls; switching to existing-user sign-in worked. Expired and revoked invitations hid login/acceptance controls. Revoked page checked at 390px with no horizontal overflow; desktop checked at 1280px. Screenshots inspected. **Zero browser runtime errors.**
- Direct read-query tool could not execute the lookup function because that tool's role lacks EXECUTE; browser anonymous access subsequently succeeded and independently verified the real invalid-token path.

## Not tested or changed

No invitation created/reissued against real customers; no accounts created; no email sent. Actual Google/email confirmation, acceptance, membership activation and signed-in joined-workspace access were **not** exercised end-to-end. UI expired/revoked checks used simulated lookup replies, not expired/revoked database records. The resolver tests are pure URL tests, not a published-host check.

No migration was necessary: existing `0048_team_invitations.sql` already supplies the hashed token table, RLS and transactional acceptance. No database writes, permissions changes, secret changes, hosted authentication changes or publication occurred. Hosted Site URL/redirect allowlist remains unverified: see the configuration checklist in `team-invitations.md`. Previously distributed editor/project links must be reissued; unpublished changes do not fix the currently published site.