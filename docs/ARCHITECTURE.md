# Architecture

```
Route (server) ──► services.* (contracts) ──► mock (demo) | Prisma (PostgreSQL)   — chosen once, in services/index.ts
      │
      └─► feature components ──► ui components
Client features ──► server actions (Zod-validated, permission-checked) ──► services.*
```
- Services are the only data boundary. Contracts in `services/contracts.ts`; `DATA_PROVIDER` picks the implementation in `services/index.ts`. Pure rules (progress, unlocking, access) live in `services/domain` and are shared by both providers. Full picture: `docs/PRODUCTION_ARCHITECTURE.md`.
- Test answers are scored on the server; the browser receives questions without answers. Drafts autosave through `saveDraftAction`.
- Roles/permissions: `lib/permissions.ts`; sessions are our own signed cookie (`lib/auth`, see `docs/AUTH.md`); Auth.js was removed.
- i18n: cookie-based locale, messages merged over English as a safety net.
- The mock store (`services/mock/db.ts`) is in-memory and resets on restart by design; it is demo-only.

## P0 additions
- **Auth**: `lib/auth/{token,password,session,guards,redirect,secret}` + `proxy.ts`; actions in `features/auth/actions.ts`.
- **Storage**: `services/storage/{contracts,validation,demo-provider,production-provider,index}`; routes `/api/uploads`, `/api/files/[id]`.
- **Admin CRUD**: declarative `features/admin/resources.ts` → server `build-rows.tsx` → client `resource-table.tsx` + `record-dialog.tsx` → `actions.ts` (validate with `lib/validators/admin.ts`, authorise, call services).
- **Demo data provider**: `services/mock/db.ts` (in-memory, soft-delete aware) + `calc.ts` (progress, unlocking) + per-domain service files.
