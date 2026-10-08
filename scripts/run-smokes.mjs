// Runs every smoke / audit script against a FRESH production server each (state, rate limits and demo data reset).
//   npm run build && node scripts/run-smokes.mjs [name-filter]      CHROMIUM=/path/to/chrome (default: /opt/pw-browsers/chromium)
import { spawn, spawnSync } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

const PORT = process.env.SMOKE_PORT ?? "3100";
const BASE = `http://localhost:${PORT}`;
const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium";
const suites = ["smoke.mjs", "smoke-nav.mjs", "smoke-roles.mjs", "smoke-courses.mjs", "smoke-subject.mjs", "smoke-materials.mjs", "smoke-questionbank.mjs", "smoke-testbuilder.mjs", "smoke-testplayer.mjs", "smoke-results.mjs", "smoke-dashboard.mjs", "smoke-stats.mjs", "smoke-certificates.mjs", "smoke-ranking.mjs", "smoke-notifications.mjs", "smoke-flow.mjs", "audit-responsive.mjs", "audit-responsive-flows.mjs"];
const filter = process.argv[2];
const todo = suites.filter((s) => !filter || s.includes(filter));

async function withServer(fn) {
  const server = spawn("npx", ["next", "start", "-p", PORT], { stdio: "ignore", detached: true });
  try {
    for (let i = 0; i < 60; i++) { try { if ((await fetch(BASE)).ok) break; } catch { /* not up yet */ } await sleep(500); }
    return await fn();
  } finally {
    try { process.kill(-server.pid, "SIGTERM"); } catch { /* already gone */ }
    await sleep(800);
  }
}

const results = [];
for (const s of todo) {
  const t0 = Date.now();
  const code = await withServer(() => spawnSync("node", [`scripts/${s}`], { stdio: "inherit", env: { ...process.env, BASE_URL: BASE, CHROMIUM } }).status);
  results.push([s, code === 0, Math.round((Date.now() - t0) / 1000)]);
}
console.log("\n=== smoke summary ===");
for (const [s, ok, secs] of results) console.log(`${ok ? "PASS" : "FAIL"}  ${s}  (${secs}s)`);
process.exit(results.every((r) => r[1]) ? 0 : 1);
