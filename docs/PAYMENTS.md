# Payments

> **Provider status.** The production adapter is **Stripe Checkout** (hosted page + signed webhooks, REST API, no SDK).
> It is implemented and unit-tested (signature verification, event mapping, request construction, state machine) but has
> **not been run against Stripe's live or test servers from this environment**. Run a test-mode purchase end-to-end
> (`stripe listen --forward-to …/api/webhooks/payments`) before go-live. Other providers plug in by implementing `PaymentProvider`.

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
* **Amount check.** A `paid` event whose amount or currency differs from the stored payment is ignored and logged
  (`payment.amount_mismatch`) — no access.
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
