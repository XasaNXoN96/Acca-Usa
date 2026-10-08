// Verifies EN / RU / UZ dictionaries have identical key sets and no empty values.
import { readFileSync } from "node:fs";

const locales = ["en", "ru", "uz"];
const dicts = Object.fromEntries(
  locales.map((l) => [l, JSON.parse(readFileSync(new URL(`../src/i18n/messages/${l}.json`, import.meta.url), "utf8"))]),
);

const flat = (obj, prefix = "") =>
  Object.entries(obj).flatMap(([k, v]) =>
    typeof v === "object" && v !== null ? flat(v, `${prefix}${k}.`) : [[`${prefix}${k}`, v]],
  );

const maps = Object.fromEntries(locales.map((l) => [l, new Map(flat(dicts[l]))]));
const base = maps.en;
let errors = 0;

for (const l of locales) {
  for (const key of base.keys()) {
    if (!maps[l].has(key)) { console.error(`[${l}] missing key: ${key}`); errors++; }
  }
  for (const [key, value] of maps[l]) {
    if (!base.has(key)) { console.error(`[${l}] extra key: ${key}`); errors++; }
    if (typeof value !== "string" || value.trim() === "") { console.error(`[${l}] empty value: ${key}`); errors++; }
    // ICU placeholder parity ({name}, {count} ...)
    const ph = (s) => [...String(s).matchAll(/\{(\w+)[,}]/g)].map((m) => m[1]).sort().join(",");
    if (base.has(key) && ph(base.get(key)) !== ph(value)) { console.error(`[${l}] placeholder mismatch: ${key}`); errors++; }
  }
}

if (errors) { console.error(`\ni18n check failed with ${errors} problem(s).`); process.exit(1); }
console.log(`i18n OK — ${base.size} keys × ${locales.length} locales.`);
