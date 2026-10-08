# QA

Automated gates: `npm run check && npm run build`.

**End-to-end smoke test** (`npm run smoke`, Playwright + Chromium, run against a freshly started production server because
auth endpoints are rate limited): 47 steps covering anonymous protection, register/login/logout, duplicate email, wrong password,
forgot + reset (single use), student flow (enrol → subject → topic → materials → test → autosave → submit → result → review → retake),
platform separation (CIMA gated), admin flow (platform edit, subject, topic, notes + PDF/PNG/MP3/MP4 uploads, invalid file rejection,
question bank, test draft/publish/archive/restore), suspension, self-protection, teacher permissions, theme (persistence, no flash, system),
language (RU/UZ pages without raw keys, persistence).

**Responsive audit**: every route (public, auth, student, admin) and admin dialog at 360 / 390 / 768 / 1024 / 1280 / 1440 px, in Russian,
light and dark: no horizontal overflow, no clipped dialogs, no interactive element under 24px, no console errors.
Last run: 576 checks, 0 problems.

Keyboard / screen-reader pass is manual: mega menu, drawers, dialogs, test runner, upload control.
