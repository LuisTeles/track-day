import type { Corner } from "@track-day/schema";

const ELEVATION: Record<NonNullable<Corner["elevation"]>, string | null> = {
  uphill: "Uphill",
  downhill: "Downhill",
  flat: null,
  crest: "Crest",
  compression: "Compression",
};
const CAMBER: Record<NonNullable<Corner["camber"]>, string | null> = {
  "off-camber": "Off-camber",
  flat: null,
  positive: "Banked",
};

/** Short elevation/camber words for a corner; flat or unset shows nothing. */
export function terrainOf(
  corner: Pick<Corner, "elevation" | "camber">,
): { text: string; description: string } | null {
  const words = [
    corner.elevation && ELEVATION[corner.elevation],
    corner.camber && CAMBER[corner.camber],
  ].filter((w): w is string => Boolean(w));
  if (words.length === 0) return null;
  return { text: words.join(" · "), description: words.join(", ").toLowerCase() };
}
