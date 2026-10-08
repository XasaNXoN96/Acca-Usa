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

## What is verified

`npm run test:email`: all six templates × EN / RU / UZ render with resolved placeholders and different subjects per language,
hostile input is escaped, `javascript:` links are dropped, header-injection attempts are refused before reaching the transport,
transport errors never throw. Delivery through a real SMTP server was **not** exercised from this environment.
