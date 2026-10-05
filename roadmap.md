# Roadmap

## In progress — DaravenKPI interface redesign (navy / near-black / white / restrained gold)
Constraints: no backend/auth/billing changes; preserve every route and feature; no demo data in authenticated pages; no new product claims; framer-motion is NOT installed — use CSS 3D transforms + a small pointer-tilt hook; respect prefers-reduced-motion.

- [ ] Design tokens in `src/styles.css`: deep-navy dominant primary, near-black layered dark surfaces, white/blue-gray text, rare metallic gold accent (`--gold`), 14–20px radii, 1px borders, soft shadows, subtle blue atmospheric glow; keep shadcn semantic token names so every component picks it up
- [ ] Landing page (`src/routes/index.tsx`): premium fintech hero with CSS-3D floating workspace mockup (layered KPI cards, chart, table) + desktop pointer parallax/tilt, static composition on mobile; staggered entrance; trust/value indicators; product showcase; module sections (KPI analytics, inventory + financial intelligence, workflow automation); final CTA; lazy-load noncritical visuals
- [ ] App shell (`_shell/route.tsx`, `app-sidebar.tsx`, `ui/sidebar.tsx`): refined collapsible sidebar, compact top bar, business switcher, search, notifications, profile; mobile drawer/bottom nav; no horizontal overflow
- [ ] Dashboard (`_shell/dashboard.tsx`): KPI cards with trend + comparison period + sparklines, restrained chart styling with better tooltips/legends, premium skeletons
- [ ] Shared primitives: `resource-page.tsx` / `portal-table.tsx` tables (sticky headers, density, mobile card fallback, empty/loading/error), dialogs sized for mobile, badges/alerts/forms consistent
- [ ] Portal shell (affiliate/admin) + auth/pricing pages aligned with the new tokens
- [ ] Accessibility: visible focus rings, keyboard nav, labels, contrast
- [ ] Mobile-first QA with Playwright at 320/375/430/768/1280 on landing, auth, pricing, dashboard, products, sales, POS, settings; fix overflow/clipping/oversized dialogs

## Ready — PayMongo recurring billing completion (paused)
- [ ] Rewire `src/lib/billing.functions.ts` and `src/routes/api/public/webhooks/paymongo.ts` to the new `billing.server.ts` module
- [ ] Checkout page /billing/checkout/$id: card + Maya, 3DS return, polling, all states
- [ ] /billing: functional plan cards, past-due actions, pending checkout, cancelled/access-until, diagnostics
- [ ] /upgrade: preselect plan from URL, plan change flow for active subscriptions
- [ ] /settings/billing redirect + Settings billing card
- [ ] Access resolution: cancel_at_period_end past period, new statuses in label/tone maps
- [ ] Tests: unit (events, signatures, access), integration (fake PayMongo + real DB: matrix A–K), HTTP webhook tests, RLS isolation
- [ ] Email receipts for paid invoices once an email domain is configured
- [ ] Platform admin: manual "sync from PayMongo" per subscription
- [ ] Proration preview when switching between Pro and Business mid-cycle

## Blocked (needs user)
- [ ] Test-mode PayMongo keys (`PAYMONGO_TEST_SECRET_KEY`, `PAYMONGO_TEST_PUBLIC_KEY`, `PAYMONGO_TEST_WEBHOOK_SECRET`)

## Simplified items spec — remaining phases
- [x] Phase 1: type cards + presets, short form + Advanced, unified made-from engine (units, waste, labor/overhead, cost roll-up, circular block, variant components, on_sale/on_production, batch check + Make batch)
- [ ] Add-on groups (6.5), restock list (6.6), cost fields registered/last purchase, counts/wastage (6.7), POS refunds/discounts (6.8–6.9), offline (6.10)
