/** "Maria Lopez" → "Maria L." — other learners are never shown with a full surname (ranking, public verification). */
export function publicName(name: string): string {
  const parts = name.trim().split(/\s+/);
  return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1]![0]!.toUpperCase()}.` : parts[0] ?? "—";
}
