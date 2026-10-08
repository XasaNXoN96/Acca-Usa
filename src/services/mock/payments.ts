import "server-only";
import { randomUUID } from "node:crypto";
import type { PaymentService } from "../contracts";
import type { Payment, PlatformSlug } from "@/types";
import { APP_MODE } from "@/lib/app-mode";
import { absoluteUrl } from "../email";
import { getPaymentProvider } from "../payments";
import type { PaymentRec, PaymentStore } from "../payments/contracts";
import { applyProviderEvent, emailPaymentFailed, emailPaymentReceived } from "../payments/process";
import { getDb, nowIso, pushNotification } from "./db";

const toPayment = (p: PaymentRec, studentName?: string): Payment => ({
  id: p.id, description: p.description, amountCents: p.amountCents, currency: "USD",
  status: ({ PAID: "paid", PENDING: "pending", FAILED: "failed", CANCELLED: "cancelled", REFUNDED: "refunded" } as const)[p.status],
  createdAt: p.createdAt, studentName,
});

const store: PaymentStore = {
  async findById(id) { return getDb().payments.find((p) => p.id === id) ?? null; },
  async findByProviderRef(provider, ref) { return getDb().payments.find((p) => p.provider === provider && p.providerPaymentId === ref) ?? null; },
  async recordEvent(provider, eventId) {
    const db = getDb();
    if (db.paymentEvents.some((e) => e.provider === provider && e.eventId === eventId)) return false;
    db.paymentEvents.push({ provider, eventId });
    return true;
  },
  async forgetEvent(provider, eventId) {
    const db = getDb();
    db.paymentEvents = db.paymentEvents.filter((e) => !(e.provider === provider && e.eventId === eventId));
  },
  async update(id, patch) {
    const p = getDb().payments.find((x) => x.id === id);
    if (p) Object.assign(p, patch);
  },
  async grantAccess(userId, platform, paymentId) {
    const db = getDb();
    const rec = db.enrollments.find((e) => e.userId === userId && e.platform === platform);
    if (rec) Object.assign(rec, { status: "ACTIVE", source: "payment", paymentId, expiresAt: undefined });
    else db.enrollments.push({ userId, platform, status: "ACTIVE", source: "payment", paymentId, createdAt: nowIso() });
  },
  async revokeAccess(userId, platform, paymentId) {
    const rec = getDb().enrollments.find((e) => e.userId === userId && e.platform === platform && e.paymentId === paymentId);
    if (rec) rec.status = "REVOKED";
  },
  async userContact(userId) {
    const u = getDb().users.find((x) => x.id === userId);
    return u ? { name: u.name, email: u.email, locale: u.locale } : null;
  },
};

const notifier = {
  async paymentReceived(userId: string, p: PaymentRec) {
    pushNotification(getDb(), userId, { code: "payment_received", target: { kind: "payment" } });
    await emailPaymentReceived(store, p);
  },
  async paymentFailed(userId: string, p: PaymentRec) {
    pushNotification(getDb(), userId, { code: "payment_failed", target: { kind: "payment" } });
    await emailPaymentFailed(store, p);
  },
};

export const paymentService: PaymentService = {
  async listForUser(userId) {
    return getDb().payments.filter((p) => p.userId === userId).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((p) => toPayment(p));
  },
  async listAll() {
    const db = getDb();
    return [...db.payments].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((p) => toPayment(p, db.users.find((u) => u.id === p.userId)?.name));
  },
  async getForUser(userId, paymentId) {
    const p = getDb().payments.find((x) => x.id === paymentId && x.userId === userId);
    return p ? toPayment(p) : null;
  },
  async startCheckout({ userId, platform, idempotencyKey, origin }) {
    const db = getDb();
    const user = db.users.find((u) => u.id === userId && !u.deletedAt && u.status === "active");
    const plat = db.platforms.find((p) => p.slug === platform && !p.deletedAt);
    if (!user || !plat) return { ok: false, code: "NOT_FOUND" };
    if (plat.priceCents <= 0) return { ok: false, code: "NOT_PAID" }; // free platforms are enrolled directly
    const provider = getPaymentProvider();
    // A still-open checkout for the same platform is reused (double clicks, two tabs) — never two pending charges.
    const open = db.payments.find((p) => p.userId === userId && p.platform === platform && p.status === "PENDING" && p.checkoutUrl && Date.now() - Date.parse(p.createdAt) < 30 * 60_000);
    if (open?.checkoutUrl) return { ok: true, data: { paymentId: open.id, checkoutUrl: open.checkoutUrl.startsWith("/") ? `${origin}${open.checkoutUrl}` : open.checkoutUrl } };
    const existing = db.payments.find((p) => p.userId === userId && p.idempotencyKey === idempotencyKey);
    if (existing) {
      return existing.status === "PENDING" && existing.checkoutUrl
        ? { ok: true, data: { paymentId: existing.id, checkoutUrl: existing.checkoutUrl.startsWith("/") ? `${origin}${existing.checkoutUrl}` : existing.checkoutUrl } }
        : { ok: false, code: "ALREADY_PROCESSED" };
    }
    const rec: PaymentRec = {
      id: `pay-${randomUUID()}`, userId, platform: platform as PlatformSlug, description: `${plat.name} — full access`, amountCents: plat.priceCents,
      currency: "USD", status: "PENDING", provider: provider.name, idempotencyKey, createdAt: nowIso(),
    };
    db.payments.push(rec);
    const session = await provider.createCheckout({
      paymentId: rec.id, amountCents: rec.amountCents, currency: rec.currency, description: rec.description, customerEmail: user.email,
      successUrl: absoluteUrl(`/payments?paid=${rec.id}`), cancelUrl: absoluteUrl(`/payments?cancelled=${rec.id}`),
    });
    rec.providerPaymentId = session.providerPaymentId;
    rec.checkoutUrl = session.checkoutUrl;
    return { ok: true, data: { paymentId: rec.id, checkoutUrl: session.checkoutUrl.startsWith("/") ? `${origin}${session.checkoutUrl}` : session.checkoutUrl } };
  },
  async applyProviderEvent(provider, event) {
    return applyProviderEvent(store, provider, event, notifier);
  },
  async completeDemoCheckout({ userId, paymentId, outcome }) {
    if (APP_MODE !== "demo") return { ok: false, code: "DEMO_ONLY" };
    const p = getDb().payments.find((x) => x.id === paymentId && x.userId === userId && x.provider === "demo");
    if (!p) return { ok: false, code: "NOT_FOUND" };
    const result = await applyProviderEvent(store, "demo", { eventId: `demo-${randomUUID()}`, type: outcome, paymentId: p.id, providerPaymentId: p.providerPaymentId, amountCents: p.amountCents, currency: p.currency }, notifier);
    return result === "applied" ? { ok: true, data: undefined } : { ok: false, code: "ALREADY_PROCESSED" };
  },
};
