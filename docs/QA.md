# QA

Automated gates: `npm run check && npm run build`, then `npm run smoke:all` (builds nothing — run `npm run build` first).
The same suites run against PostgreSQL with `npm run smoke:db` (`DATA_PROVIDER=prisma`, `DATABASE_URL` of a LOCAL development database;
the runner empties and re-seeds it before every suite). Integration tests without a browser: `npm run test:storage` (needs
`DATABASE_URL`), `test:media`, `test:pdf`, `test:email`, `test:payments`. Production mode: `npm run build:prod-test && npm run test:production`.
`smoke:all` (scripts/run-smokes.mjs) starts a FRESH production server for every suite, because auth endpoints are rate limited and the
demo database lives in memory. Pass a name fragment to run one suite: `node scripts/run-smokes.mjs results`.
Browser: Chromium via playwright-core (`CHROMIUM=/path/to/chrome`, default `/opt/pw-browsers/chromium`).

| Suite | What it proves |
| --- | --- |
| `smoke.mjs` | 47 steps: protection, register/login/logout, reset flow, student flow, platform gating, admin CRUD + uploads, suspension, theme, languages |
| `smoke-nav.mjs` | desktop sidebar / mobile drawer / header navigation at every width |
| `smoke-roles.mjs` | only STUDENT and ADMIN: login buttons, redirects, forged cookies, registration, role selector |
| `smoke-courses.mjs` | home → all courses → subject → locked materials → sign-in dialog; removed qualification absent everywhere |
| `smoke-subject.mjs` | public subject outline, accordion, dialog, dynamic topics |
| `smoke-materials.mjs` | material viewer: video / PDF / text / image / audio / file, completion, prev/next, breadcrumbs, access control |
| `smoke-questionbank.mjs` | question CRUD, tags, topic, image, status, search, filters, preview, validation |
| `smoke-testbuilder.mjs` | test builder: picker, reorder, totals, preview, publish, duplicate, archive |
| `smoke-testplayer.mjs` | intro, timer (fake clock), autosave + restore, exit confirmation, attempts limit, images, mobile |
| `smoke-results.mjs` | score, review, retake rules, attempt history, progress = materials + tests |
| `smoke-dashboard.mjs` | real-data dashboard, continue learning, empty states |
| `smoke-stats.mjs` | admin statistics from real records, filters, totals match the lists |
| `smoke-certificates.mjs` | auto issue, admin issue / revoke / restore, print, server PDF download, public verification page, access |
| `smoke-ranking.mjs` | ranking from real results, privacy (no emails / surnames), filters |
| `smoke-notifications.mjs` | every notification type, links, read state, bell badge, admin notices |
| `smoke-payments.mjs` | paid platform: checkout does not unlock, failed / paid / replay, IDOR, forged webhooks, admin access grant / revoke / expiry |
| `smoke-flow.mjs` | guest → student → admin → student → admin on one data set |
| `smoke-security.mjs` | access control, forged cookies, answer-key leakage, secrets in bundle, redirects, headers, removed role and qualification do not return |
| `smoke-i18n.mjs` | 51 page states x EN/RU/UZ show no foreign-language text, raw ICU or message keys |
| `audit-a11y.mjs` | axe-core (WCAG 2 A/AA) on 39 pages in light and dark theme + skip link and mobile-menu keyboard checks |
| `audit-responsive.mjs` | 45 pages x 12 widths (315, 320, 360, 390, 412, 480, 768, 820, 1024, 1280, 1440, 1920): overflow, clipping, touch targets |
| `audit-responsive-flows.mjs` | modals, forms, picker, test player, result, certificate at the same widths |

Known limitations: tested in Chromium only; the bundled Chromium has no H.264, so video playback itself is not exercised (element, headers
and Range support are); page routes inside the authenticated groups render the not-found page with HTTP 200 (their `loading.tsx` streams
first) while public routes and API routes return real 404 / 401 / 403; certificate PDFs are generated on the server (`docs/CERTIFICATES.md`) and can also be printed.

Keyboard / screen-reader pass is manual: mega menu, drawers, dialogs, test player, upload control.

## Mistakes review and practice (phase 17)

`/mistakes` lists the questions a learner answered wrongly or skipped in their **submitted** attempts, from the frozen review
of each attempt (so later edits to the bank never rewrite history), with the correct answer and the explanation **only when the
question has one**. A question is *resolved* when its latest outcome — a later test attempt or a practice answer — is correct.
`/mistakes/practice` quizzes up to 10 unresolved mistakes; every answer is graded on the server (`PracticeAnswer`, ungraded,
never changes a test result). The page never contains the answer key, and only questions the learner got wrong earlier can be
checked. The logic is one pure module (`services/domain/mistakes.ts`) shared by both providers.
