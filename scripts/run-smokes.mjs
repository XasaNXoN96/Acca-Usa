// Runs every smoke / audit script against a FRESH production server each (state, rate limits and demo data reset).
//   DATA_PROVIDER=prisma DATABASE_URL=… node scripts/run-smokes.mjs   runs the same suites against local PostgreSQL
//   npm run build && node scripts/run-smokes.mjs [name-filter]      CHROMIUM=/path/to/chrome (default: /opt/pw-browsers/chromium)
import { spawn, spawnSync } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

const PORT = process.env.SMOKE_PORT ?? "3100";
const BASE = `http://localhost:${PORT}`;
const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium";
const suites = ["smoke.mjs", "smoke-nav.mjs", "smoke-roles.mjs", "smoke-courses.mjs", "smoke-subject.mjs", "smoke-materials.mjs", "smoke-questionbank.mjs", "smoke-testbuilder.mjs", "smoke-testplayer.mjs", "smoke-results.mjs", "smoke-dashboard.mjs", "smoke-stats.mjs", "smoke-certificates.mjs", "smoke-ranking.mjs", "smoke-notifications.mjs", "smoke-payments.mjs", "smoke-journeys.mjs", "smoke-flow.mjs", "smoke-security.mjs", "smoke-i18n.mjs", "audit-a11y.mjs", "audit-responsive.mjs", "audit-responsive-flows.mjs"];
const filter = process.argv[2];
const todo = suites.filter((s) => !filter || s.includes(filter));

const up = async () => { try { await fetch(BASE, { signal: AbortSignal.timeout(1500) }); return true; } catch { return false; } };
/** A previous server that is still shutting down would silently serve stale state (users, rate limits) — wait for the port. */
async function waitForPortFree() {
  for (let i = 0; i < 60; i++) { if (!(await up())) return; await sleep(500); }
  throw new Error(`port ${PORT} is still in use — stop the other server first`);
}

async function withServer(fn) {
  await waitForPortFree();
  const server = spawn("npx", ["next", "start", "-p", PORT], { stdio: "ignore", detached: true });
  try {
    for (let i = 0; i < 60; i++) { try { if ((await fetch(BASE)).ok) break; } catch { /* not up yet */ } await sleep(500); }
    return await fn();
  } finally {
    try { process.kill(-server.pid, "SIGTERM"); } catch { /* already gone */ }
    for (let i = 0; i < 20 && (await up()); i++) await sleep(250);
    if (await up()) { try { process.kill(-server.pid, "SIGKILL"); } catch { /* already gone */ } await sleep(500); }
  }
}

/** With DATA_PROVIDER=prisma the database persists between servers, so reload the demo dataset before every suite. */
const usingDb = process.env.DATA_PROVIDER === "prisma";
function resetDb() {
  for (const script of ["prisma/reset-dev.ts", "prisma/seed.ts"]) {
    const r = spawnSync("npx", ["tsx", script], { stdio: "inherit", env: process.env });
    if (r.status !== 0) throw new Error(`${script} failed`);
  }
}

const results = [];
for (const s of todo) {
  const t0 = Date.now();
  if (usingDb) resetDb();
  const code = await withServer(() => spawnSync("node", [`scripts/${s}`], { stdio: "inherit", env: { ...process.env, BASE_URL: BASE, CHROMIUM } }).status);
  results.push([s, code === 0, Math.round((Date.now() - t0) / 1000)]);
}
console.log("\n=== smoke summary ===");
for (const [s, ok, secs] of results) console.log(`${ok ? "PASS" : "FAIL"}  ${s}  (${secs}s)`);
process.exit(results.every((r) => r[1]) ? 0 : 1);
