import "server-only";
import { randomUUID } from "node:crypto";
import type { Payment as DbPayment, Prisma, User as DbUser } from "@prisma/client";
import type { PaymentService } from "../contracts";
import type { Payment, PlatformSlug } from "@/types";
import { APP_MODE } from "@/lib/app-mode";
import { getPrisma } from "@/lib/prisma";
import { absoluteUrl } from "../email";
import { getPaymentProvider } from "../payments";
import type { PaymentRec, PaymentStore } from "../payments/contracts";
import { applyProviderEvent, emailPaymentFailed, emailPaymentReceived } from "../payments/process";
import { notifyUser } from "./events";

const status = { PAID: "paid", PENDING: "pending", FAILED: "failed", CANCELLED: "cancelled", REFUNDED: "refunded" } as const;
const toPayment = (p: DbPayment & { user?: Pick<DbUser, "name"> }): Payment => ({
  id: p.id, description: p.description, amountCents: p.amountCents, currency: "USD", status: status[p.status],
  createdAt: p.createdAt.toISOString(), studentName: p.user?.name, platform: p.platformSlug as PlatformSlug, provider: p.provider,
});
const toRec = (p: DbPayment): PaymentRec => ({
  id: p.id, userId: p.userId, platform: p.platformSlug as PlatformSlug, description: p.description, amountCents: p.amountCents, currency: p.currency,
  status: p.status, provider: p.provider, providerPaymentId: p.providerPaymentId ?? undefined, checkoutUrl: p.checkoutUrl ?? undefined, idempotencyKey: p.idempotencyKey ?? undefined,
  paidAt: p.paidAt?.toISOString(), createdAt: p.createdAt.toISOString(),
});
const isUniqueViolation = (e: unknown) => typeof e === "object" && e !== null && (e as { code?: string }).code === "P2002";

const store: PaymentStore = {
  async findById(id) {
    const p = await getPrisma().payment.findUnique({ where: { id } });
    return p ? toRec(p) : null;
  },
  async findByProviderRef(provider, ref) {
    const p = await getPrisma().payment.findUnique({ where: { provider_providerPaymentId: { provider, providerPaymentId: ref } } });
    return p ? toRec(p) : null;
  },
  async recordEvent(provider, eventId, paymentId, type) {
    try {
      await getPrisma().paymentEvent.create({ data: { provider, eventId, paymentId, type } });
      return true;
    } catch (e) {
      if (isUniqueViolation(e)) return false; // already applied — webhook retries / replays end here
      throw e;
    }
  },
  async forgetEvent(provider, eventId) {
    await getPrisma().paymentEvent.deleteMany({ where: { provider, eventId } });
  },
  async update(id, patch) {
    const data: Prisma.PaymentUpdateInput = {};
    if (patch.status) data.status = patch.status;
    if (patch.paidAt) data.paidAt = new Date(patch.paidAt);
    if (patch.providerPaymentId) data.providerPaymentId = patch.providerPaymentId;
    await getPrisma().payment.update({ where: { id }, data });
  },
  async grantAccess(userId, platform, paymentId) {
    await getPrisma().enrollment.upsert({
      where: { userId_platformSlug: { userId, platformSlug: platform } },
      create: { userId, platformSlug: platform, status: "ACTIVE", source: "payment", paymentId },
      update: { status: "ACTIVE", source: "payment", paymentId, expiresAt: null },
    });
  },
  async revokeAccess(userId, platform, paymentId) {
    await getPrisma().enrollment.updateMany({ where: { userId, platformSlug: platform, paymentId }, data: { status: "REVOKED" } });
  },
  async userContact(userId) {
    const u = await getPrisma().user.findUnique({ where: { id: userId }, select: { name: true, email: true, locale: true } });
    return u ?? null;
  },
};

const notifier = {
  async paymentReceived(userId: string, p: PaymentRec) {
    await notifyUser(userId, { code: "payment_received", target: { kind: "payment" } });
    await emailPaymentReceived(store, p);
  },
  async paymentFailed(userId: string, p: PaymentRec) {
    await notifyUser(userId, { code: "payment_failed", target: { kind: "payment" } });
    await emailPaymentFailed(store, p);
  },
};

