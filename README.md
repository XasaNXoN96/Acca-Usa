# ACCA USA

Learning platform for ACCA and FIA students. This repository contains the **foundation and full UI**:
design system, i18n (EN/RU/UZ), public site, student area, admin area, and the service/Prisma architecture the backend block will plug into.

> Status: **production-ready architecture, two modes.** *Demo* (default) runs standalone on fictional data. *Production* runs on
> PostgreSQL + private S3-compatible storage + SMTP + Stripe Checkout and refuses to start with a missing or unsafe configuration.
> Same UI and contracts in both. What is verified, and what is verified only against local stand-ins (S3, SMTP, Stripe), is spelled out in
> `docs/PRODUCTION_ARCHITECTURE.md`, `docs/DEPLOYMENT_MODES.md` and `docs/SECURITY_AUDIT.md`.

## Stack
Next.js 16 (App Router) · TypeScript · Tailwind CSS 4 · shadcn/ui-style components (Radix) · Lucide · next-intl · React Hook Form + Zod · Prisma + PostgreSQL · own signed-cookie session layer (scrypt, no Auth.js) · pdf-lib (certificate PDFs) · nodemailer (SMTP) · Stripe Checkout over REST.

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

Run the demo on PostgreSQL (same UI, real database):
```bash
export DATABASE_URL="postgresql://user:pass@localhost:5432/acca_usa?schema=public"
npm run db:migrate && npm run db:seed        # migrations + demo data (development only)
DATA_PROVIDER=prisma npm run dev
```
Production setup, required environment and the first administrator: `docs/DEPLOYMENT_MODES.md`.

## Structure
```
src/
  app/            routes — (public) (auth) (student) (focus: tests) admin
  components/
    ui/           design-system primitives (Button, Card, Dialog, Tabs, DataTable, …)
    layout/       header, mega menu, shells, sidebars, bottom nav, language switcher
  features/       screen-level modules: landing, dashboard, courses, subject, topic, test, result, admin, auth…
  services/       contracts.ts (interfaces) · domain/ (pure rules shared by providers) · mock/ (in-memory demo provider) · prisma/ (PostgreSQL provider)
                  storage/ (demo + S3) · email/ (demo + SMTP) · payments/ (demo + Stripe, state machine) · certificates/ (PDF)
  data/mock/      DEMO data (server-only)
  lib/            routes, navigation, permissions, format, validators, theme, app-mode, auth/ (token, password, session, guards), rate-limit
  i18n/           config, request, actions, messages/{en,ru,uz}.json
  types/          domain types, next-intl typing
prisma/           schema, migrations, seed (dev / demo only), bootstrap (production structure)
scripts/          smoke / audit suites, integration tests (scripts/integration), admin:create
docs/             architecture, database, auth, storage, media, certificates, e-mail, payments, access, security, deployment, QA
PROJECT_RULES.md  binding technical rules
```

## Routes
Public: `/`, `/all-courses`, `/acca`, `/fia`, `/books`, `/forums`, `/search`, `/login`, `/register`, `/verify/certificate/[number]`
Student: `/dashboard`, `/courses`, `/platform/[platform]`, `/subject/[subject]` (public outline for guests), `/subject/[subject]/topic/[topic]`, `/subject/[subject]/topic/[topic]/material/[material]` (material viewer), `/test/[test]`, `/test/[test]/result`, `/exams`, `/progress`, `/ranking`, `/certificates`, `/certificates/[id]`, `/payments`, `/notifications`, `/profile`
Admin: `/admin` and `/admin/{platforms,subjects,topics,materials,question-bank,tests,exams,students,access,certificates,payments,statistics,notifications,settings}`
API: `/api/files/[id]` (authorised file bytes), `/api/uploads` (admin), `/api/certificates/[id]/pdf`, `/api/webhooks/payments` (signed provider callbacks)

Roles: `ADMIN` and `STUDENT` only. Public registration always creates a student.

## Learning flow
Guest: `/` → `/all-courses` → subject → topics → locked materials (sign-in dialog). Student: material viewer (video, PDF, text, image, audio, file) → mark completed → topic test → result + review → progress → dashboard → certificate. Admin builds the content: subject → topic → material → question bank → test builder → publish; statistics, certificates and notifications are derived from real records.

## Quality gates
`npm run check` (lint, typecheck, i18n parity + quality, brand) · `npm run build` · `npm run smoke:all` (every smoke / audit suite against a fresh server, see docs/QA.md) · `npm run smoke:db` (the same suites on PostgreSQL) · `npm run test:storage|media|pdf|email|payments` · `npm run build:prod-test && npm run test:production`.

## Documentation
`docs/PRODUCTION_ARCHITECTURE.md` (start here) · `DATABASE.md` · `AUTH.md` · `STORAGE.md` · `MEDIA.md` · `CERTIFICATES.md` · `EMAIL.md` · `PAYMENTS.md` · `ACCESS_CONTROL.md` · `SECURITY_AUDIT.md` · `DEPLOYMENT_MODES.md` · `QA.md` · `DEMO_MODE.md`.

Read `PROJECT_RULES.md` before contributing.
