/**
 * The garages, spelled the one way the app spells them.
 *
 * A booking sheet shouts them ("MERIVALE SPARE", "ST-LAURENT SPARE") and
 * OCR is not careful about hyphens, so an imported garage that is not put
 * back into this spelling arrives as a free-text "Other…" that no longer
 * matches the same garage typed by hand.
 */
export const GARAGES = [
  "Industrial",
  "Merivale",
  "Pinecrest",
  "St-Laurent",
  "Any Garage",
];

/** The garage a sheet meant, when it is one we know. */
export function canonicalGarage(raw: string): string {
  const key = raw.toLowerCase().replace(/[^a-z]/g, "");
  const hit = GARAGES.find((g) => g.toLowerCase().replace(/[^a-z]/g, "") === key);
  if (hit) return hit;
  if (key.startsWith("stlaurent") || key.startsWith("stlaurant")) return "St-Laurent";
  if (key.startsWith("anygarage")) return "Any Garage";
  return raw;
}
