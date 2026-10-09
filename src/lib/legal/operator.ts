/**
 * Who runs the service, for the legal pages. Read from the environment (never hard-coded in the repository, never invented).
 * Unset values render as a visible "not configured" marker instead of a made-up company.
 */
export interface LegalOperator {
  name?: string;
  address?: string;
  taxId?: string;
  contactEmail?: string;
  dataLocation?: string;
  governingLaw?: string;
  refundWindow?: string;
  /** the operator attests that qualified counsel reviewed the texts for their jurisdiction */
  reviewed: boolean;
}

const v = (k: string) => process.env[k]?.trim() || undefined;

export const legalOperator = (): LegalOperator => ({
  name: v("LEGAL_OPERATOR_NAME"), address: v("LEGAL_OPERATOR_ADDRESS"), taxId: v("LEGAL_OPERATOR_TAX_ID"),
  contactEmail: v("LEGAL_CONTACT_EMAIL"), dataLocation: v("LEGAL_DATA_LOCATION"), governingLaw: v("LEGAL_GOVERNING_LAW"), refundWindow: v("LEGAL_REFUND_WINDOW"), reviewed: process.env.LEGAL_TEXTS_REVIEWED === "1",
});
