# Global tax architecture and Philippines CAS readiness (working document)

Status date: 2026-11-09. This is an inspection baseline, not a claim of BIR compliance or approval.

## Target architecture
- Global core: business has explicit country/jurisdiction, legal entity and branch context; currency, timezone, fiscal year, numbering scope, tax IDs, tax categories, rounding rules.
- Jurisdiction adapters: tax behavior chosen by the business record (server/database), never browser locale. Versioned, effective-dated rule sets per jurisdiction.
- Philippines is the first adapter (`src/lib/tax/strategies.ts`, `src/lib/tax/slsp.ts` today). Non-PH tenants must keep current generic behavior.

## Migration streams (not interchangeable)
- `drizzle/migrations/` (0000–0056): applied via the Drizzle migrator tool.
- `supabase/migrations/` (2026110122xxxx–20261102000100): Phase 1A and totals fixes, authored and largely unapplied.
- Rule: any new change is authored in exactly one stream, and its counterpart status is recorded here. Nothing has been replayed across streams.

## Readiness matrix
Columns: Source = code in repo · Mig = migration authored · Applied = applied to hosted DB · Tests = tests run locally · BIR = registration/approval.

| Requirement | Source | Mig | Applied | Tests | BIR |
|---|---|---|---|---|---|
| Business country/jurisdiction field | Partial (`country` columns exist; `jurisdiction` on compliance) | n/a | Existing | Not verified | n/a |
| Effective-dated jurisdiction rule sets | Missing | Missing | No | No | n/a |
| VAT-inclusive/exclusive, exempt, zero-rated | Implemented (strategies) | n/a | n/a | Yes (8 tests) | No |
| VAT vs non-VAT taxpayer type | Partial | Phase 1A authored | Not verified | Partial | No |
| SC/PWD statutory discount | Partial (POS reclassification) | Phase 1A rules authored | Not verified | Yes (unit) | No |
| Creditable withholding tax shown separately (RR 6-2026, RMC 112-2026) | Missing | Missing | No | No | No — rules not yet verified |
| E-invoicing applicability (RMC 98-2026) | Missing | Missing | No | No | No — not verified |
| TIN + branch code on business/sale | Partial | Partial | Not verified | No | No |
| Output/input VAT ledgers | Partial (tax_transactions, receipt input VAT) | Phase 1A authored | Not verified | No | No |
| Sequential scoped numbering | Partial (`_next_doc`, scoped sale numbers in Phase 1A) | Authored | Not verified | No concurrency test | No |
| Posted-document immutability | Partial (guard triggers live; Phase 1A extends) | Authored | Partial | No | No |
| Append-only audit trail + export | Partial | Authored | Not verified | No | No |
| Period close / post-close adjustments | Missing (Z close only) | Missing | No | No | No |
| Z-reading close/reprint parity | Partial | n/a | Existing | No | No |
| SLS .DAT export | Implemented (unverified format) | n/a | n/a | 1 test authored | No |
| SLP / books of accounts / GL | Missing | Missing | No | No | No |
| Data dictionary, system description, forms spec, SFTR checklist, release log | Missing | n/a | n/a | n/a | No |
| CAS registration evidence vs approval status | Missing (keep separate) | — | — | — | Not registered |

## Known risks to audit before extending (from Phase 1A)
tax_transactions deletion/retention; input VAT dedupe under concurrency; statutory discount trigger coverage; buyer TIN snapshot in exports; return tax-period dating; Z-reading preview vs close parity; tax classification snapshots; no historical totals recalculation without a reviewed reconciliation plan.

## Blockers
- Current 2026 BIR texts (RR 6-2026, RMC 112-2026, RMC 98-2026) are not yet verified; no interpretation implemented.
- Phase 1A and totals-fix migrations are unapplied; extending on top of them needs a decision on application order.
