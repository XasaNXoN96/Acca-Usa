// Verifies every label the admin resource config needs exists in all locales (the admin tables build keys dynamically).
import { readFileSync } from "node:fs";
const src = readFileSync(new URL("../src/features/admin/resources.ts", import.meta.url), "utf8");
const cfgText = src.slice(src.indexOf("export const resourceConfig"));
const starts = [...cfgText.matchAll(/^\s{2}(?:"([a-z-]+)"|([a-z]+)): \{/gm)].map((m) => ({ name: m[1] ?? m[2], at: m.index }));
const resources = starts.map((x) => x.name);
const blockOf = (name) => { const i = starts.findIndex((x) => x.name === name); return cfgText.slice(starts[i].at, starts[i + 1]?.at ?? cfgText.length); };
let errors = 0;
for (const l of ["en", "ru", "uz"]) {
  const d = JSON.parse(readFileSync(new URL(`../src/i18n/messages/${l}.json`, import.meta.url), "utf8")).admin.resources;
  for (const r of resources) {
    const body = blockOf(r);
    const cols = (body.match(/columns: \[([^\]]*)\]/)?.[1] ?? "").match(/"([^"]+)"/g)?.map((s) => s.slice(1, -1)) ?? [];
    const fields = [...body.matchAll(/name: "([A-Za-z]+)"/g)].map((m) => m[1]);
    const filters = (body.match(/filters: \[([^\]]*)\]/)?.[1] ?? "").match(/"([^"]+)"/g)?.map((s) => s.slice(1, -1)) ?? [];
    const need = [["title"], ["description"], ...cols.map((c) => ["columns", c]), ...fields.map((f) => ["fields", f]), ...filters.map((f) => ["filters", f])];
    if (/canCreate: true/.test(body)) need.push(["add"]);
    for (const path of need) {
      const v = path.reduce((o, k) => o?.[k], d[r]);
      if (typeof v !== "string") { console.error(`[${l}] admin.resources.${r}.${path.join(".")} missing`); errors++; }
    }
  }
}
if (errors) { console.error(`admin i18n check failed (${errors})`); process.exit(1); }
console.log("admin i18n OK");
