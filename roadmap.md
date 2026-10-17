# Roadmap

- [x] Invitation URL canonicalization: invite links, signup confirmation and OAuth redirects use `APP_URL` from `VITE_PUBLIC_APP_URL` or the `https://daraven.com` fallback; server-generated links prefer server-side `APP_URL`, never client/runtime origin. Pending invite resend rotates to a fresh production-domain link. Focused verification passed; no publication.
- [x] Invite password signup: native TanStack `inviteSignup` server function verifies pending token, expiry and invited email before admin-creating a confirmed user, signing in and accepting the stored role; redirect to production dashboard. Normal `/auth` signup remains confirmation-gated. Focused tests and build passed; no publication or real account test.

- [x] Urgent invitation repair: canonical production links, validated callback token, selected joined workspace; 63 tests and targeted lint passed, automatic build OK; real unknown-token lookup and simulated pending/expired/revoked screens verified without accounts or publishing.
- [ ] Invitation real-user end-to-end acceptance and hosted redirect allowlist verification (no live accounts used; hosted redirect settings remain unavailable).

- [x] Responsive ERP headers, toolbars, cards and tables; verified 20 signed-in pages at mobile/tablet/desktop without transaction writes.
- [x] Replace approximated branding with official gold/light and blue/dark SVG artwork; verified signed-in workspace, affiliate and admin plus always-dark public headers at 390/768/1280px, mobile navigation and collapsed raven icons in both themes; no access-rule changes.
- [x] KPIOptiva visual system pass: dark-first HSL tokens with light-theme support, shared glass surfaces/forms/tables/overlays, 280px workspace sidebar and 72px topbar, flatter navigation, responsive Stock Movements KPIs/product cells, semantic movement badges and reduced-motion-safe row reveals. Production build passed; 62/63 tests pass with one unrelated PayMongo secret-label assertion; visual mobile preview inspected.

- [ ] Business Setup Wizard rework (10 steps: Business profile, Legal & tax, What you sell, Inventory & tracking, Sales & purchasing, Locations, Units, Costing, Product defaults, Review)
  - Hydrate from current businesses / business_compliance / business_settings / warehouses / units; keep drafts
  - All capability toggles go through withPrerequisites; show dependents on disable
  - Business-type recommendations only via explicit button with diff preview
  - Costing selector locked when business_has_costed_stock (DB guard stays authoritative)
  - Save: businesses update, business_compliance upsert, business_settings upsert (incl. tax/sales rules), warehouses dedupe, units/conversions dedupe with same-family validation
  - QA: fresh, resume, completed business, PH VAT/non-VAT, non-PH, multi-location, units on/off, variants/BOM/production, POS/register, costing guard, no duplicates

- [x] Bulk import: variants (Parent SKU + Variant Options) and made-from components (Components column)
- [ ] Remove import test items TV-*/TV2-* in beef n buns (needs privileged cleanup)
- [ ] Offline POS hardening (IndexedDB queue, per-till idempotent sync, sync status panel)
- [ ] Parallel multi-client document numbering stress test
