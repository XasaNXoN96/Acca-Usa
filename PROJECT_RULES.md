# ACCA USA — Project Rules

Binding technical rules for everyone (and every AI assistant) working on this codebase.
They encode lessons learned from a previous learning-platform project. No code was copied from it — only the mistakes worth never repeating.
If a rule must be broken, record why in the pull request.

---

## 1. Brand and content
- The product is **ACCA USA**. No legacy or third-party product names in code, UI, mock data, metadata or docs. `npm run check:brand` enforces this.
- ACCA and FIA are trademarks of their owners. Use neutral lettermark tiles, never their logos. Keep the footer disclaimer.
- Any placeholder figure, testimonial, price, ranking or certificate **must be visibly labelled** (`<DemoBadge />` + a note). Never show invented numbers as real results (no fake pass rates).
- Third-party reference sites may inspire information architecture only — never copy branding, visuals or text.

## 2. Architecture
- Layers: `app` (routes) → `features` (screen-level UI + client logic) → `components` (reusable UI) → `services` (contracts + implementations) → `lib` (pure helpers) → `types`.
- **UI never contains business or database logic.** Routes call `services.*` only (`src/services/index.ts` is the composition root).
- No giant components: split when a file passes ~250 lines or mixes data loading, state and layout.
- Server Components by default; add `"use client"` only for state, effects or browser APIs, and keep the client part as small as possible.
- Mock services (`services/mock/*`, `data/mock/*`) are `server-only`, flagged as demo, and replaced one-for-one by Prisma-backed services. Do not grow them into a fake backend.
- All URLs come from `lib/routes.ts`. Never hand-write an href in a component.
- Prisma is imported only from `lib/db.ts`, and `lib/db.ts` only from `services/prisma/*`.

## 3. Security
- Secrets live only in server env (`lib/env.ts`, `server-only`). Never prefix a secret with `NEXT_PUBLIC_`. Never commit `.env`.
- **Never fake production authentication.** The session layer is `lib/auth` (scrypt, signed httpOnly cookie, `docs/AUTH.md`); in demo mode the session carries `isDemo: true` and a visible banner. Do not add "remember me" tricks, hard-coded passwords or role switches in the browser.
- UI permission checks (hiding buttons) are cosmetics. Every server action / route handler must validate input with Zod **and** re-check the role (`assertCan`).
- Validate on the server even if the form validated on the client. Whitelist fields; never spread raw input into a service call.
- Correct answers and explanations never leave the server before a test is submitted (`PublicQuestion` has no answer field).
- Never use `localStorage`/`sessionStorage` as a data store (drafts, progress, roles, settings). Browser storage may hold only non-critical UI preferences.
- Files are served through signed, expiring URLs; never expose storage keys or permanent public links to paid content.
- Security headers live in `next.config.ts`; keep them when editing.
- Passwords: hashed (argon2/bcrypt) in the backend block; never logged, never returned from a service.

## 4. Data and dates
- Persist `createdAt`/`updatedAt` on every table; store UTC; send ISO strings to the UI.
- Format dates only through `lib/format.ts` (explicit locale **and** `timeZone: "UTC"`) to avoid server/client hydration mismatches and "yesterday vs today" bugs. Relative times ("2 h ago") are computed on the server per request.
- **Soft delete** user-facing entities (`deletedAt`); deleting must be reversible and must not orphan results, payments or certificates. Hard delete is an explicit admin/retention job.
- Money is integer cents + currency code, formatted with `Intl.NumberFormat`.
- Translatable content lives in `*Translation` tables keyed by locale; never concatenate translated sentences.

## 5. Internationalisation (RU / EN / UZ)
- Every user-visible string goes through `next-intl`. No hard-coded text in components, including `aria-label`, `title`, placeholders, validation messages and toasts.
- English is the source of truth; keys are type-checked (`src/types/next-intl.d.ts`). `npm run check:i18n` fails on missing/extra keys or placeholder mismatches in any locale.
- Use ICU plurals — Russian needs `one/few/many/other`. Never write `count + " items"`.
- Validation messages are **keys** in schemas (`lib/validators`) and resolved in the UI, so one schema serves every locale and the server.
- Test every screen in **Russian** (longest strings) at 360px. Layout must survive 30–40 % longer text.
- Dynamic message keys need a closed set of literals; avoid `as never` except in the admin resource tables.
- Locale = cookie → `Accept-Language` → English; URLs are not locale-prefixed. Set `<html lang>`, and `lang` on language names in the switcher.
- Language names are always shown in their own language.

