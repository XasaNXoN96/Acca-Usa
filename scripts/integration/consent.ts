/** Consent rules + service on the active provider (DATA_PROVIDER=memory | prisma); content integrity of the legal texts.   npm run test:legal */
import assert from "node:assert/strict";
import { CONSENT_KINDS, LEGAL_VERSIONS, missingConsents, REQUIRED_CONSENTS, snapshotOf } from "../../src/lib/legal/consent";
import { terms } from "../../src/content/legal/terms";
import { privacy } from "../../src/content/legal/privacy";
import { refunds } from "../../src/content/legal/refunds";
import { cookies } from "../../src/content/legal/cookies";
import { services } from "../../src/services";

async function main() {
  // ── pure rules
  const v = LEGAL_VERSIONS; const at = "2026-10-12T10:00:00.000Z";
  assert.deepEqual(missingConsents({}), ["terms", "privacy"], "nothing accepted → both required kinds missing");
  assert.deepEqual(missingConsents({ terms: { version: v.terms, granted: true, at }, privacy: { version: v.privacy, granted: true, at } }), []);
  assert.deepEqual(missingConsents({ terms: { version: "2020-01-01", granted: true, at }, privacy: { version: v.privacy, granted: true, at } }), ["terms"], "an older text must be accepted again");
  assert.deepEqual(missingConsents({ terms: { version: v.terms, granted: true, at }, privacy: { version: v.privacy, granted: false, at } }), ["privacy"], "withdrawn consent counts as missing");
  assert.deepEqual(missingConsents({ terms: { version: v.terms, granted: true, at }, privacy: { version: v.privacy, granted: true, at } }), [], "marketing is optional");
  assert.deepEqual([...REQUIRED_CONSENTS], ["terms", "privacy"]); assert.ok(!(REQUIRED_CONSENTS as readonly string[]).includes("marketing"));
  const snap = snapshotOf([{ kind: "marketing", version: "x", granted: true, at: "2026-01-01T00:00:00Z" }, { kind: "marketing", version: "x", granted: false, at: "2026-02-01T00:00:00Z" }, { kind: "bogus", version: "x", granted: true, at: "2026-03-01T00:00:00Z" }]);
  assert.equal(snap.marketing?.granted, false, "latest decision wins"); assert.ok(!("bogus" in snap), "unknown kinds are ignored");

  // ── legal texts: same structure in every language, no leftover template junk, only known placeholders
  const known = new Set(["operator", "address", "taxId", "contact", "location", "law", "refundDays"]);
  for (const [name, docs] of Object.entries({ terms, privacy, refunds, cookies })) {
    const en = docs.en;
    for (const loc of ["en", "ru", "uz"] as const) {
      const d = docs[loc];
      assert.equal(d.sections.length, en.sections.length, `${name}.${loc}: section count differs from English`);
      d.sections.forEach((s, i) => assert.equal(s.body.length, en.sections[i]!.body.length, `${name}.${loc} section ${i + 1}: paragraph count differs`));
      const text = JSON.stringify(d);
      assert.ok(!/TODO|FIXME|lorem|xxx/i.test(text), `${name}.${loc}: unfinished text`);
      assert.ok(!new RegExp(["CI", "MA|ICT", "ERA"].join(""), "i").test(text), `${name}.${loc}: forbidden brand`);
      for (const m of text.matchAll(/\{(\w+)\}/g)) assert.ok(known.has(m[1]!), `${name}.${loc}: unknown placeholder {${m[1]}}`);
      assert.ok(d.title.length > 3 && d.intro.length > 40);
    }
    assert.notEqual(docs.ru.title, en.title); assert.notEqual(docs.uz.title, en.title);
  }

  // ── service on the active provider
  const email = `consent.${Date.now()}@example.com`;
  const made = await services.users.create({ name: "Consent Probe", email, role: "STUDENT", status: "active", password: "Consent-pass-123" });
  assert.ok(made.ok); const id = made.data.id;
  assert.deepEqual(await services.consent.current(id), {}, "a new account (e.g. created by an administrator) has accepted nothing");
  assert.deepEqual(missingConsents(await services.consent.current(id)), ["terms", "privacy"]);
  await services.consent.record(id, [{ kind: "terms", granted: true }, { kind: "privacy", granted: true }], { locale: "uz", source: "register" });
  const cur = await services.consent.current(id);
  assert.equal(cur.terms?.version, LEGAL_VERSIONS.terms); assert.equal(cur.privacy?.granted, true); assert.deepEqual(missingConsents(cur), []);
  assert.equal(cur.marketing, undefined, "marketing is never implied by the required consents");
  await services.consent.record(id, [{ kind: "marketing", granted: true }], { locale: "uz", source: "settings" });
  await new Promise((r) => setTimeout(r, 15));
  await services.consent.record(id, [{ kind: "marketing", granted: false }], { locale: "ru", source: "settings" });
  assert.equal((await services.consent.current(id)).marketing?.granted, false, "withdrawal is the latest decision");
  const hist = await services.consent.history(id);
  assert.equal(hist.length, 4, "every decision is kept"); assert.deepEqual(hist.map((h) => h.kind).sort(), ["marketing", "marketing", "privacy", "terms"]);
  assert.ok(hist.every((h) => h.version === LEGAL_VERSIONS[h.kind as keyof typeof LEGAL_VERSIONS] && ["uz", "ru"].includes(h.locale)));
  assert.equal(hist[0]!.granted, false, "history is newest first");
  assert.deepEqual(await services.consent.current("does-not-exist"), {});
  for (const m of Object.keys(services.consent)) assert.ok(["current", "record", "history"].includes(m), `consent service exposes ${m}`);
  assert.ok(CONSENT_KINDS.length === 3);
  console.log(`legal (${process.env.DATA_PROVIDER ?? "memory"}): all checks passed`);
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
