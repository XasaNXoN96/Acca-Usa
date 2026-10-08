// Static i18n quality gate (complements check-i18n.mjs, which checks key parity):
//  • every message compiles as ICU MessageFormat in its own locale (no broken interpolation)
//  • EN has no Cyrillic; UZ (Latin script) has no Cyrillic; RU has Cyrillic
//  • RU / UZ values are not silently left in English (identical to EN) unless they are brand names, codes or numbers
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { IntlMessageFormat } = require("intl-messageformat");

const load = (l) => JSON.parse(readFileSync(new URL(`../src/i18n/messages/${l}.json`, import.meta.url), "utf8"));
const flat = (o, p = "") => Object.entries(o).flatMap(([k, v]) => (typeof v === "object" && v !== null ? flat(v, `${p}${k}.`) : [[`${p}${k}`, String(v)]]));
const en = new Map(flat(load("en")));
// Values that legitimately stay identical in every language (brand, abbreviations, units, formats).
// Official body names stay in English; "Progress" / "Material" are established Uzbek loanwords used consistently in the UZ UI.
const SAME_OK = /^(ACCA|FIA|USA|ACCA USA|EN|RU|UZ|PDF|MP3|MP4|ID|OK|Demo|Admin|Email|Online|Test|Video|Audio|BT|MA|FA|[A-D]|Progress|Material|%s \| ACCA USA|Association of Chartered Certified Accountants|Foundations in Accountancy|—|…|\d[\d\s%.:/·–-]*)$/i;
const hasLetters = (s) => /[A-Za-zА-Яа-я]/.test(s.replace(/\{[^}]*\}/g, ""));
let errors = 0;
const fail = (l, key, msg) => { console.error(`[${l}] ${key}: ${msg}`); errors++; };

for (const l of ["en", "ru", "uz"]) {
  for (const [key, value] of flat(load(l))) {
    try { new IntlMessageFormat(value, l); } catch (e) { fail(l, key, `invalid ICU message (${String(e.message).split("\n")[0]})`); }
    const cyr = /[Ѐ-ӿ]/.test(value);
    if (l === "en" && cyr) fail(l, key, "Cyrillic text in the English dictionary");
    if (l === "uz" && cyr) fail(l, key, "Cyrillic text in the Uzbek (Latin) dictionary");
    if (l === "ru" && hasLetters(value) && !cyr && !SAME_OK.test(value.trim())) fail(l, key, `no Cyrillic — left untranslated? "${value.slice(0, 60)}"`);
    if (l !== "en" && value === en.get(key) && hasLetters(value) && !SAME_OK.test(value.trim()) && value.replace(/\{[^}]*\}/g, "").trim().length > 3) fail(l, key, `identical to English: "${value.slice(0, 60)}"`);
  }
}
if (errors) { console.error(`\ni18n quality check failed (${errors}).`); process.exit(1); }
console.log("i18n quality OK");
