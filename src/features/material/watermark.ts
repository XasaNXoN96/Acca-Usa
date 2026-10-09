import { publicName } from "@/services/domain/names";

/**
 * Personal watermark text for protected material: abbreviated name + a short, non-reversible-looking session tag + date.
 * Never the e-mail address. It identifies WHO viewed a leaked screenshot / recording; it does not prevent capture.
 */
export function watermarkText(user: { id: string; name: string }, now = new Date()): string {
  const tag = user.id.replace(/[^a-zA-Z0-9]/g, "").slice(-6).toUpperCase();
  return `${publicName(user.name)} · ${tag} · ${now.toISOString().slice(0, 10)}`;
}
