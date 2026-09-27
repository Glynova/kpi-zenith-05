# Item / Inventory Entry Redesign

## What already exists (no rewrite needed)
The files named in the brief (item-wizard.tsx, stock-ui.tsx, item-image.tsx, Drizzle schema) do not exist here. The equivalents are:
- Product form: `products.tsx` (create/edit dialog), `product-variants-section.tsx` (variant editor), `image-upload.tsx`, `product-bom-section.tsx`.
- Schema already covers most of the CORE set: `products` has name, sku, barcode, description, image_url, category_id, supplier_id, brand, unit, purchase_unit/purchase_conversion, product_type, inventory_model, status, tax_rate, cost/selling price, min/max/reorder, default_location_id, track_batch/expiry/serial, has_variants, has_bom, variant_options.
- `product_variants` already exists (name, sku, barcode, attributes jsonb, cost, price, stock, reorder_level, status).
- `supplier_products` already holds supplier code, lead time, MOQ, preferred flag.
- Stock is already per variant + location in `inventory_balances` / `inventory_movements`; POS already resolves by variant SKU/barcode.

## Gaps vs. target
1. Variant rows lack: weight, wholesale price, supplier item code, min/max stock, reorder qty, shelf/bin location, opening qty.
2. Item lacks: internal reference, subcategory, weight/dimensions, wholesale price, reorder qty, price-includes-tax, sellable/purchasable flags, discontinued status, per-item costing method.
3. No config-driven category attributes.
4. Parent `products.stock` can still be written on a variant product (the "invisible stock" bug).

## Schema migration (additive only)
- `products`: add `internal_ref`, `subcategory_id` (self-ref on categories via `categories.parent_id`), `weight`, `dimensions jsonb`, `wholesale_price`, `reorder_quantity`, `price_includes_tax bool`, `is_sellable`, `is_purchasable`, `category_attributes jsonb`, `costing_method` (nullable = inherit business setting). Allow status `discontinued`.
- `product_variants`: add `weight`, `wholesale_price`, `supplier_item_code`, `min_stock`, `max_stock`, `reorder_quantity`, `bin_location`.
- `categories`: add `parent_id`, `attribute_schema jsonb` (field list: key, label, type, options, required) — new categories get fields via config, not code. Seed presets (apparel, electronics, food/pharma, manufacturing, services) as templates in the category UI.
- Trigger `guard_parent_stock`: reject non-zero stock/opening movements with `variant_id IS NULL` when `has_variants = true`.
- Opening quantity on a variant posts an `opening_balance` movement (existing engine), never a direct stock write.

## Components
- Modify `products.tsx`: restructure into sections (Identity, Classification, Units, Costing, Procurement, Warehousing, Traceability, Category attributes). When variants are on, grey out the default fields with the hint "Default values only — actual price/stock is set per variant".
- Modify `product-variants-section.tsx`: add the new columns; new rows copy the item defaults, then edit independently.
- New `category-attributes-fields.tsx`: renders fields from the selected category's schema.
- Modify the Categories tab in Master Data to edit the attribute schema and subcategories.

## POS / sales impact
POS, receiving and reports already use variant + location balances, so no lookup changes. The new trigger closes the remaining gap.

## Data risk
- Everything is additive, and no columns are dropped.
- Before adding the trigger, list variant products that have parent-level stock. Each one needs a choice: move the stock onto a variant, or write it off.

## Decisions needed
1. LIFO: the costing engine supports FIFO and weighted average only. Should I add LIFO (big change), or leave it out?
2. Costing method per item or per business? It is per business today.
3. Existing parent-level stock on variant products: move it onto the first variant, or leave it for manual review?
4. Item types "bundle" and "asset": add them now (bundle means a kit that uses up its component items), or only list them for later?