## 6. Responsive design and layout
- Mobile is a **separate composition**, not a shrunken desktop: top bar + drawer + bottom tab bar (student), compact cards, stacked tables.
- Breakpoints: phone < 768, tablet 768–1023 (icon rail), desktop ≥ 1024 (full sidebar).
- Grid children can blow out a layout: `.grid > * { min-width: 0 }` is global; flex children that truncate need `min-w-0`.
- No horizontal page scroll at 360px. Wide content scrolls **inside** its own container (`overflow-x-auto`), never the page.
- Fixed bottom bars need safe-area padding (`pb-safe`) and the page needs matching bottom padding (`pb-bottomnav`).
- Long unbroken text/buttons must wrap (`whitespace-normal`, `shrink`, `max-w-full`) where users can supply or translate them.
- Touch targets ≥ 44px on coarse pointers (`pointer-coarse:` variants are built into Button/Input/Select).
- Before merging UI work run the overflow audit (see `docs/QA.md`) at 360 / 430 / 820 / 1280 / 1600 widths.

## 7. Tables
- Use `DataTable`: a real `<table>` from `md`, stacked cards below. Never ship a 6-column table to a phone.
- Always give a caption (`sr-only`), `scope="col"` headers, and numeric columns right-aligned with `tabular-nums`.
- Provide search/filter state, an empty state, a "no match" state, and a record count (`aria-live`).
- Sorting, pagination and filtering run on the server once data is real; never load unbounded lists.

## 8. Modals, dialogs, drawers
- Use the shared `Dialog` / `Sheet` (Radix): focus trap, `Esc`, focus restore, scroll lock come for free. Do not hand-roll overlays.
- Dialogs become bottom sheets on phones and scroll internally (`max-h-[90dvh]`) — never taller than the viewport.
- Every dialog has a title and a description (visually hidden if needed).
- Destructive actions need a confirmation dialog stating the consequence (and whether it is reversible).
- Don't nest a dialog's state in a parent that re-mounts it; key the dialog by record id.
- Drawers/menus close on route change (derived-state pattern, not effects).

## 9. Forms and validation
- React Hook Form + Zod resolver. One schema per form in `lib/validators`.
- Labels are always visible `<label>`s; errors are linked with `aria-describedby`, announced (`role="alert"`), and carry an icon + text.
- Mark required fields; use proper `type`, `autocomplete` and `inputMode`.
- Disable-and-spin the submit button while pending; prevent double submit.
- Numeric inputs are validated as numbers with explicit min/max, not just "non-empty".

## 10. Loading, empty and error states
- Every route segment with data has `loading.tsx` (skeleton matching the final layout) and `error.tsx` (retry; shell stays visible).
- Every list has an empty state with a next action, and a filtered-empty state.
- Never leave a spinner with no timeout/error path; never render `undefined`/`NaN`/raw keys.
- `notFound()` for unknown ids; permission failures render a clear "no access" state, not a blank page.

## 11. Permissions and roles
- Roles: `STUDENT`, `ADMIN` (no teacher role; public registration only creates STUDENT); matrix in `lib/permissions.ts`.
- Check on the server at the service/action boundary; ownership checks (a student may only read **their own** attempts, payments, notifications) are part of every query.
- Locked content (sequential topics) is enforced on the server — the topic page itself rejects locked ids.
- Admin screens must not be reachable by guessing URLs once auth lands (route guard + per-action checks).

## 12. Notifications and routing
- A notification stores a typed **target** (`{kind, id}`), never a URL. `notificationHref()` resolves it, so route renames cannot break old notifications.
- Opening a notification marks it read and navigates in one flow; unread badges update from the server after the action (`revalidatePath`).
- Unknown/deleted targets must degrade gracefully (no link, not a 404).

## 13. Tests, attempts and autosave
- Selected ≠ incorrect. Selection uses **navy**; red/green appear only on the review screen and always with an icon and a text label.
- The server owns the clock and the score. The client timer is display-only; submission is validated against the server deadline.
- Drafts autosave to the server (debounced, retried, status shown); never to `localStorage`.
- Leaving an unfinished test requires confirmation (`beforeunload` + in-app dialog + Navigation API where supported). Submitting shows unanswered/flagged counts first.
- After submission show score, per-question explanations, and the progress change. Retake creates a new attempt; never overwrite history.
- Announce time thresholds (5 min, 1 min) to screen readers; do not announce every second.

## 14. Accessibility (WCAG 2.2 AA)
- Normal text ≥ 4.5:1, UI boundaries ≥ 3:1. `--subtle-foreground` is the lightest permitted text colour; minimum body size 13px.
- Everything works with the keyboard; focus is always visible (global `:focus-visible` ring); a skip link precedes the header; the main landmark is `#main`.
- Icon-only controls have `aria-label`; decorative icons are `aria-hidden`; progress bars carry an accessible name.
- Never convey state by colour alone (status badges have text; correct/incorrect have icons).
- Respect `prefers-reduced-motion`.
- Mega menus: label stays a link, chevron toggles (`aria-expanded`), `Esc` closes and restores focus, focus-out closes.

