import type { Locale } from "@/types";

/** A legal text. `{operator}`, `{address}`, `{taxId}`, `{contact}`, `{location}`, `{law}`, `{refundDays}` are filled from the operator's configuration. */
export interface LegalDoc {
  title: string;
  intro: string;
  sections: { heading: string; body: string[] }[];
}
export type LegalDocs = Record<Locale, LegalDoc>;
