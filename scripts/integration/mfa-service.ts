/** MfaService rules on the active provider (DATA_PROVIDER=memory | prisma).   npm run test:mfa */
import assert from "node:assert/strict";
import { services } from "../../src/services";
import { hotp, base32Decode, stepOf } from "../../src/lib/auth/totp";

const codeAt = (secret: string, offset = 0) => hotp(base32Decode(secret), stepOf(Date.now()) + offset);

async function main() {
  const email = `mfa.${Date.now()}@example.com`;
  const made = await services.users.create({ name: "Mfa Admin", email, role: "ADMIN", status: "active", password: "Mfa-admin-pass12" });
  assert.ok(made.ok); const id = made.data.id;

  assert.deepEqual(await services.mfa.status(id), { enabled: false, recoveryCodesLeft: 0 });
  assert.deepEqual(await services.mfa.verifyLogin(id, "123456"), { ok: false }, "no MFA enrolled → nothing verifies");

  const b1 = await services.mfa.beginEnrollment(id); assert.ok(b1.ok);
  const b2 = await services.mfa.beginEnrollment(id); assert.ok(b2.ok && b2.data.secret === b1.data.secret, "pending secret is stable");
  assert.deepEqual(await services.mfa.verifyLogin(id, codeAt(b1.data.secret)), { ok: false }, "an unconfirmed enrolment does not protect or unlock anything");
  const wrong = await services.mfa.confirmEnrollment(id, codeAt(b1.data.secret) === "000000" ? "111111" : "000000"); assert.ok(!wrong.ok && wrong.code === "INVALID_CODE");
  assert.equal((await services.mfa.status(id)).enabled, false, "wrong code must not enable MFA");

  const before = await services.auth.verifyCredentials(email, "Mfa-admin-pass12"); assert.ok("user" in before);
  const ok = await services.mfa.confirmEnrollment(id, codeAt(b1.data.secret)); assert.ok(ok.ok);
  assert.equal(ok.data.recoveryCodes.length, 10);
  assert.equal(ok.data.tokenVersion, before.tokenVersion + 1, "enrolment revokes older sessions");
  assert.equal(await services.auth.getSessionUser(id, before.tokenVersion), null, "pre-enrolment session is dead");
  assert.deepEqual(await services.mfa.status(id), { enabled: true, recoveryCodesLeft: 10 });
  const again = await services.mfa.beginEnrollment(id); assert.ok(!again.ok && again.code === "ALREADY_ENABLED", "cannot re-enrol over an active factor");

  // the enrolment consumed the current step → same code is a replay, the next step is fine, older steps are not
  assert.deepEqual(await services.mfa.verifyLogin(id, codeAt(b1.data.secret)), { ok: false }, "replay of the enrolment code");
  const next = codeAt(b1.data.secret, 1);
  assert.deepEqual(await services.mfa.verifyLogin(id, next), { ok: true, method: "totp" });
  assert.deepEqual(await services.mfa.verifyLogin(id, next), { ok: false }, "replay of a used code");
  assert.deepEqual(await services.mfa.verifyLogin(id, codeAt(b1.data.secret, -1)), { ok: false }, "an older step cannot be used after a newer one");
  assert.deepEqual(await services.mfa.verifyLogin(id, "abcdef"), { ok: false }); assert.deepEqual(await services.mfa.verifyLogin(id, ""), { ok: false });

  // concurrent use of ONE valid code: exactly one wins
  const id2 = (await services.users.create({ name: "Mfa Two", email: `mfa2.${Date.now()}@example.com`, role: "ADMIN", status: "active", password: "Mfa-admin-pass12" }) as { ok: true; data: { id: string } }).data.id;
  const s2 = (await services.mfa.beginEnrollment(id2)) as { ok: true; data: { secret: string } }; await services.mfa.confirmEnrollment(id2, codeAt(s2.data.secret));
  const racing = codeAt(s2.data.secret, 1);
  const wins = (await Promise.all(Array.from({ length: 8 }, () => services.mfa.verifyLogin(id2, racing)))).filter((r) => r.ok).length;
  assert.equal(wins, 1, `a single TOTP code must verify exactly once under concurrency (won ${wins})`);

  // recovery codes: single use, case/format tolerant, concurrent-safe, one account's code never works for another
  const [r0, r1] = ok.data.recoveryCodes as [string, string];
  assert.deepEqual(await services.mfa.verifyLogin(id, r0.toLowerCase().replace("-", " ")), { ok: true, method: "recovery" });
  assert.deepEqual(await services.mfa.verifyLogin(id, r0), { ok: false }, "recovery code reuse");
  assert.deepEqual(await services.mfa.verifyLogin(id2, r1), { ok: false }, "another account's recovery code");
  const racers = (await Promise.all(Array.from({ length: 8 }, () => services.mfa.verifyLogin(id, r1)))).filter((r) => r.ok).length; assert.equal(racers, 1, "recovery code must be single-use under concurrency");
  assert.equal((await services.mfa.status(id)).recoveryCodesLeft, 8);

  // reset: factor removed, sessions revoked, old codes useless
  const tv = (await services.auth.verifyCredentials(email, "Mfa-admin-pass12")) as { tokenVersion: number };
  assert.ok((await services.mfa.reset(id)).ok);
  assert.deepEqual(await services.mfa.status(id), { enabled: false, recoveryCodesLeft: 0 });
  assert.equal(await services.auth.getSessionUser(id, tv.tokenVersion), null, "reset revokes sessions");
  assert.deepEqual(await services.mfa.verifyLogin(id, codeAt(b1.data.secret, 1)), { ok: false });
  assert.ok(!(await services.mfa.reset("does-not-exist")).ok);
  console.log(`mfa-service (${process.env.DATA_PROVIDER ?? "memory"}): all checks passed`);
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
