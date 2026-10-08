# QA

Automated gates: `npm run check && npm run build`, then `npm run smoke:all` (builds nothing — run `npm run build` first).
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
| `smoke-certificates.mjs` | auto issue, admin issue / revoke / restore, print, access, PDF seam |
| `smoke-ranking.mjs` | ranking from real results, privacy (no emails / surnames), filters |
| `smoke-notifications.mjs` | every notification type, links, read state, bell badge, admin notices |
| `smoke-flow.mjs` | guest → student → admin → student → admin on one data set |
| `smoke-security.mjs` | access control, forged cookies, answer-key leakage, secrets in bundle, redirects, headers, removed role and qualification do not return |
| `smoke-i18n.mjs` | 51 page states x EN/RU/UZ show no foreign-language text, raw ICU or message keys |
| `audit-responsive.mjs` | 45 pages x 7 widths (360, 390, 412, 768, 1024, 1280, 1440): overflow, clipping, touch targets |
| `audit-responsive-flows.mjs` | modals, forms, picker, test player, result, certificate at the same widths |

Known limitations: tested in Chromium only; the bundled Chromium has no H.264, so video playback itself is not exercised (element, headers
and Range support are); page routes inside the authenticated groups render the not-found page with HTTP 200 (their `loading.tsx` streams
first) while public routes and API routes return real 404 / 401 / 403; PDF generation on the server is a seam (501), certificates print via the browser.

Keyboard / screen-reader pass is manual: mega menu, drawers, dialogs, test player, upload control.
