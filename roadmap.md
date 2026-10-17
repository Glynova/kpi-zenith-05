# Roadmap

- [x] Invitation URL canonicalization: invite links, signup confirmation and OAuth redirects use the single `APP_URL` constant (`https://daraven.com`); client/runtime origin and preview/config fallbacks removed; pending invite resend rotates to a fresh production-domain link. Focused verification passed; no publication.

- [x] Urgent invitation repair: canonical production links, validated callback token, selected joined workspace; 63 tests and targeted lint passed, automatic build OK; real unknown-token lookup and simulated pending/expired/revoked screens verified without accounts or publishing.
- [ ] Invitation real-user end-to-end acceptance and hosted redirect allowlist verification (blocked: no live accounts permitted; available authentication configuration tool does not expose redirect settings).

- [x] Responsive ERP headers, toolbars, cards and tables; verified 20 signed-in pages at mobile/tablet/desktop without transaction writes.
- [x] Replace approximated branding with official gold/light and blue/dark SVG artwork; verified signed-in workspace, affiliate and admin plus always-dark public headers at 390/768/1280px, mobile navigation and collapsed raven icons in both themes; no access-rule changes.

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
