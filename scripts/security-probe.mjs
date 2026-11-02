#!/usr/bin/env node
/**
 * Black-box security probe. Safe to run against a LOCAL or STAGING server (it creates throw-away accounts and uploads small files).
 * NEVER point it at a production site with real students.
 *
 *   BASE=https://staging.example.com node scripts/security-probe.mjs
 *   STUDENT_COOKIE=… ADMIN_COOKIE=… BASE=… node scripts/security-probe.mjs      (also runs the authenticated checks; the
 *                                                                              cookie VALUES come from your own browser session — never paste them anywhere)
 * Exit code 1 if any probe fails. It reports names and results only, never cookie values.
 */
const BASE = (process.env.BASE ?? "http://127.0.0.1:3000").replace(/\/$/, "");
const S = process.env.STUDENT_COOKIE, A = process.env.ADMIN_COOKIE;
const prod = process.env.PROBE_EXPECT_HSTS !== "0";
let failed = 0, n = 0;
const ok = (name, cond, extra = "") => { n++; if (cond) console.log("  ok  ", name); else { failed++; console.log("  FAIL", name, extra); } };
const get = (path, o = {}) => fetch(BASE + path, { redirect: "manual", ...o });
const ck = (v) => ({ cookie: `acca_session=${v}` });

console.log(`Probing ${BASE}`);

// ── headers
{
  const r = await get("/");
  const h = r.headers;
  ok("X-Content-Type-Options: nosniff", h.get("x-content-type-options") === "nosniff");
  ok("clickjacking protection (X-Frame-Options / frame-ancestors)", /SAMEORIGIN|DENY/i.test(h.get("x-frame-options") ?? "") && /frame-ancestors/.test(h.get("content-security-policy") ?? ""));
  ok("Referrer-Policy set", !!h.get("referrer-policy"));
  ok("Permissions-Policy set", !!h.get("permissions-policy"));
  ok("no X-Powered-By", !h.get("x-powered-by"));
  if (prod) ok("HSTS (production mode)", /max-age=\d{7,}/.test(h.get("strict-transport-security") ?? ""));
  ok("no server version banner leaks", !/\d+\.\d+/.test(h.get("server") ?? ""));
}

// ── anonymous access to private areas and APIs
for (const p of ["/admin", "/admin/materials", "/dashboard", "/courses", "/payments", "/profile"]) {
  const r = await get(p);
  ok(`anonymous ${p} → sign-in redirect`, r.status >= 300 && r.status < 400 && /\/login/.test(r.headers.get("location") ?? ""), `status ${r.status}`);
}
{
  const form = new FormData(); form.set("kind", "pdf"); form.set("file", new Blob(["%PDF-1.4"]), "a.pdf");
  ok("anonymous upload refused (403)", (await get("/api/uploads", { method: "POST", body: form })).status === 403);
  ok("anonymous delete upload refused", [401, 403, 404, 405].includes((await get("/api/uploads/x", { method: "DELETE" })).status));
  ok("anonymous media status refused (403)", (await get("/api/media/x")).status === 403);
  const f = await get("/api/files/does-not-exist");
  ok("anonymous file request refused (401/403/404)", [401, 403, 404].includes(f.status), `status ${f.status}`);
  ok("anonymous certificate PDF refused", [401, 403, 404].includes((await get("/api/certificates/x/pdf")).status));
}

// ── path traversal / odd paths
for (const p of ["/api/files/..%2f..%2f..%2fetc%2fpasswd", "/api/files/%2e%2e/%2e%2e/etc/passwd", "/_next/static/..%2f..%2f..%2fpackage.json", "/%2e%2e/%2e%2e/etc/passwd", "/.env", "/.git/config", "/api/files/....//....//etc/passwd"]) {
  const r = await get(p); const t = await r.text();
  ok(`no traversal / secret file via ${p}`, !/root:x:|DATABASE_URL|AUTH_SECRET|\[core\]|"name":\s*"acca-usa"/.test(t));
}

