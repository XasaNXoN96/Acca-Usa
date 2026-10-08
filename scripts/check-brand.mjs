// Fails the build if legacy / third-party brand names leak into the product.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, extname } from "node:path";

// Built from fragments so this file does not contain the banned words itself.
const banned = [["ICT", "ERA"], ["Exam", "iner"], ["Экзамен", "атор"], ["Open", "Tuition"]].map((p) => p.join(""));
const re = new RegExp(banned.join("|"), "i");
// Removed from the product for good: the Teacher role and the CIMA qualification (only ADMIN and STUDENT exist; ACCA and FIA are the platforms).
const removed = new RegExp(["\\bteach", "ers?\\b|\\bCI", "MA\\b"].join(""), "i");
const removedRoots = new Set(["src", "docs", "prisma", "public", "README.md", "package.json", ".env.example"]);

const roots = ["src", "docs", "prisma", "public", "scripts", "README.md", "PROJECT_RULES.md", "package.json", ".env.example"];
const exts = new Set([".ts", ".tsx", ".js", ".mjs", ".json", ".md", ".css", ".prisma", ".svg", ".txt", ".example", ""]);
let hits = 0;

function scan(path, root = path) {
  let st;
  try { st = statSync(path); } catch { return; }
  if (st.isDirectory()) { for (const f of readdirSync(path)) scan(join(path, f), root); return; }
  if (!exts.has(extname(path))) return;
  const lines = readFileSync(path, "utf8").split("\n");
  lines.forEach((line, i) => {
    if (re.test(line)) { console.error(`${path}:${i + 1}: forbidden brand reference`); hits++; }
    if (removedRoots.has(root) && removed.test(line)) { console.error(`${path}:${i + 1}: removed role / qualification (Teacher, CIMA) must not return`); hits++; }
  });
}

roots.forEach((r) => scan(r));
if (hits) { console.error(`\nbrand check failed (${hits}).`); process.exit(1); }
console.log("brand check OK");
