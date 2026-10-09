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

## Analytics (Admin → Materials → Analytics)

`MaterialView` records one row each time a **student** opens a material (at most one per student and material per 30
minutes; administrators' opens are not recorded). Per material and period the page shows views, distinct viewers,
completions (`MaterialProgress.completedAt` in the period — an undone completion is gone), completion rate
(completions ÷ viewers, `—` when nobody viewed it), the media-pipeline state of the file with the error reason for FAILED /
REJECTED files, and attempts + average score of the **topic's** tests (a test belongs to a topic, not to one material).
Both providers load raw records and call the same pure function (`domain/material-stats.ts`), so the numbers cannot drift.
Empty periods show zeros; there are no estimated or sample figures. Views before this feature existed are unknown (0).

## Student notes

`MaterialNote` (table, additive migration): a private note of one student on one material, optionally anchored to a PDF page
(`pdfPage`) or a media time (`videoSeconds`) — never both. Created / edited / deleted by server actions that require a
signed-in STUDENT; creating also requires that the student may read the material (enrolment, unlocked topic, published).
Every service call is scoped by the session's user id, so another student's note is simply "not found" (IDOR-safe; verified
for both providers by `npm run test:notes`). Notes are never kept in `localStorage`. **There is no administrator read path:**
administrators cannot see student notes, and their own material preview has no notes panel. Limits: 2000 characters per
note, 2000 notes per student. Deleting a student or a material removes its notes (cascade). Student pages: the panel under the
viewer (jump to the page / time) and `/notes` (all notes, search by text or material title). A note on a material that is
hidden later stays in the list without a link.
