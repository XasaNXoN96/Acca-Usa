# Architecture

```
Route (server) ──► services.* (contracts) ──► mock now / Prisma next
      │
      └─► feature components ──► ui components
Client features ──► server actions (Zod-validated, permission-checked) ──► services.*
```
- Services are the only data boundary. Contracts in `services/contracts.ts`; swap implementations in `services/index.ts`.
- Test answers are scored on the server; the browser receives questions without answers. Drafts autosave through `saveDraftAction`.
- Roles/permissions: `lib/permissions.ts`; Auth.js config prepared in `src/auth/config.ts` (no providers → nothing can sign in).
- i18n: cookie-based locale, messages merged over English as a safety net.
- Mock store (`services/mock/store.ts`) is in-memory and resets on restart by design.

## P0 additions
- **Auth**: `lib/auth/{token,password,session,guards,redirect,secret}` + `proxy.ts`; actions in `features/auth/actions.ts`.
- **Storage**: `services/storage/{contracts,validation,demo-provider,production-provider,index}`; routes `/api/uploads`, `/api/files/[id]`.
- **Admin CRUD**: declarative `features/admin/resources.ts` → server `build-rows.tsx` → client `resource-table.tsx` + `record-dialog.tsx` → `actions.ts` (validate with `lib/validators/admin.ts`, authorise, call services).
- **Demo data provider**: `services/mock/db.ts` (in-memory, soft-delete aware) + `calc.ts` (progress, unlocking) + per-domain service files.
