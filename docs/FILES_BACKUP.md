# Backing up the learning files (materials, images, subtitles, posters)

`npm run db:backup` saves **only PostgreSQL** (`docs/BACKUP_RESTORE.md`). The study files are in the private S3-compatible bucket
(`S3_*`, `docs/STORAGE.md`); the database holds one `StoredFile` row per object (`storageKey = files/<id>`, size, status,
attachment). Both halves must be protected, and **nothing in this repository backs up the bucket** — this document is the plan,
and none of it has been executed against a real provider from this environment.

## Why the application cannot be your safety net

The application *deletes* objects: replacing or removing a file deletes the old object, `collectGarbage()` deletes unattached
uploads older than a day, and an administrator can archive material. There is no trash for objects. Protection therefore has to
come from the storage provider.

## Required provider settings (do these before go-live)

1. **Block all public access** on the bucket (already a requirement of `docs/STORAGE.md`).
2. **Versioning ON** (or the provider's equivalent, e.g. Cloudflare R2 has no object versioning — then use scheduled replication
   to a second bucket instead). With versioning, an accidental delete or overwrite is reversible.
3. **Lifecycle rule** that keeps *non-current versions* for a defined period (e.g. 30–90 days) and then expires them — decide the
   period with your retention policy (`docs/LEGAL.md` item 7: deleted personal data should not live forever in versions).
4. **Replication** to a second bucket in another region **and another account/credentials** (so a leaked or mistaken application
   key cannot delete the copy). The application's key needs only Get/Put/Delete on the primary bucket; it must have **no** rights on the copy.
5. Optional: object lock / MFA-delete for the replica.
6. **Data residency:** the copy is also personal-data storage; keep it where `LEGAL_DATA_LOCATION` says (`docs/LEGAL.md` item 2).

## Keeping database and files consistent

* Take the database backup and note the time. Files are write-mostly; with versioning every object that existed at that time can be
  recovered, so *restore the database first, then verify the files it points to*.
* After **any** database restore run this check against the restored database and the bucket (replace the variables; needs the
  AWS CLI or your provider's equivalent; read-only):

```bash
psql "$RESTORED_DATABASE_URL" -Atc "select \"storageKey\" from \"StoredFile\" where status = 'READY' and attached" |
while read key; do
  aws s3api head-object --bucket "$S3_BUCKET" --key "$key" >/dev/null 2>&1 || echo "MISSING: $key"
done
```

  Every `MISSING` line is a material students would get an error for: restore that object version from the versioned bucket / replica.
* The reverse (objects without a database row, e.g. uploads made after the backup) are harmless orphans; remove them with a
  deliberate, reviewed clean-up — the application does not do it for rows it never had.
* Thumbnails and subtitle/transcript data: posters are objects referenced by `thumbnailKey` (same rule); transcripts and
  subtitles live in the database (`Transcript`, `Subtitle` tables) and are covered by `db:backup`.

## Restore drill for files (quarterly)

1. Pick a random material, delete its object in a **staging** copy of the bucket, and confirm the check above reports it.
2. Restore the previous version / copy it back from the replica; confirm the material plays for a test student.
3. Record date, object, duration and result in your runbook.

## What is *not* covered / not verified

* No bucket backup, replication, versioning or lifecycle rule exists in this repository or was tested; provider behaviour,
  cost and restore speed for large video libraries are unknown.
* The ffmpeg-derived renditions can be regenerated from originals (`media:worker`), the originals cannot — protect originals first.
* Local-disk storage (demo provider) is disposable by design and must never be used in production.
