# Certificates

A certificate confirms completion of an online course on ACCA USA. It makes **no** claim to be an ACCA / FIA qualification —
the disclaimer is part of the screen version, the PDF and the verification page.

## Issue rules

* **Automatic:** when every visible topic of a subject is completed (materials + passed test), exactly one certificate is
  issued (`issueIfEarned`, idempotent — a learner who ever held one for the subject is not issued another automatically).
* **Manual:** an administrator can issue one for an enrolled student; a duplicate active certificate is refused.
* **Revoke / restore:** administrators only; revoked certificates are shown as revoked, cannot be printed / downloaded
  (`410`), and the public verification page says so.
* **Number:** `AU-<year>-<6 digits>`, unique (DB constraint), from an atomic per-year counter (`CertificateCounter`).
* **Snapshots:** holder name, subject code / name and title are copied at issue time — renaming a student or subject never
  rewrites a certificate.

## PDF

`GET /api/certificates/[id]/pdf` → `generateCertificatePdf` (`src/services/certificates/pdf.ts`, `serverPdfProvider`).

* Server-side with `pdf-lib`; A4 landscape; ACCA USA brand (navy / red), double border, holder name, course, platform, issue
  date, certificate number, QR code + printed verification URL, signature line and disclaimer.
* DejaVu Sans / Serif (embedded, subsetted; `src/assets/fonts`, licence included) cover Latin, Cyrillic and Uzbek letters.
  Characters outside the font are replaced with `?` instead of failing the download; very long names shrink to fit.
* Wording follows the learner's language (EN / RU / UZ); the demo line appears only in demo mode.
* Authorisation: session required; the owner **or an admin** only; other learners and unknown ids both get `404`;
  guests `401`; revoked `410`. The id in the URL never decides ownership.
* Responses are `private, no-store`.
* Tested with real files: `npm run test:pdf` (text extraction in three scripts, long and hostile names, A4 landscape, revoked
  watermark) and the browser smoke `smoke-certificates`.

## Screen actions

The certificate page offers **Download PDF**, **Print / Save as PDF** (print stylesheet shows only the certificate) and a link
to the **public verification page**.

## Public verification

`/verify/certificate/[certificateNumber]` (no login, `noindex`, never cached):

| Shown | Never shown |
| --- | --- |
| status (valid / revoked), course, platform, issue date, number, holder as **"Maria L."** | e-mail, user / certificate ids, full surname, progress, scores, anything else about the learner |

Numbers are sequential, so the holder name is abbreviated to keep a scan of numbers from revealing a roster; lookups are rate
limited (30 / 10 min per client) and malformed numbers are rejected before touching the database. The QR code on the PDF
points here.

## Out of scope

Digital signatures (PAdES), blockchain anchoring and a vendor-issued credential are not implemented; the verification page is
the authority for validity.
