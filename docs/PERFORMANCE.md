# Performance notes

What was changed for production load, why, and what is **not** measured here (no load-test environment was available).

## Data access

* **Targeted queries, not snapshots.** Lists use one query per table with `include` / `groupBy` (e.g. per-user attempt counts and
  best scores for a whole test list come from one `groupBy`). No per-row queries.
* **Shared progress rules, scoped data.** Progress / unlocking / certificates run on a `CalcDb` snapshot (`loadCalcDb`): the
  small catalogue tables plus learning state for the requested user(s) only. Admin lists, ranking and statistics load every
  learner on purpose (they are aggregates).
* **Request-scoped memoisation.** Read paths use `loadCalcDbForRead` (React `cache`): a dashboard that asks for progress,
  ranking, certificates and enrolments loads the data once per request. Write paths use the uncached loader, so a write is
  never followed by a stale read in the same request.
* **File route.** `/api/files/[id]` resolves the material with one indexed lookup (`materials.getByFileId`) instead of
  loading every material per request.
* **Indexes** follow the read paths (`docs/DATABASE.md`): topic order per subject, material by subject / topic / file, attempts by
  user + test + status, notifications by user + read state, activity by user + time, payments by user + status, enrolments by platform + status.
* **Concurrency-safe counters.** Certificate numbers, rate limits and reset tokens use single atomic statements (no read-modify-write).

## Delivery

* Video / audio are served with HTTP Range (`206`) from the storage provider; uploads are streamed (multipart), never buffered whole.
* Certificate PDFs are generated per request (≈ tens of ms, ~100 KB: fonts are subsetted) and are `private, no-store`.
* Pages that need the session are dynamic by nature; public marketing pages avoid per-request work beyond translations.
* Fonts are self-hosted by Next; the PDF fonts are loaded once per process and cached.

## Known limits (honest list)

* `loadCalcDb("all")` (ranking, statistics, admin student list) scales with learners × topics. Fine for thousands of learners;
  beyond that, move the aggregates to SQL / materialised views or a cache with a short TTL.
* The `RateLimit` table is cleaned lazily by index on `resetAt`; add a periodic `DELETE … WHERE resetAt < now()` job at scale.
* No CDN / image optimisation is configured (the product has almost no raster images). Add one in front of `/_next/static` and,
  if wanted, signed bucket URLs for large videos (`StorageProvider.signedUrl`).
* No load or Lighthouse numbers are claimed: measure on the target infrastructure before publishing targets.
