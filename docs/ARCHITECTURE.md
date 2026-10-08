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
