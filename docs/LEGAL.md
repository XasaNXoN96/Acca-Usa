# Legal pages and consent (Uzbekistan market)

> **This is engineering documentation, not legal advice.** The texts in `src/content/legal/` are *drafts* written to match what the software really does. They must be reviewed and completed by a qualified lawyer in the operator's jurisdiction before launch. Until the operator sets `LEGAL_TEXTS_REVIEWED=1`, every legal page shows a visible "draft — not reviewed by a lawyer" notice. Statements about Uzbek law below are pointers to verify with counsel, not conclusions.

## What is implemented

| Piece | Where | Notes |
|---|---|---|
| Terms of Use, Privacy Policy + personal-data consent, Cookie Notice, Refund Policy | `/terms`, `/privacy`, `/cookies`, `/refunds` (public, linked from the footer, profile and registration) | EN / RU / UZ (Latin). Operator details are **filled from the environment**; anything unset is printed as an explicit "[not configured by the operator]" marker — no invented company, address or number. |
| Separate, explicit consents at registration | Terms and personal-data consent are **two separate unticked checkboxes**; optional marketing is a third, never pre-ticked | Server re-validates (`registerSchema`); the documents open in a new tab so typed data is not lost |
| Consent evidence | `ConsentRecord` (migration `20261014100000_consent_records`): user, kind, text **version**, granted, language, source (`register` / `reconsent` / `settings`), time | Append-only history; the latest row per kind is the current state. No IP address or user agent is stored (data minimisation) |
| Versioning and re-consent | `LEGAL_VERSIONS` in `src/lib/legal/consent.ts` | Changing a text = bump the version → every account is sent to `/consent` at its next request until it accepts. Accounts created by an administrator or by the `admin:create` CLI start with **no** consent and see the same page at first sign-in |
| Fail-closed enforcement | `lib/auth/session.ts` | Without current required consents `getSession()` returns *no session* on every route, file download and server action; only `/consent` (and sign-out) work. Same pattern as the MFA gate |
| Consent settings | Profile → "Privacy and consent" | Shows accepted versions and dates, optional marketing e-mail toggle (each change is a new history record), how to request access / correction / deletion / withdrawal |
| Production configuration check | `lib/env-check.ts` | `LEGAL_OPERATOR_NAME`, `LEGAL_CONTACT_EMAIL`, `LEGAL_DATA_LOCATION` are **required** in production (the server refuses to start without them). Optional: `LEGAL_OPERATOR_ADDRESS`, `LEGAL_OPERATOR_TAX_ID`, `LEGAL_GOVERNING_LAW`, `LEGAL_REFUND_WINDOW`, `LEGAL_TEXTS_REVIEWED=1` |
| Cookie facts | `/cookies` | Mirrors the code: `acca_session`, `acca_mfa` (admins), `NEXT_LOCALE`, `acca_theme`, `acca_sidebar`. No analytics or advertising cookies → no consent banner. **If analytics/ads are ever added, a real opt-in banner is required first** (and the smoke test `smoke-legal` step 3 will fail until the notice is updated) |

## Decisions the operator / counsel must take before launch

These are open on purpose; the software cannot decide them.

1. **Operator identity** — the legal entity, address and tax number (STIR) shown on the pages.
2. **Data location and localisation.** Uzbek personal-data law (Law "On Personal Data", No. ZRU-547 of 2019, as amended) is generally understood to require that personal data of Uzbek citizens collected in Uzbekistan be stored on technical means physically located in Uzbekistan, with cross-border transfer subject to conditions, and databases to be registered with the competent authority. *Verify the current text and its scope with counsel.* This directly affects **where PostgreSQL, object storage, backups and the e-mail provider are hosted** (`LEGAL_DATA_LOCATION` must say the truth). Nothing in this repository enforces or proves data residency — it is a deployment decision. The default stack (Stripe, a foreign SMTP provider, foreign S3) would process data abroad.
3. **Registration of the database / operator duties** with the personal-data authority, a person responsible for data protection, internal policies — organisational, outside the code.
4. **Form of the agreement.** Online services in the region often use a *public offer* (оферта). The Terms are drafted as ordinary terms of use; counsel may want them restructured as an offer/acceptance text, and may require the Terms in Uzbek and Russian with specific content for consumers.
5. **Consumer rules** — refund window and statutory withdrawal rights (`LEGAL_REFUND_WINDOW` is rendered verbatim; the software only enforces that a *confirmed full refund* withdraws access). Invoicing / fiscal receipts (e-fiscalisation) for sales to individuals are **not implemented**.
6. **Payments.** Card payments go through Stripe. *Confirm that Stripe can onboard the operating entity and serve Uzbek cardholders at all* — if not, a local acquirer (for example local card schemes/wallets) would be needed and is **not integrated**. Until a real payment account exists, payments stay NOT VERIFIED (see docs/PAYMENTS.md).
7. **Retention periods** for accounts, payment records, security logs and the admin audit log, and a procedure for deletion requests. The software has no self-service export or deletion yet: the pages tell users to write to the contact address; an operator has to act on the request (note the audit log and payment ledger are append-only/RESTRICT by design — decide what is anonymised and what is kept by law).
8. **Minors**, cross-border transfer wording, DPA contracts with processors (Stripe, SMTP, hosting), and the complaint authority named in the Privacy Policy.

## What is *not* implemented

* data-subject self-service (export / delete account), automatic retention jobs;
* a cookie consent banner (not needed while only strictly necessary and preference cookies exist);
* proof of consent by IP / user agent (deliberately not stored);
* legal review of the texts, and any claim of compliance with a specific law.

## Tests

`npm run test:legal` (both providers: consent rules, version invalidation, history, structural equality of EN/RU/UZ texts, placeholders, no unfinished text) · `smoke-legal.mjs` (both providers: public pages in 3 languages, draft/not-configured markers, footer, cookie list equals real cookies, two separate consents + optional marketing, evidence shown in profile, administrator-created account blocked until it accepts, sign-out) · `test:production` legal step (configured operator rendered, evidence rows in PostgreSQL, outdated version re-asks) · `test:env` (required `LEGAL_*`).
