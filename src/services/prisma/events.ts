import "server-only";
import type { Prisma } from "@prisma/client";
import { getPrisma } from "@/lib/prisma";
import type { AppNotification, PlatformSlug } from "@/types";

type NewNotification = Omit<AppNotification, "id" | "createdAt" | "read">;
type Tx = Prisma.TransactionClient | ReturnType<typeof getPrisma>;

const row = (userId: string, n: NewNotification): Prisma.NotificationCreateManyInput => ({
  userId, code: n.code, params: n.params ?? undefined, target: n.target as unknown as Prisma.InputJsonValue,
});

export async function notifyUser(userId: string, n: NewNotification, tx: Tx = getPrisma()) {
  await tx.notification.create({ data: row(userId, n) });
}

/** Every active student enrolled (FREE / ACTIVE, not expired) in the platform. */
export async function notifyEnrolled(platform: PlatformSlug, n: NewNotification, tx: Tx = getPrisma()) {
  const users = await tx.user.findMany({
    where: {
      role: "STUDENT", status: "active", deletedAt: null,
      enrollments: { some: { platformSlug: platform, status: { in: ["FREE", "ACTIVE"] }, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] } },
    },
    select: { id: true },
  });
  if (users.length) await tx.notification.createMany({ data: users.map((u) => row(u.id, n)) });
}

export async function notifyAdmins(n: NewNotification, tx: Tx = getPrisma()) {
  const users = await tx.user.findMany({ where: { role: "ADMIN", status: "active", deletedAt: null }, select: { id: true } });
  if (users.length) await tx.notification.createMany({ data: users.map((u) => row(u.id, n)) });
}

export async function recordActivity(
  a: { userId: string; kind: "topic" | "test" | "enroll"; title: string; context: string; href: string; detail?: string },
  tx: Tx = getPrisma(),
) {
  await tx.activity.create({ data: { ...a, detail: a.detail ?? null } });
}
