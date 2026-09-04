# Roadmap — PayMongo recurring billing completion

## In progress
- [ ] Schema: billing_checkouts, provider ids on subscriptions/plans/invoices/payments, expiry function + cron
- [ ] PayMongo client: correct endpoints, test/live key pairs, payment intents, plan/payment-method changes, invoice pay, test cycle trigger
- [ ] billing.server.ts: checkout lifecycle, activation, invoice/payment recording, failure escalation, provider sync, webhook processor
- [ ] Server functions: start/attach/verify/abandon checkout, cancel, change plan, update payment method, retry invoice, sync, diagnostics
- [ ] Webhook route: verify (test+live secrets), livemode check, resource_id linking, idempotent processing, structured logging
- [ ] Checkout page /billing/checkout/$id: card + Maya, 3DS return, polling, all states
- [ ] /billing: functional plan cards, past-due actions, pending checkout, cancelled/access-until, diagnostics
- [ ] /upgrade: preselect plan from URL, plan change flow for active subscriptions
- [ ] /settings/billing redirect + Settings billing card
- [ ] Access resolution: cancel_at_period_end past period, new statuses in label/tone maps
- [ ] Tests: unit (events, signatures, access), integration (fake PayMongo + real DB: matrix A–K), HTTP webhook tests, Playwright UI checks, RLS isolation
- [ ] Typecheck / lint / build clean

## Ready
- [ ] Email receipts for paid invoices (transactional email) once an email domain is configured
- [ ] Platform admin: manual "sync from PayMongo" per subscription in /admin/subscriptions
- [ ] Proration preview when switching between Pro and Business mid-cycle

## Blocked (needs user)
- [ ] Test-mode PayMongo keys (`PAYMONGO_TEST_SECRET_KEY`, `PAYMONGO_TEST_PUBLIC_KEY`, `PAYMONGO_TEST_WEBHOOK_SECRET`) — only live keys are configured, so end-to-end runs against a local PayMongo simulator
