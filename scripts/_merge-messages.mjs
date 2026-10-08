// dev helper: node scripts/_merge-messages.mjs <fragmentDir>  — deep-merges fragments into src/i18n/messages
import { readFileSync, writeFileSync } from "node:fs";
const dir = process.argv[2];
const merge = (a, b) => { for (const [k, v] of Object.entries(b)) a[k] = v && typeof v === "object" && a[k] && typeof a[k] === "object" ? merge(a[k], v) : v; return a; };
for (const l of ["en", "ru", "uz"]) {
  const p = new URL(`../src/i18n/messages/${l}.json`, import.meta.url);
  const base = JSON.parse(readFileSync(p, "utf8"));
  const frag = JSON.parse(readFileSync(`${dir}/${l}.json`, "utf8"));
  writeFileSync(p, JSON.stringify(merge(base, frag), null, 2) + "\n");
}
console.log("merged");
