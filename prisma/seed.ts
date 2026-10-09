/**
 * DEVELOPMENT / DEMO seed — never run in production (it refuses to).
 * Loads the same fictional dataset the in-memory demo provider uses (src/data/mock/*), so the application behaves
 * identically with DATA_PROVIDER=memory and DATA_PROVIDER=prisma in demo mode. Idempotent: existing rows are kept.
 *
 *   DATABASE_URL=… npm run db:seed
 */
import { PrismaClient, type Prisma } from "@prisma/client";
import { platforms, subjects, allTopics, materials } from "../src/data/mock/catalog";
import { btQuestions, questionBank, testRecords } from "../src/data/mock/assessments";
import { DEMO_STUDENT_ID, notifications, payments, seedUsers } from "../src/data/mock/people";

if (process.env.NODE_ENV === "production" || process.env.NEXT_PUBLIC_APP_MODE === "production") {
  console.error("prisma/seed.ts is for development / demo databases only. Refusing to run in production.");
  process.exit(1);
}

const prisma = new PrismaClient();
const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000);
const created = new Date("2026-01-10T10:00:00.000Z");
const day = 86_400_000;

async function main() {
  await prisma.platform.createMany({ data: platforms.map((p) => ({ slug: p.slug, name: p.name, fullName: p.fullName, priceCents: p.priceCents })), skipDuplicates: true });
  await prisma.level.createMany({ data: platforms.flatMap((p) => p.levels.map((l) => ({ id: l.id, platformSlug: p.slug, name: l.name, order: l.order }))), skipDuplicates: true });
  await prisma.subject.createMany({ data: subjects.map((s, i) => ({ slug: s.slug, code: s.code, name: s.name, levelId: s.levelId, position: i + 1, createdAt: created })), skipDuplicates: true });
  await prisma.topic.createMany({
    data: allTopics.map((t) => ({
      id: t.id, subjectSlug: t.subjectSlug, order: t.order, title: t.title, description: t.description, keyPoints: t.keyPoints,
      lessonCount: t.lessonCount, durationMinutes: t.durationMinutes, createdAt: created,
    })),
    skipDuplicates: true,
  });
  await prisma.material.createMany({
    data: materials.map((m, i) => ({
      id: m.id, subjectSlug: m.subjectSlug, topicId: m.topicId ?? null, kind: m.kind, title: m.title, fileId: m.fileId ?? null,
      fileMime: m.fileMime ?? null, body: m.body ?? null, createdAt: new Date(new Date(m.createdAt).getTime() + i), // +i ms keeps the catalogue order stable
    })),
    skipDuplicates: true,
  });

  const difficultyById: Record<string, "easy" | "medium" | "hard"> = {
    "q-total-cost": "hard", "q-prime-cost": "medium", "q-period-cost": "hard", "q-overhead": "medium",
    "q-step-cost": "medium", "q-semi-variable": "medium", "q-direct-cost": "easy", "q-fixed-cost": "easy",
    "q-variable-behaviour": "easy", "q-cost-unit": "easy",
  };
  await prisma.question.createMany({
    data: [
      ...questionBank.map((q, i) => ({
        id: q.id, subjectSlug: "ma", text: q.text, options: q.options as Prisma.InputJsonValue, correctOptionId: q.correctOptionId,
        explanation: q.explanation, points: q.id === "q-total-cost" ? 2 : 1, difficulty: difficultyById[q.id] ?? "easy", tags: [], status: "published" as const, createdAt: new Date(created.getTime() + i),
      })),
      ...btQuestions.map((q, i) => ({
        id: q.id, subjectSlug: "bt", topicId: q.topicId, text: q.text, options: q.options as Prisma.InputJsonValue, correctOptionId: q.correctOptionId,
        explanation: q.explanation, points: 1, difficulty: q.difficulty, tags: q.tags, status: "published" as const, createdAt: new Date(created.getTime() + 100 + i),
      })),
    ],
    skipDuplicates: true,
  });
  for (const [i, t] of testRecords.entries()) {
    if (await prisma.test.findUnique({ where: { id: t.id } })) continue;
    await prisma.test.create({
      data: {
        id: t.id, subjectSlug: t.subjectSlug, topicId: t.topicId ?? null, title: t.title, durationMinutes: t.durationMinutes, passMark: t.passMark,
        published: true, publishedAt: created, createdAt: new Date(created.getTime() + i),
        questions: { create: t.questionIds.map((questionId, position) => ({ questionId, position })) },
      },
    });
  }
  await prisma.user.createMany({
    data: seedUsers.map((u) => ({
      id: u.id, name: u.name, email: u.email, role: u.role, status: u.status, locale: u.locale, passwordHash: u.passwordHash, createdAt: new Date(u.createdAt),
    })),
    skipDuplicates: true,
  });
  await prisma.enrollment.createMany({ data: [{ userId: DEMO_STUDENT_ID, platformSlug: "acca", status: "ACTIVE", source: "admin", createdAt: hoursAgo(900) }], skipDuplicates: true });

  const progress: [string, number, number][] = [
    ["ma-introduction-to-management-accounting", 100, 30], ["ma-cost-classification", 70, 2],
    ["bt-business-organisations-and-their-stakeholders", 100, 200], ["bt-business-environment", 100, 150],
    ["bt-organisational-structure-and-culture", 100, 100], ["bt-governance-ethics-and-sustainability", 40, 52],
    ["fa-the-context-and-purpose-of-financial-reporting", 100, 300], ["fa-double-entry-bookkeeping", 30, 80],
  ];
  await prisma.topicProgress.createMany({ data: progress.map(([topicId, percent, h]) => ({ userId: DEMO_STUDENT_ID, topicId, percent, updatedAt: hoursAgo(h) })), skipDuplicates: true });

  const bt = subjects.find((s) => s.slug === "bt")!;
  const certDate = new Date(Date.now() - 90 * day);
  await prisma.certificateCounter.upsert({ where: { year: certDate.getUTCFullYear() }, create: { year: certDate.getUTCFullYear(), last: 1 }, update: {} });
  await prisma.certificate.createMany({
    data: [{
      id: "cert-demo-bt", number: `AU-${certDate.getUTCFullYear()}-000001`, userId: DEMO_STUDENT_ID, platformSlug: "acca", subjectSlug: "bt",
      studentName: "Demo Student", subjectCode: bt.code, subjectName: bt.name, title: "ACCA BT — Business and Technology", source: "admin", issuedAt: certDate,
    }],
    skipDuplicates: true,
  });

  if ((await prisma.notification.count({ where: { userId: DEMO_STUDENT_ID } })) === 0) {
    await prisma.notification.createMany({
      data: notifications.map((n) => ({
        userId: DEMO_STUDENT_ID, code: n.code, params: n.params ?? undefined, target: n.target as unknown as Prisma.InputJsonValue,
        readAt: n.read ? new Date(n.createdAt) : null, createdAt: new Date(n.createdAt),
      })),
    });
    await prisma.activity.createMany({
      data: [
        { userId: DEMO_STUDENT_ID, kind: "topic", title: "Cost classification", context: "Management Accounting", href: "/topic/ma-cost-classification", at: hoursAgo(2), detail: "70%" },
        { userId: DEMO_STUDENT_ID, kind: "topic", title: "Introduction to management accounting", context: "Management Accounting", href: "/topic/ma-introduction-to-management-accounting", at: hoursAgo(30), detail: "100%" },
        { userId: DEMO_STUDENT_ID, kind: "topic", title: "Governance, ethics and sustainability", context: "Business and Technology", href: "/topic/bt-governance-ethics-and-sustainability", at: hoursAgo(52), detail: "40%" },
      ],
    });
  }

  // Demo payments (fictional, provider "demo") — real payments only ever come from the payment provider's webhook.
  const byName = new Map(seedUsers.map((u) => [u.name, u.id]));
  const status = { paid: "PAID", pending: "PENDING", refunded: "REFUNDED", failed: "FAILED", cancelled: "CANCELLED" } as const;
  for (const p of payments) {
    const userId = byName.get(p.studentName ?? "");
    if (!userId || (await prisma.payment.findUnique({ where: { id: p.id } }))) continue;
    await prisma.payment.create({
      data: {
        id: p.id, userId, platformSlug: p.description.startsWith("FIA") ? "fia" : "acca", description: p.description, amountCents: p.amountCents,
        status: status[p.status], provider: "demo", createdAt: new Date(p.createdAt), paidAt: p.status === "paid" ? new Date(p.createdAt) : null,
      },
    });
  }
  process.stdout.write("Seed complete (development / demo data).\n");
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
