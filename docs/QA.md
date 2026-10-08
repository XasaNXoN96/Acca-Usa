# QA checklist

Automated: `npm run check && npm run build`.

Manual / scripted responsive audit (Playwright, Chromium): open every route at 360, 430, 820, 1280, 1600 px in **Russian**; assert
`document.documentElement.scrollWidth <= innerWidth`, no element (outside a scroll container) extends past the viewport, and no console errors.
Last run: 38 routes × 5 widths — 0 problems.

Keyboard pass: tab through header → mega menu (chevron opens, Esc closes) → drawer → test runner (arrow keys inside answer group) → dialogs (focus trapped/restored).

Content pass: switch EN/RU/UZ on every screen; confirm no raw keys and no truncation of primary actions.
