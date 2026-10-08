# Storage

All file access goes through `StorageProvider` (`src/services/storage/contracts.ts`); features never name S3.

| Provider | When | Bytes | Metadata |
| --- | --- | --- | --- |
| `DemoStorageProvider` | `NEXT_PUBLIC_APP_MODE=demo` | OS temp directory (disposable) | JSON next to the file |
| `ProductionStorageProvider` | `production` | private S3-compatible bucket | `StoredFile` table (PostgreSQL) |

Operations: `put`, `stat` (metadata), `exists`, `open` (ranged stream), `delete`, `replace`, `markAttached`, `signedUrl`.

## Rules

* **Private by default.** The bucket must block public access. Object keys are server-generated (`files/<uuid>`); user-supplied
  names are sanitised and kept only as metadata. Browsers never see a bucket URL.
* **Authorisation before bytes.** `/api/files/[id]` checks the session, then — for students — that the file is attached to a
  visible material of a platform they are actively enrolled in and that the topic is unlocked (question images: published
  question in a published test of an enrolled platform). Only then does it stream (HTTP Range supported for seeking) or, when
  the provider can sign, hand out a **short-lived** signed URL (`signedUrl`, 10 s – 15 min). A signed URL is a capability, not
  an access check — it is minted only after the check above.
* **Validation.** `validateUpload()` (`validation.ts`) runs before `put`: extension allow-list per kind, size cap, magic-byte
  signature, MIME derived from the extension (the client's `Content-Type` is ignored). SVG / HTML are rejected. Uploads are
  rate limited and require the `ADMIN` role.
* **Streaming.** Uploads use multipart streaming (`@aws-sdk/lib-storage`), so a 150 MB video is never held in memory.
* **Lifecycle.** New uploads are `attached = false`; attaching to a material / question flips it. Replacing or removing the
  file deletes the old object. `collectGarbage()` removes unattached uploads older than a day (run it from a scheduled job).
  If the metadata insert fails the freshly uploaded object is deleted again (no orphans).

## Configuration

```
S3_BUCKET  S3_REGION  S3_ACCESS_KEY_ID  S3_SECRET_ACCESS_KEY
S3_ENDPOINT=https://…        # optional: R2 / MinIO / other S3-compatible endpoints
S3_FORCE_PATH_STYLE=1        # optional: MinIO-style path addressing
```

Server-only; validated at startup (`src/lib/env-check.ts`). Credentials need `GetObject`, `PutObject`, `DeleteObject` on the
bucket and nothing else.

## What is verified

`npm run test:storage` runs the real provider against an in-process S3-compatible stub and local PostgreSQL: server-side keys,
signed requests, sanitised names, ranged reads, time-limited signed URLs (with disposition), replace / delete / garbage
collection and orphan prevention. It has **not** been run against a real vendor bucket from this environment — do a smoke
upload / download in staging before go-live.
