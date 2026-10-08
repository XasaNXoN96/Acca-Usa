# ACCA USA

Learning platform for ACCA, CIMA and FIA students. This repository contains the **foundation and full UI**:
design system, i18n (EN/RU/UZ), public site, student area, admin area, and the service/Prisma architecture the backend block will plug into.

> Status: **P0 basic MVP in demo mode.** Real authentication (register / login / logout / forgot + reset password, roles, protected routes),
> a working student learning flow, admin content management, server-side tests and a storage abstraction with a demo provider.
> Data lives in an in-memory demo store (resets on restart). PostgreSQL, production storage and payments are the next block — see `docs/DEMO_MODE.md`.

## Stack
Next.js 16 (App Router) · TypeScript · Tailwind CSS 4 · shadcn/ui-style components (Radix) · Lucide · next-intl · React Hook Form + Zod · Prisma + PostgreSQL (schema only) · Auth.js (config prepared).

## Getting started
```bash
npm install          # also runs `prisma generate`
npm run dev          # http://localhost:3000
npm run check        # lint + typecheck + i18n parity (incl. admin labels) + brand check
npm run build
npm start -- -p 3100 # then, in another terminal:
BASE_URL=http://localhost:3100 CHROMIUM=/path/to/chrome npm run smoke   # 47-step end-to-end smoke test
```
No configuration is required: `NEXT_PUBLIC_APP_MODE=demo` is the default. Demo accounts are listed on the login page and in `docs/DEMO_MODE.md`.

## Structure
```
src/
  app/            routes — (public) (auth) (student) (focus: tests) admin
  components/
    ui/           design-system primitives (Button, Card, Dialog, Tabs, DataTable, …)
    layout/       header, mega menu, shells, sidebars, bottom nav, language switcher
  features/       screen-level modules: landing, dashboard, courses, subject, topic, test, result, admin, auth…
  services/       contracts.ts (interfaces) + mock/ (demo data provider) + storage/ (StorageProvider: demo + production placeholder)
  data/mock/      DEMO data (server-only)
  lib/            routes, navigation, permissions, format, validators, theme, app-mode, auth/ (token, password, session, guards), rate-limit
  i18n/           config, request, actions, messages/{en,ru,uz}.json
  types/          domain types, next-intl typing, Auth.js augmentation
  auth/           Auth.js config (prepared for the backend block; the demo session layer lives in lib/auth)
prisma/schema.prisma   PostgreSQL schema (prepared)
docs/             design system, architecture, QA
PROJECT_RULES.md  binding technical rules
```

## Routes
Public: `/`, `/acca`, `/cima`, `/fia`, `/books`, `/forums`, `/search`, `/login`, `/register`
Student: `/dashboard`, `/courses`, `/platform/[platform]`, `/subject/[subject]`, `/topic/[topic]`, `/test/[test]`, `/test/[test]/result`, `/exams`, `/progress`, `/ranking`, `/certificates`, `/payments`, `/notifications`, `/profile`
Admin: `/admin` and `/admin/{platforms,subjects,topics,materials,question-bank,tests,exams,students,payments,statistics,settings}`

## Next block (backend)
1. `prisma migrate dev`, seed catalogue.
2. Implement `services/prisma/*` against `services/contracts.ts`; swap them in `services/index.ts`.
3. Swap the demo session layer for Auth.js (`src/auth/config.ts`); keep `lib/auth/guards.ts` as the call-site API.
4. `ProductionStorageProvider` (private bucket + signed URLs); payments; email for password reset; shared rate-limit store.

Read `PROJECT_RULES.md` before contributing.
