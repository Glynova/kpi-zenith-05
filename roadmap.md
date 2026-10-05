# Roadmap

- [ ] Business Setup Wizard rework (10 steps: Business profile, Legal & tax, What you sell, Inventory & tracking, Sales & purchasing, Locations, Units, Costing, Product defaults, Review)
  - Hydrate from current businesses / business_compliance / business_settings / warehouses / units; keep drafts
  - All capability toggles go through withPrerequisites; show dependents on disable
  - Business-type recommendations only via explicit button with diff preview
  - Costing selector locked when business_has_costed_stock (DB guard stays authoritative)
  - Save: businesses update, business_compliance upsert, business_settings upsert (incl. tax/sales rules), warehouses dedupe, units/conversions dedupe with same-family validation
  - QA: fresh, resume, completed business, PH VAT/non-VAT, non-PH, multi-location, units on/off, variants/BOM/production, POS/register, costing guard, no duplicates
