/** Rules of `admin:create` + "registration can never create staff" at the service level (both providers).   npm run test:admin */
import assert from "node:assert/strict";
import { decideAdminBootstrap, passwordProblem } from "../../src/lib/admin-bootstrap";
import { services } from "../../src/services";

const d = decideAdminBootstrap;
assert.deepEqual(d({ existing: null, adminCount: 0 }), { action: "create" }, "first admin");
assert.deepEqual(d({ existing: null, adminCount: 2 }), { action: "refuse", reason: "ADMIN_EXISTS" }, "no silent second admin");
assert.deepEqual(d({ existing: null, adminCount: 2, allowAdditional: true }), { action: "create" });
assert.deepEqual(d({ existing: { role: "ADMIN" }, adminCount: 1 }), { action: "reset" }, "operator password reset");
assert.deepEqual(d({ existing: { role: "STUDENT" }, adminCount: 0 }), { action: "refuse", reason: "STUDENT_ACCOUNT" }, "no silent promotion");
assert.deepEqual(d({ existing: { role: "STUDENT" }, adminCount: 3, promoteExisting: true }), { action: "refuse", reason: "ADMIN_EXISTS" }, "promotion of a student ALSO needs the additional-admin flag");
assert.deepEqual(d({ existing: { role: "STUDENT" }, adminCount: 3, promoteExisting: true, allowAdditional: true }), { action: "promote" });
assert.deepEqual(d({ existing: { role: "STUDENT" }, adminCount: 0, promoteExisting: true }), { action: "promote" }, "no admin yet: an explicit promotion is the first admin");
assert.equal(passwordProblem("short1"), "at least 12 characters"); assert.equal(passwordProblem("onlyletterslonger"), "letters and digits"); assert.equal(passwordProblem("Longenough-pass12"), null);

async function main() {
  // registration can never produce an administrator, whatever extra fields arrive
  const email = `role.${Date.now()}@example.com`;
  const r = await services.auth.register({ name: "Role Probe", email, password: "Probe-pass12345", locale: "en", role: "ADMIN", status: "active" } as never);
  assert.ok(r.ok, "registration works"); assert.equal(r.data.role, "STUDENT", "role injected through registration input was honoured");
  const login = await services.auth.verifyCredentials(email, "Probe-pass12345"); assert.ok("user" in login && login.user.role === "STUDENT");
  console.log("admin-bootstrap: all checks passed");
}
main().catch((e) => { console.error(e); process.exit(1); });