## 15. Design system
- Use semantic tokens (`bg-primary`, `text-muted-foreground`, `bg-azure-soft`) — never raw hex or arbitrary colours in components.
- **Red = ACCA brand, primary action and errors only.** Selected/active = navy. Azure = neutral info accent, FIA = green. Don't paint whole screens red.
- Add new UI as a reusable component in `components/ui` first; features compose them. Don't restyle primitives inside a feature.
- Typography uses the `type-*` utilities. Radius/shadow scales are fixed in `globals.css`.

## 16. Settings, reminders, groups, chat, preview (planned features — rules for when they land)
- **Settings**: server-validated, versioned, with defaults; each setting documented (what it changes, who may change it). A saved-but-ignored setting is a bug.
- **Reminders**: scheduled by a job queue, idempotent, timezone-aware, respect user opt-out and quiet hours, and are logged. Never send from a request handler.
- **Groups / classes**: membership is the only source of access to group content; removing a member revokes access immediately; group deletion is soft.
- **Chat / messages**: server-persisted, paginated, rate-limited, sanitized (no raw HTML), with report/block; unread counts derive from read receipts, not client state.
- **Preview (draft vs. published)**: admins preview unpublished content through an authorised preview route; previews never write progress, attempts or analytics.

## 17. Quality gates
Run before every commit: `npm run check` (lint + typecheck + i18n + brand) and `npm run build`.
- No `any`, no `@ts-ignore`, no disabled lint rules without a comment explaining why.
- No `console.log` in committed code (`console.error` only inside error boundaries).
- No duplicated logic: if the same rule appears twice (status → badge variant, tab parsing, money formatting) extract it.
- Commits are small and describe the *why*.

## 18. Authentication, sessions and roles (P0)
- Passwords are hashed with scrypt (`lib/auth/password.ts`) and compared in constant time; plaintext never reaches a store, a log, a cookie or the browser's storage. Seed accounts carry hashes only.
- Sessions are signed, `httpOnly`, `SameSite=Lax` cookies (`Secure` in production). The signing secret is server-only (`AUTH_SECRET`; in demo mode a random one in the OS temp dir). Never read it from client code.
- The proxy (`src/proxy.ts`) is a pre-check only. **Authority** is the server: `requireSession` in layouts/pages, `sessionOrNull` + `can()` in every server action and route handler. The user is re-read on every request, so suspension, role change and password reset apply immediately (`tokenVersion`).
- Self-registration creates STUDENT only. Staff roles are granted by an admin; an admin cannot change their own role/status or archive themselves, and the last active admin cannot be removed.
- Login/forgot/reset/register are rate limited. Forgot-password answers identically for unknown and known emails (demo mode additionally shows the one-time link because no mail provider exists). Reset tokens are random, stored hashed, single-use and expire in 30 minutes.
- Post-login redirects go through `safeNext()` (same-site relative paths only).

## 19. Data providers, demo mode and storage
- UI → features → services/contracts → provider. Only `services/index.ts` knows which provider is active; `NEXT_PUBLIC_APP_MODE=production` refuses to start until real providers exist.
- Demo data is in-memory, labelled, and resets on restart; never persist it to `localStorage` or treat it as production data. Never invent production statistics (derive numbers from real state or label them "Demo data").
- Every mutation is a server action: session → role/permission → Zod validation → service. Field errors travel as codes and are translated in the UI.
- Files: validate **kind allow-list, extension, size cap and magic bytes** on the server; never trust the browser MIME type; serve through `/api/files/[id]` (session + enrolment checked, `nosniff`, inline only for safe types, Range supported). SVG/HTML uploads are not allowed. Storage ids are random UUIDs (no user-controlled paths).
- Unattached uploads are garbage-collected; replacing/removing a material's file deletes the old object.
- Soft delete everywhere users can delete (archive/restore); parents hide children at read time.

## 20. Theme (light / dark / system)
- Theme tokens live in `globals.css` (`:root` and `.dark`); components use semantic tokens only. Always-dark panels use `surface-navy`; text on solid brand colours uses the matching `*-foreground` token.
- The choice is stored in the `acca_theme` cookie; the server renders the class for explicit choices and a blocking head script resolves "system" before paint (no flash). Controls read the theme through `lib/theme-client.ts`.
- Every new component must be checked in both themes and in Russian at 360px.

## 21. Tests and attempts (P0)
- A test is startable only when published, not archived and it has questions. The learner must be enrolled in the platform; the timer starts when **Start** is pressed and the deadline is stored on the server.
- Autosave accepts answers/flags/position only — never elapsed time. Submission is scored on the server; results are frozen snapshots so later edits to the question bank never rewrite history.
- Notifications store a code + params and are translated at render time.