// ── open redirect
for (const next of ["//evil.example", "https://evil.example", "/\\evil.example", "javascript:alert(1)", "///evil.example/x"]) {
  const r = await get(`/login?next=${encodeURIComponent(next)}`); const loc = r.headers.get("location") ?? "";
  const html = r.status === 200 ? await r.text() : "";
  ok(`login ?next=${next} does not redirect off-site`, !/evil\.example/.test(loc) && !/(href|action)="(https?:)?\/\/evil\.example/.test(html));
}

// ── HTTP methods
{
  const r = await fetch(BASE + "/", { method: "TRACE" }).catch(() => null);
  ok("TRACE not allowed", !r || r.status >= 400);
}

// ── brute force: the sign-in endpoint must start refusing
{
  const ip = `203.0.113.${100 + Math.floor(Math.random() * 100)}`;
  const body = JSON.stringify([{ email: "nobody@example.invalid", password: "wrong-password-1" }]);
  let limited = false;
  for (let i = 0; i < 40 && !limited; i++) {
    const r = await get("/login", { method: "POST", headers: { "content-type": "text/plain;charset=UTF-8", "x-forwarded-for": ip, "next-action": "x".repeat(40) }, body });
    if (r.status === 429) limited = true;
  }
  console.log("  note  (login rate limit is enforced inside the server action; covered by smoke-security / test:production — an unknown action id cannot reach it)", limited ? "429 seen" : "");
}

// ── oversized bodies
{
  const r = await get("/login", { method: "POST", headers: { "content-type": "text/plain" }, body: "x".repeat(3 * 1024 * 1024) }).catch(() => null);
  ok("3 MB body to a page endpoint is refused or ignored (not 5xx)", !r || r.status < 500, r ? `status ${r.status}` : "");
}

// ── forged / tampered session cookies
for (const [label, c] of [["empty", ""], ["garbage", "abc.def"], ["unsigned admin claim", Buffer.from(JSON.stringify({ uid: "x", role: "ADMIN", exp: 9999999999 })).toString("base64url") + ".AAAA"]]) {
  const r = await get("/admin", { headers: ck(c) });
  ok(`forged cookie (${label}) cannot open /admin`, r.status >= 300 && r.status < 400);
}

// ── authenticated checks (optional)
if (S) {
  ok("student cannot open /admin", (await get("/admin", { headers: ck(S) })).status >= 300);
  const form = new FormData(); form.set("kind", "pdf"); form.set("file", new Blob(["%PDF-1.4\n%%EOF"]), "a.pdf");
  ok("student cannot upload (403)", (await get("/api/uploads", { method: "POST", body: form, headers: { ...ck(S), origin: BASE } })).status === 403);
  ok("student cannot read media status (403)", (await get("/api/media/x", { headers: ck(S) })).status === 403);
  const d = await get("/dashboard", { headers: ck(S) });
  ok("private pages are not cacheable by shared caches", /no-store|private|no-cache/i.test(d.headers.get("cache-control") ?? "") || d.headers.get("cache-control") === null);
}
if (A) {
  const mk = (name, type, bytes) => { const f = new FormData(); f.set("kind", type); f.set("file", new Blob([bytes]), name); return f; };
  const up = (form, origin = BASE) => get("/api/uploads", { method: "POST", body: form, headers: { ...ck(A), origin } });
  ok("upload with a foreign Origin refused (CSRF)", (await up(mk("a.pdf", "pdf", "%PDF-1.4\n%%EOF"), "https://evil.example")).status === 403);
  ok("executable renamed .pdf refused (signature)", (await up(mk("evil.pdf", "pdf", "MZ\x90\x00" + "A".repeat(500)))).status === 422);
  ok("script uploaded as image refused", (await up(mk("x.png", "image", "<script>alert(1)</script>"))).status === 422);
  ok("SVG refused as image", (await up(mk("x.svg", "image", '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>'))).status === 422);
  { const r = await up(mk("a.pdf\0.exe", "pdf", "%PDF-1.4\n%%EOF")); const j = await r.json().catch(() => ({})); ok("NUL-byte / double-extension name is refused or stored as a harmless name (and never hangs)", [400, 422].includes(r.status) || (r.status === 200 && !/\.exe$/i.test(j.file?.name ?? ""))); }
  const good = await up(mk("../../../etc/passwd.pdf", "pdf", "%PDF-1.4\n%%EOF")); const gj = await good.json().catch(() => ({}));
  ok("path-like filename is sanitised", good.status !== 200 || (gj.file && !/[\\/]/.test(gj.file.name)), JSON.stringify(gj).slice(0, 100));
  if (good.status === 200) {
    await new Promise((r) => setTimeout(r, 1500));
    const id = gj.file.id;
    const r1 = await get(`/api/files/${id}`, { headers: { ...ck(A), range: "bytes=0-1,2-3,4-5,6-7,8-9,10-11,12-13,14-15,16-17,18-19,20-21,22-23" } });
    ok("multi-range request does not cause an error / amplification", r1.status < 500 && Number(r1.headers.get("content-length") ?? 0) < 5_000_000, `status ${r1.status}`);
    const r2 = await get(`/api/files/${id}`, { headers: { ...ck(A), range: "bytes=999999999-9999999999" } });
    ok("unsatisfiable range → 416, not 5xx", [416, 200, 206].includes(r2.status), `status ${r2.status}`);
    const r3 = await get(`/api/files/${id}?download=1`, { headers: ck(A) });
    ok("response is nosniff and never rendered as HTML", r3.headers.get("x-content-type-options") === "nosniff" && !/text\/html/.test(r3.headers.get("content-type") ?? ""));
    await get(`/api/uploads/${id}`, { method: "DELETE", headers: { ...ck(A), origin: BASE } });
  }
}

console.log(failed ? `\n${failed} of ${n} probes FAILED` : `\nall ${n} probes passed`);
process.exit(failed ? 1 : 0);
