# Payments

> **Provider status.** The production adapter is **Stripe Checkout** (hosted page + signed webhooks, REST API, no SDK).
>
> | Layer | Status |
> | --- | --- |
> | State machine, signature check, event mapping, request construction | IMPLEMENTED, unit-tested (`npm run test:payments`) |
> | Whole purchase through the real app + PostgreSQL against a **local test double of the Stripe API** (checkout request, price from DB, double click, signed events, wrong currency / missing amount / unpaid, 6 parallel deliveries, partial and full refund, expired, failed, late paid, admin ledger) | TESTED (`npm run test:production`) |
> | **Real Stripe account in TEST mode** (real `sk_test_…`, Stripe CLI or dashboard webhook) | **NOT VERIFIED** — no Stripe credentials exist in this environment |
> | Live mode | **NOT VERIFIED / not enabled** |
>
> Do not call payments "production ready" until the TEST-mode checklist below has been run with a real Stripe test account.

## Stripe TEST-mode verification (to run with your own test account)

1. `PAYMENT_SECRET_KEY=sk_test_…` (the app reports the mode from the key prefix: Admin → Payments shows a **Stripe TEST mode** badge; a `sk_live_` key shows **LIVE**).
2. `stripe listen --forward-to https://<host>/api/webhooks/payments` and set `PAYMENT_WEBHOOK_SECRET` to the printed `whsec_…` (or create a test-mode webhook endpoint for `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`, `charge.refunded`).
3. Buy a platform with card `4242 4242 4242 4242` → payment `PAID`, enrolment `ACTIVE`, e-mail + notification. Replay the event (`stripe events resend`) → `duplicate`.
4. Card `4000 0000 0000 0002` (declined) → the session stays open; let a session expire → `CANCELLED`.
5. Refund the charge in the dashboard (full) → `REFUNDED`, enrolment `REVOKED`; a partial refund keeps access.
6. Record the result in `docs/PRODUCTION_CHECKLIST.md`. Only then is Stripe "TESTED against Stripe".

## Switching to live (after step 6 passed)

* Create a **live** webhook endpoint, replace `PAYMENT_SECRET_KEY` (`sk_live_…`) and `PAYMENT_WEBHOOK_SECRET` (live `whsec_…`), restart. The Payments badge must read **LIVE**.
* `STRIPE_API_BASE` must be unset — the app refuses to start with it together with a live key, and the adapter ignores it for non-test keys.
* Make one real small purchase and refund it, check the ledger, then set prices (Admin → Platforms).

## Rules

1. The price comes from the database (`Platform.priceCents`), never from the browser.
2. A payment is created as `PENDING`. **Nothing is unlocked at that point, nor when the learner returns to the site.**
3. Access is granted **only** by a provider event that passed signature verification, in `applyProviderEvent`.
4. The `?paid=<id>` return URL only shows a banner built from the payment's *stored* status (and only for the signed-in owner).
5. There is no "mark as paid" anywhere: no admin button, no client call. The demo simulation exists in demo mode only.

## Flow

```
student ── Buy access ──► enrollAction ──► enrollments.enroll()  → PAYMENT_REQUIRED (price > 0)
                                           payments.startCheckout() → Payment(PENDING) + provider checkout URL
browser ──────────────────────────────────► provider-hosted checkout (card data never touches us)
provider ── POST /api/webhooks/payments ──► verify signature (raw body, HMAC, 5-min window)
                                           applyProviderEvent():  idempotent (PaymentEvent unique per provider event id)
                                             paid      PENDING|FAILED → PAID      grant Enrollment(ACTIVE, source=payment) + e-mail + notification
                                             failed    PENDING        → FAILED    e-mail + notification
                                             cancelled PENDING        → CANCELLED
                                             refunded  PAID           → REFUNDED  Enrollment → REVOKED
```

Statuses: `PENDING`, `PAID`, `FAILED`, `CANCELLED`, `REFUNDED`. Transitions only move forward; out-of-order or replayed
deliveries are ignored.

## Safeguards

* **Idempotency (creation).** A still-open checkout for the same user + platform (30 min) is reused, and
  `Payment(userId, idempotencyKey)` is unique — double clicks and two tabs never create two charges.
* **Idempotency (webhook).** `PaymentEvent(provider, eventId)` is unique; replays return `duplicate`. If applying an event
  throws, the record is withdrawn and the route answers `500` so the provider's retry is applied; side effects run before the
  status flip so a retry is never mistaken for a replay.
* **Amount check.** A `paid` event whose amount or currency differs from the stored payment — or that **omits** either — is ignored and logged
  (`payment.amount_mismatch`) — no access. (Only the demo simulation may omit them.)
* **Signature.** `Stripe-Signature` (`t=…,v1=…`): HMAC-SHA-256 over `t.payload`, constant-time compare, ±5 min tolerance, missing /
  malformed / unconfigured secret → rejected before parsing. The webhook is rate-limited and size-limited (256 KB).
* **Ownership.** `payments.getForUser(userId, id)` filters by owner; other learners' payments are "not found".
* **Provider failure.** If creating the checkout fails, the pending payment is marked `FAILED` — nothing was charged.
* **Refunds.** A full refund (`charge.refunded`) marks the payment `REFUNDED` and revokes the enrolment it created.

## Demo mode

`DemoPaymentProvider` returns an on-site page (`/payments/demo-checkout/[id]`, 404 outside demo) labelled as a simulation with
"simulate paid / failed / cancel" buttons. They call `completeDemoCheckout`, which **refuses outside demo mode** (`DEMO_ONLY`)
and only works for the signed-in owner's own demo payment. The demo provider cannot verify webhooks, so
`/api/webhooks/payments` rejects every request in demo mode — the simulation cannot be used to forge a production payment.
The demo catalogue is free (price 0), so existing flows are unchanged until an administrator sets a price (Admin → Platforms).

## Configuration

```
PAYMENT_SECRET_KEY=sk_live_…        # Stripe secret key (server only)
PAYMENT_WEBHOOK_SECRET=whsec_…      # signing secret of the webhook endpoint
APP_URL=https://your-domain         # success / cancel URLs
```

Register `https://your-domain/api/webhooks/payments` for `checkout.session.completed`, `checkout.session.async_payment_succeeded`,
`checkout.session.async_payment_failed`, `checkout.session.expired`, `charge.refunded`.

## Tests

`npm run test:payments` (state machine incl. replays, mismatches, failure/retry, refunds; Stripe signatures incl. tampering and
replay; event mapping; checkout request) and the browser smoke `smoke-payments` (demo purchase end to end).

## Limits and known gaps

* Out-of-order delivery: a refund that arrives before the payment is `PAID` is ignored (and recorded as seen); this does not happen with Stripe's ordering in practice.
* Partial refunds keep access (by design). Disputes / chargebacks (`charge.dispute.*`) are **not** handled: treat them manually.
* Refunds are issued in the Stripe dashboard; the app only reacts to the signed event (there is no admin "refund" or "mark as paid" button).
* One currency (USD) and one price per platform; configurable pricing (bundles, discounts) is a later phase.
