# Enrolment and access control

## States

`Enrollment.status`: `FREE` (self-service enrolment on a free platform), `ACTIVE` (paid or granted by an administrator),
`EXPIRED`, `REVOKED`. `expiresAt` (optional) ends access automatically.

**One rule, one place** (`enrollmentActive` in `src/services/domain/calc.ts`, used by both data providers): access exists only
while the status is `FREE` or `ACTIVE` **and** `expiresAt` has not passed. `EXPIRED` and `REVOKED` never grant access whatever the
dates say; an `ACTIVE` enrolment past its date is *treated* as expired immediately (no cron needed) and shown as such.

## Where it is enforced (server-side, every time)

| Surface | Check |
| --- | --- |
| platform pages / `PlatformGate` | `services.enrollments.isEnrolled` (active only) |
| topics, materials, tests, results | enrolment + unlocked topic (`topicsWithStatus`) |
| `/api/files/[id]` | session → file ↔ material ↔ platform → active enrolment → topic unlocked |
| dashboard, ranking, statistics, notifications fan-out | `activePlatformsOf` / `enrollmentActive` |
| search | public hits expose titles only; protected content is not returned |

The browser never decides: UI buttons are conveniences, the server re-checks on every action and request.

## Transitions

| Event | From → To | Who |
| --- | --- | --- |
| enrol on a free platform | none / EXPIRED → `FREE` | the student (`PAYMENT_REQUIRED` for paid platforms) |
| verified payment | none / EXPIRED / FREE / REVOKED → `ACTIVE` (`source=payment`) | payment webhook only |
| admin grant (optional expiry) | any → `ACTIVE` (`source=admin`) | administrator (Admin → Access) |
| admin revoke | any → `REVOKED` | administrator |
| refund | payment's enrolment → `REVOKED` | payment webhook |
| date passes | `FREE` / `ACTIVE` → effectively expired | automatic |
| leave | `FREE` (self) → removed | the student; paid / admin access cannot be left — the school manages it |

A `REVOKED` learner cannot re-enrol themselves on a free platform (`ACCESS_REVOKED`); a paid purchase or an admin grant restores
access. Progress is **kept** across revoke / expiry / re-grant. The student UI shows "Renew access" for expired paid access and an
explanation for revoked access; learners get a notification when access is granted or withdrawn.

## Admin

Admin → **Access** lists every enrolment with status, source and expiry; *Grant access* (student, platform, optional date),
*Revoke*, *Restore*. Validated with Zod (valid future date, known student / platform) and authorised with `manage_students`
on the server. Admin → **Platforms** sets the price (0 = free).
