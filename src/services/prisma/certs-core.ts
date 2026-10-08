import "server-only";
import { randomUUID } from "node:crypto";
import type { Certificate as DbCertificate } from "@prisma/client";
import type { IssuedCertificate, PlatformSlug } from "@/types";
import { routes } from "@/lib/routes";
import { getPrisma } from "@/lib/prisma";
import { subjectProgress } from "../domain/calc";
import { notifyAdmins, notifyUser, recordActivity } from "./events";
import { emailCertificateIssued } from "../email/events";
import { loadCalcDb } from "./load";

/** AU-<year>-<6 digits> */
export const formatCertificateNumber = (year: number, seq: number) => `AU-${year}-${String(seq).padStart(6, "0")}`;

export const toIssuedCertificate = (c: DbCertificate): IssuedCertificate => ({
  id: c.id, number: c.number, userId: c.userId, studentName: c.studentName, platform: c.platformSlug as PlatformSlug,
  subjectSlug: c.subjectSlug, subjectCode: c.subjectCode, subjectName: c.subjectName, title: c.title,
  issuedAt: c.issuedAt.toISOString(), status: c.status, revokedAt: c.revokedAt?.toISOString(), source: c.source,
});

export const activeCertificate = (userId: string, subjectSlug: string) =>
  getPrisma().certificate.findFirst({ where: { userId, subjectSlug, status: "issued" } });

/** Creates the record (unique number from a per-year counter, atomically) + activity + notifications. */
export async function createCertificate(userId: string, subjectSlug: string, source: "auto" | "admin"): Promise<IssuedCertificate | null> {
  const prisma = getPrisma();
  const [user, subject] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId } }),
    prisma.subject.findFirst({ where: { slug: subjectSlug, deletedAt: null }, include: { level: true } }),
  ]);
  if (!user || !subject) return null;
  const platform = subject.level.platformSlug;
  const year = new Date().getUTCFullYear();
  const cert = await prisma.$transaction(async (tx) => {
    const counter = await tx.certificateCounter.upsert({ where: { year }, create: { year, last: 1 }, update: { last: { increment: 1 } } });
    return tx.certificate.create({
      data: {
        id: `cert-${randomUUID()}`, number: formatCertificateNumber(year, counter.last), userId, platformSlug: platform, subjectSlug, studentName: user.name,
        subjectCode: subject.code, subjectName: subject.name, title: `${platform.toUpperCase()} ${subject.code} — ${subject.name}`, source,
      },
    });
  });
  await recordActivity({ userId, kind: "topic", title: cert.title, context: subject.name, href: routes.certificate(cert.id), detail: cert.number });
  await notifyUser(userId, { code: "certificate_issued", params: { title: cert.title }, target: { kind: "certificate", id: cert.id } });
  if (source === "auto") await notifyAdmins({ code: "certificate_auto_issued", params: { student: user.name, title: cert.title }, target: { kind: "admin", path: "/admin/certificates" } });
  const issued = toIssuedCertificate(cert);
  await emailCertificateIssued({ name: user.name, email: user.email, locale: user.locale }, issued);
  return issued;
}

/**
 * Course-completion rule: every visible topic of the subject is completed (materials + tests, see domain/calc.topicPercent).
 * Idempotent: a student who ever received a certificate for the subject (even a revoked one) is not issued another
 * automatically — an administrator can restore or re-issue it.
 */
export async function issueIfEarned(userId: string, subjectSlug: string): Promise<void> {
  const prisma = getPrisma();
  if (await prisma.certificate.findFirst({ where: { userId, subjectSlug }, select: { id: true } })) return;
  const p = subjectProgress(await loadCalcDb([userId]), userId, subjectSlug);
  if (p.total > 0 && p.completed === p.total) await createCertificate(userId, subjectSlug, "auto");
}
