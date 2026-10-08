# ACCA USA

Learning platform for ACCA, CIMA and FIA students. This repository contains the **foundation and full UI**:
design system, i18n (EN/RU/UZ), public site, student area, admin area, and the service/Prisma architecture the backend block will plug into.

> Status: UI + architecture only. Authentication, database, payments and file storage are **not connected** — the app runs on clearly-labelled demo data.

## Stack
Next.js 16 (App Router) · TypeScript · Tailwind CSS 4 · shadcn/ui-style components (Radix) · Lucide · next-intl · React Hook Form + Zod · Prisma + PostgreSQL (schema only) · Auth.js (config prepared).

## Getting started
```bash
npm install          # also runs `prisma generate`
npm run dev          # http://localhost:3000
npm run check        # lint + typecheck + i18n parity + brand check
npm run build
```
Copy `.env.example` to `.env` only when the backend block starts; nothing is required today.

## Structure
```
src/
  app/            routes — (public) (auth) (student) (focus: tests) admin
  components/
    ui/           design-system primitives (Button, Card, Dialog, Tabs, DataTable, …)
    layout/       header, mega menu, shells, sidebars, bottom nav, language switcher
  features/       screen-level modules: landing, dashboard, courses, subject, topic, test, result, admin, auth…
  services/       contracts.ts (interfaces) + mock/ implementations, composed in index.ts
  data/mock/      DEMO data (server-only)
  lib/            routes, navigation, permissions, format, validators, platform theme, env, db
  i18n/           config, request, actions, messages/{en,ru,uz}.json
  types/          domain types, next-intl typing, Auth.js augmentation
  auth/           Auth.js config (prepared, not wired)
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
3. Wire Auth.js (`src/auth/config.ts`), route guard, role checks in server actions.
4. File storage + signed URLs; payments; server-owned test deadlines.

Read `PROJECT_RULES.md` before contributing.