export const paymentService: PaymentService = {
  async listForUser(userId) {
    return (await getPrisma().payment.findMany({ where: { userId }, orderBy: { createdAt: "desc" } })).map((p) => toPayment(p));
  },
  async listAll() {
    return (await getPrisma().payment.findMany({ orderBy: { createdAt: "desc" }, include: { user: { select: { name: true } } } })).map(toPayment);
  },
  async getForUser(userId, paymentId) {
    // userId is part of the query: another learner's payment is simply "not found".
    const p = await getPrisma().payment.findFirst({ where: { id: paymentId, userId } });
    return p ? toPayment(p) : null;
  },
  async startCheckout({ userId, platform, idempotencyKey, origin }) {
    const prisma = getPrisma();
    const [user, plat] = await Promise.all([
      prisma.user.findFirst({ where: { id: userId, deletedAt: null, status: "active" } }),
      prisma.platform.findFirst({ where: { slug: platform, deletedAt: null } }),
    ]);
    if (!user || !plat) return { ok: false, code: "NOT_FOUND" };
    if (plat.priceCents <= 0) return { ok: false, code: "NOT_PAID" };
    const provider = getPaymentProvider();
    const resolveUrl = (path: string) => (path.startsWith("/") ? `${origin}${path}` : path);

    // A still-open checkout for the same platform is reused (double clicks, two tabs) — never two pending charges.
    const open = await prisma.payment.findFirst({ where: { userId, platformSlug: platform, status: "PENDING", checkoutUrl: { not: null }, createdAt: { gt: new Date(Date.now() - 30 * 60_000) } }, orderBy: { createdAt: "desc" } });
    if (open?.checkoutUrl) return { ok: true, data: { paymentId: open.id, checkoutUrl: resolveUrl(open.checkoutUrl) } };

    const existing = await prisma.payment.findUnique({ where: { userId_idempotencyKey: { userId, idempotencyKey } } });
    if (existing) {
      // A retry of the same request: hand back the same pending checkout instead of creating a second charge.
      if (existing.status !== "PENDING" || !existing.checkoutUrl) return { ok: false, code: "ALREADY_PROCESSED" };
      return { ok: true, data: { paymentId: existing.id, checkoutUrl: resolveUrl(existing.checkoutUrl) } };
    }
    let created: DbPayment;
    try {
      created = await prisma.payment.create({
        data: {
          id: `pay-${randomUUID()}`, userId, platformSlug: platform, description: `${plat.name} — full access`, amountCents: plat.priceCents,
          currency: "USD", status: "PENDING", provider: provider.name, idempotencyKey,
        },
      });
    } catch (e) {
      if (isUniqueViolation(e)) return { ok: false, code: "ALREADY_PROCESSED" };
      throw e;
    }
    try {
      const session = await provider.createCheckout({
        paymentId: created.id, amountCents: created.amountCents, currency: created.currency, description: created.description, customerEmail: user.email,
        successUrl: absoluteUrl(`/payments?paid=${created.id}`), cancelUrl: absoluteUrl(`/payments?cancelled=${created.id}`),
      });
      await prisma.payment.update({ where: { id: created.id }, data: { providerPaymentId: session.providerPaymentId, checkoutUrl: session.checkoutUrl } });
      return { ok: true, data: { paymentId: created.id, checkoutUrl: resolveUrl(session.checkoutUrl) } };
    } catch {
      await prisma.payment.update({ where: { id: created.id }, data: { status: "FAILED" } }); // provider unreachable: nothing was charged
      return { ok: false, code: "PROVIDER_ERROR" };
    }
  },
  async applyProviderEvent(provider, event) {
    return applyProviderEvent(store, provider, event, notifier);
  },
  async completeDemoCheckout({ userId, paymentId, outcome }) {
    if (APP_MODE !== "demo") return { ok: false, code: "DEMO_ONLY" };
    const p = await getPrisma().payment.findFirst({ where: { id: paymentId, userId, provider: "demo" } });
    if (!p) return { ok: false, code: "NOT_FOUND" };
    const result = await applyProviderEvent(
      store, "demo",
      { eventId: `demo-${randomUUID()}`, type: outcome, paymentId: p.id, providerPaymentId: p.providerPaymentId ?? undefined, amountCents: p.amountCents, currency: p.currency },
      notifier,
    );
    return result === "applied" ? { ok: true, data: undefined } : { ok: false, code: "ALREADY_PROCESSED" };
  },
};
