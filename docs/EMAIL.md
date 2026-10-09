# E-mail

Business code calls `sendEmail(recipient, mail)` (`src/services/email/index.ts`) and never talks to a mail vendor.

| Provider | Mode | Behaviour |
| --- | --- | --- |
| `DemoEmailProvider` | demo | **sends nothing**; keeps the last 200 messages in an in-memory outbox (tests) |
| `SmtpEmailProvider` | production | real delivery over SMTP (`nodemailer`) — any vendor that offers SMTP |

`sendEmail` **never throws** and never blocks the flow that triggered it (registration, payment, certificate): a failed
delivery is logged as `email.not_sent` / `email.send_failed` (event name + reason only — no addresses, bodies or tokens) and
returned as `{ ok: false }`.

## Templates

`welcome`, `passwordReset`, `certificateIssued`, `notification`, `paymentConfirmation`, `paymentFailed`
(`src/services/email/templates.ts`, strings under `email.*` in `src/i18n/messages/{en,ru,uz}.json`, so the RU / UZ parity gate
covers them). The language is the **recipient's saved preference** (`User.locale`), not the request's. Templates render
without a request context, so they work from webhooks and background jobs.

* Every dynamic value is HTML-escaped; links are only emitted as `http(s)` (`javascript:` becomes `#`).
* Each message has a plain-text part and an HTML part; the HTML is table-based with inline styles for mail clients.
* No tracking pixels, no remote images.

## Where mail is sent

| Event | Template | Trigger |
| --- | --- | --- |
| registration | `welcome` | `registerAction` |
| forgot password | `passwordReset` | `forgotPasswordAction` (single-use link, 30 min) |
| certificate issued (auto or manual) | `certificateIssued` | both data providers, right after the record is created |
| payment confirmed / failed | `paymentConfirmation` / `paymentFailed` | payment webhook handler (`docs/PAYMENTS.md`) |
| general notification | `notification` | available to admin tooling |

In **demo mode** the reset link is additionally shown on screen (there is no mailbox); in production it is **only** e-mailed and
the response is identical whether or not the account exists.

## Configuration

```
SMTP_HOST  SMTP_PORT  SMTP_USER  SMTP_PASSWORD  EMAIL_FROM="ACCA USA <no-reply@your-domain>"
SMTP_SECURE=1        # implicit TLS (port 465); leave unset for STARTTLS on 587
APP_URL=https://…    # absolute links in e-mails
```

Server-only, validated at startup. Set SPF / DKIM / DMARC for the sending domain.

## Safeguards

Recipient addresses must be a single plain address (no commas, whitespace, angle brackets or control characters) and the subject
is stripped of line breaks, so user-controlled values cannot inject headers or extra recipients.

## Failure handling and diagnostics

* **Classified, never raw.** Transport errors are mapped to a code (`AUTH`, `CONNECTION`, `TIMEOUT`, `TEMPORARY`, `REJECTED_RECIPIENT`,
  `REJECTED_MESSAGE`, `UNKNOWN`). Only the code is logged (`email.send_failed {failure, attempts}`) or shown — never the error text,
  which can contain server banners or credentials.
* **Bounded retry.** Transient failures (connection, timeout, 4xx) are retried once after 600 ms; permanent ones (bad login, rejected
  recipient or message) are not retried. A failed message is **not queued for later** — there is no outbox in production; the
  flow that triggered it (registration, payment, …) is never blocked or rolled back.
* **Admin → Settings → E-mail delivery** shows the provider, the SMTP host:port and the sender (never user / password) and the
  **real counters of this server instance** (accepted / failed since start, last failure class). **Send a test e-mail** sends one
  message to the signed-in administrator's *own* address (no arbitrary recipient → not a mail relay; 5 per hour).
* `EMAIL_TEST_TO=you@example.com npm run email:test` verifies the SMTP login (`verify()`) and sends one test message from the command line.
* In demo mode nothing is sent; the page says so.

"Accepted" means the SMTP server took the message. It does **not** prove the message reached an inbox.

## DNS and sender checklist (do this with your real domain)

1. Use a sender on a domain you control (`EMAIL_FROM`), the same domain the SMTP provider authenticates.
2. **SPF:** a `TXT` record on the domain that includes your provider (`v=spf1 include:<provider> ~all`).
3. **DKIM:** publish the provider's DKIM key (`<selector>._domainkey` record) and enable signing.
4. **DMARC:** `_dmarc` `TXT` `v=DMARC1; p=none; rua=mailto:dmarc@your-domain` first, tighten to `quarantine` / `reject` once reports are clean.
5. Send a test message to a Gmail and a Mail.ru / Yandex address; open "show original" and confirm `SPF: PASS`, `DKIM: PASS`, `DMARC: PASS`.
6. Trigger registration, password reset and a payment confirmation in RU, EN and UZ and read each message.
Record the result in `docs/PRODUCTION_CHECKLIST.md`. Until then SMTP is **READY FOR CONFIGURATION, NOT VERIFIED**.

## What is verified

* `npm run test:email` (no network): six templates + the `test` message × EN / RU / UZ render with resolved placeholders and different
  subjects per language, hostile input is escaped, `javascript:` links dropped, header-injection attempts refused before the transport,
  error classification, one retry for transient errors / none for permanent ones, raw error text never in the result, counters.
* `npm run test:production` (real app, real PostgreSQL, a local SMTP **sink** that speaks the SMTP protocol): welcome and reset mails
  arrive over SMTP; the admin test message arrives at the admin's address; the test button is rate-limited; with the SMTP server
  **down** registration still succeeds, the log has `failure: CONNECTION` and contains neither the SMTP user nor the password, and the
  settings page shows the failure.
* **Not verified:** delivery through a real SMTP provider, inbox placement, SPF / DKIM / DMARC, RU / UZ rendering in real mail clients.
