# Compliance and Financial Foundation (in-place)

Extends the existing DaravenKPI schema. No duplicate tenant, product, inventory or sales tables. `businesses` stays the tenant and `user_businesses` stays the membership table.

## What already exists and gets reused
- FIFO and weighted-average costing, cost layers, variant-only stock, negative-stock guard, and the capability engine that gates settings (migrations 0003–0024)
- Cross-business transfers (pending_receipt, receive/reject RPCs, notifications)
- complete_sale, post_sales_return, post_purchase_return, confirm_goods_receipt, next_doc_number, log_audit_event

These will be audited and fixed where needed, not rewritten.

## Phase 1: Data foundation (one migration per topic)
1. **RLS audit**: list every business-owned table and its policies. Fill gaps such as stock_transfer_items, wastage_entries and stock_count_items, add missing business_id indexes, and leave platform tables alone.
2. **business_compliance** (1:1 with businesses), with safe defaults: not VAT-registered, PHP currency, Asia/Manila time zone, and jurisdiction `PH`. It is backfilled from businesses and business_settings.
3. **Doc numbering**: next_doc_number takes a row lock and adds a year scope, with a unique (business, prefix, year) key. Sale and invoice numbers are assigned only on the server, inside complete_sale or a trigger.
4. **Sale and invoice snapshots**: add product name, SKU, variant label, unit price, tax type and unit cost to sale_items. Add customer name and TIN, gross, VAT-exempt, zero-rated, VAT and net amounts, balance, parent_id and cumulative grand total to invoices and sales.
5. **Immutability**: a trigger blocks money-field UPDATEs and DELETEs on posted sales, sale_items, invoices and finalized Z readings. Every blocked attempt is logged as DELETE_ATTEMPT. New RPCs `void_sale` and `refund_sale` create linked reversal rows through original_sale_id and reverse inventory at the original cost.
6. **AR**: an overpayment guard on sale_payments (any excess must be recorded as customer credit), a status sync to UNPAID, PARTIAL, PAID or VOID, and an `ar_aging(business, as_of)` function with buckets Current, 1–30, 31–60, 61–90, 91–120 and 121+.
7. **Tax**: a `tax_transactions` table (VAT, VAT_EXEMPT, ZERO_RATED, WITHHOLDING) and a `withholding_certificates` table (payer, payee, TINs, ATC, base, rate, amount, period, certificate number, reference).
8. **Z readings**: a `z_readings` table with a sequential Z number per register, invoice and grand-total ranges, totals by tax type, voids, refunds and payment-method totals. A `close_day_z` RPC computes these from posted sales. Rows cannot be changed once written.
9. **Audit**: add an ip column and an action vocabulary to audit_logs. LOGIN and LOGOUT are logged from the client auth listener. The posting, void, refund, payment, price, settings and role RPCs also write audit entries.

## Phase 2: Screens (existing navigation and style)
- Settings, new Compliance tab: legal fields, VAT setup and jurisdiction
- Settings, Inventory: costing method status (read-only explanation plus count of items using a different method)
- Receivables, new Aging tab: As-of date picker, totals by customer, CSV export
- New Tax page: tax transactions list, withholding entry, and a 2307-style export labelled "Generated from your records. Not a BIR-issued form."
- New Daily Close page: Z reading preview, finalize, and history
- Audit Logs: filters for action, module and user, plus a before/after view
- Sales: Void and Refund buttons that call the new RPCs

## Phase 3: Tests (real DB and app; temporary data deleted afterwards)
Scenarios A–M from your request, run as SQL scripts in transactions against two temporary businesses, plus a Playwright check of the new pages. A scenario is marked PASS only after it has actually run.

## Technical notes
- Migrations go through the migration tool, are additive only, and add GRANTs to every new table.
- Settings stay authoritative. A product-level costing method override is kept, because the item form already supports it on purpose.
- Philippine rules live behind `business_compliance.jurisdiction = 'PH'`. Other jurisdictions only get generic VAT.
- The report at the end lists files, migrations, functions, policies, routes, test results and blockers.
