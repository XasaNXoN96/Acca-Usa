# Exams (builder, availability window, review policy)

An exam is a `Test` with `kind = "exam"` (same questions, player, timer, autosave and scoring as a topic test). The Admin
exam builder (**Admin → Exams → Schedule exam**) uses the existing Question Bank: it never copies questions.

## Settings

| Setting | Notes |
| --- | --- |
| Title, instructions | `description` — shown on the start screen before the student begins |
| Subject, questions | published questions of that subject, ordered; optional per-attempt randomisation of questions / answers |
| Duration, pass mark, attempts | attempts `0` = unlimited (default for a new exam: 1) |
| Opens / closes | optional, **UTC**; empty = no limit on that side; closes must be after opens |
| Review policy | `IMMEDIATE` (after submitting), `AFTER_CLOSE` (once the exam has closed), `NEVER` (score only) |
| Published | drafts are invisible to students; publish / unpublish, duplicate (a draft copy with the same window and policy) and archive from the list |

An exam has no topic: it never counts in topic progress, topic test lists or topic statistics. `kind` cannot be changed after
creation.

## What the server enforces

* **Window:** before opening → `EXAM_NOT_OPEN`, after closing → `EXAM_CLOSED` (server clock).
* **Deadline:** an attempt ends at *start + duration* but never after the closing time (`attemptDeadline`). Answers are
  autosaved; after the deadline (+60 s grace) the saved draft is submitted automatically.
* **Attempts:** the limit is checked on start; a started attempt is resumed, not duplicated.
* **Review:** applied when a result is *read* (`applyReviewPolicy`); the stored result is never modified, so a later change of
  the policy (or the exam closing) releases the review. A hidden review (`reviewHidden`) also keeps the exam out of
  *My mistakes*, so answers cannot leak that way.

Rules live in `src/services/domain/exams.ts` and are used by both providers (in-memory and PostgreSQL).

## Student side

`/exams` lists published exams with status (Scheduled / Open / Completed), end time, attempts used and the best score; Start is
offered only while the exam is open and the student has active access to the platform. Exams are no longer sample data: with
no exam created the list is empty.

## Tests

`npm run test:exams` (service level; run with `DATA_PROVIDER=memory` and `DATA_PROVIDER=prisma`) and `smoke-exams` (builder
form validation, draft → publish, scheduled / closed states, taking an exam, attempt limit, review policies, mistakes leak,
duplicate / archive, access).

## Limits

* Times are entered in UTC (no per-admin time zone). * No proctoring, identity checks or lockdown browser. * A scheduled
exam does not send a "published" notification at opening time (no scheduler); notifications go out when it is published.
