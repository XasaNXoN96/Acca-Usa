# Content management (materials)

## Visibility: draft / scheduled / published

`Material.published` (default `true`, so everything that existed before stays visible), `Material.publishAt` and
`Material.position`.

| State | Rule | Students |
| --- | --- | --- |
| Draft | `published = false` | never see it (topic list, direct URL, file, subtitles, search, progress totals) |
| Scheduled | `published = true` and `publishAt` in the future | hidden until that moment — evaluated on every request, no background job |
| Published | `published = true` and no/passed `publishAt` | visible |
| Archived | `deletedAt` set | hidden everywhere; admin can restore |

The single rule is `materialLive()` (`src/services/domain/records.ts`) for the in-memory provider and `liveMaterialWhere()`
(`src/services/prisma/catalog.ts`) for PostgreSQL. Both are used by: topic/subject lists, topic context, file route, subtitles
route, progress/percent calculation, "continue learning", statistics, search and guest topic listing.
Admins see everything; **Preview as student** opens the real student page (the topic context includes hidden materials for
admins only, decided on the server).

Known limit: a scheduled material becoming visible does **not** send the "new material" notification (no scheduler).

## Order

`position` (lower first, ties by creation time) is a field of the material form.

## Bulk upload

Admin → Materials → *Bulk upload* (`/admin/materials/bulk`): choose subject / topic / visibility (default Draft), drop many
files. The kind is inferred from the extension; unknown types are refused before any upload. Each file is validated and
uploaded by the normal upload endpoint (progress per file, two at a time) and then saved through the same server action as
the single form. Videos/audio go through the media pipeline afterwards (`docs/MEDIA.md`).

## Versions

When a file is replaced (or the notes text/kind changes) the previous content is kept as a `MaterialVersion` instead of
being deleted. History: Admin → Materials → *Versions*. Restoring a version makes it current and keeps the content it
replaces as a new version (nothing is lost). The latest 20 versions are kept; older ones (and their files, if no longer
referenced) are removed.

* Version files are not the material's current file, so the file route does not serve them to students; staff can open them.
* **Safe replacement:** a replacement file must be `READY`. A video that is still processing, failed or rejected cannot be
  saved over a working one — students keep the old video until the new one is ready.
* Title, visibility and position changes are not versioned.
