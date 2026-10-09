/**
 * Consent rules (pure — shared by every data provider, the session layer and the tests).
 * Documents are versioned: publishing new text means bumping the version here, which asks every account to accept again at the
 * next sign-in. The history of what was accepted, when and in which language is kept (append-only); the latest record per kind wins.
 */
export const CONSENT_KINDS = ["terms", "privacy", "marketing"] as const;
export type ConsentKind = (typeof CONSENT_KINDS)[number];

/** Current text versions (date of the text in force). Bump together with the text in src/content/legal. */
export const LEGAL_VERSIONS = { terms: "2026-10-12", privacy: "2026-10-12", marketing: "2026-10-12" } as const satisfies Record<ConsentKind, string>;

/** Needed to use the service at all. Marketing is optional and never pre-ticked. */
export const REQUIRED_CONSENTS = ["terms", "privacy"] as const satisfies readonly ConsentKind[];

export interface ConsentState { version: string; granted: boolean; at: string }
export type ConsentSnapshot = Partial<Record<ConsentKind, ConsentState>>;

export interface ConsentEntry { kind: ConsentKind; granted: boolean }

/** Required consents that are missing, withdrawn or given for an older text. */
export function missingConsents(current: ConsentSnapshot): ConsentKind[] {
  return REQUIRED_CONSENTS.filter((k) => !(current[k]?.granted && current[k]?.version === LEGAL_VERSIONS[k]));
}

export const isConsentKind = (v: unknown): v is ConsentKind => typeof v === "string" && (CONSENT_KINDS as readonly string[]).includes(v);

/** Latest record per kind from a history (any order). */
export function snapshotOf(history: readonly { kind: string; version: string; granted: boolean; at: string }[]): ConsentSnapshot {
  const out: ConsentSnapshot = {};
  for (const h of [...history].sort((a, b) => a.at.localeCompare(b.at))) if (isConsentKind(h.kind)) out[h.kind] = { version: h.version, granted: h.granted, at: h.at };
  return out;
}
