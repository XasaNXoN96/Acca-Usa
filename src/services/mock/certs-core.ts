import "server-only";
import type { IssuedCertificate } from "@/types";
import { certificateNumber, newId, nowIso, pushActivity, pushNotification, type Db } from "./db";
import { subjectProgress } from "./calc";
import { routes } from "@/lib/routes";

/** Active (not revoked) certificate of a student for a subject, if any. */
export const activeCertificate = (db: Db, userId: string, subjectSlug: string) =>
  db.certificates.find((c) => c.userId === userId && c.subjectSlug === subjectSlug && c.status === "issued");

/** Creates the record + notification. Callers decide whether the student is allowed to receive it. */
export function createCertificate(db: Db, userId: string, subjectSlug: string, source: IssuedCertificate["source"]): IssuedCertificate | null {
  const user = db.users.find((u) => u.id === userId);
  const subject = db.subjects.find((s) => s.slug === subjectSlug && !s.deletedAt);
  const level = subject && db.levels.find((l) => l.id === subject.levelId);
  if (!user || !subject || !level) return null;
  const now = new Date();
  db.certificateSeq += 1;
  const cert: IssuedCertificate = {
    id: newId("cert"), number: certificateNumber(now, db.certificateSeq), userId, studentName: user.name, platform: level.platform,
    subjectSlug, subjectCode: subject.code, subjectName: subject.name, title: `${level.platform.toUpperCase()} ${subject.code} — ${subject.name}`,
    issuedAt: nowIso(), status: "issued", source,
  };
  db.certificates.push(cert);
  pushActivity(db, { userId, kind: "topic", title: cert.title, context: subject.name, href: routes.certificate(cert.id), detail: cert.number });
  pushNotification(db, userId, { code: "certificate_issued", params: { title: cert.title }, target: { kind: "certificate", id: cert.id } });
  return cert;
}

/**
 * Course-completion rule: every visible topic of the subject is completed (materials + tests, see calc.topicPercent).
 * Idempotent: a student who ever received a certificate for the subject (even a revoked one) is not issued another
 * automatically — an administrator can restore or re-issue it.
 */
export function issueIfEarned(db: Db, userId: string, subjectSlug: string): void {
  if (db.certificates.some((c) => c.userId === userId && c.subjectSlug === subjectSlug)) return;
  const p = subjectProgress(db, userId, subjectSlug);
  if (p.total > 0 && p.completed === p.total) createCertificate(db, userId, subjectSlug, "auto");
}
