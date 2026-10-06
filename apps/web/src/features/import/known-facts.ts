import type { KnownTrackFacts } from "@track-day/prompts";
import type { SimId } from "@track-day/schema";

/** The known-facts fields as typed: strings, so half-typed numbers survive. */
export interface FactsDraft {
  trackName: string;
  layoutName: string;
  lengthMeters: string;
  direction: "" | "clockwise" | "anticlockwise";
  cornerCount: string;
  sim: "" | SimId;
}

export const EMPTY_DRAFT: FactsDraft = {
  trackName: "",
  layoutName: "",
  lengthMeters: "",
  direction: "",
  cornerCount: "",
  sim: "",
};

function positiveNumber(text: string): number | null {
  if (text.trim() === "") return null;
  const n = Number(text);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Shorter than any real lap: a value below this is a typo (e.g. km typed as m). */
const MIN_LAP_METERS = 100;

/**
 * Reads a lap length in meters as people type it: `4309`, `4.309`, `4,309`
 * or `4 309` (thousands separators) and `4309.4` or `4309,4` (decimals).
 * Returns null for anything that can't be a lap length.
 */
export function parseLapLength(text: string): number | null {
  const compact = text.replace(/[\s_]/g, "");
  if (compact === "") return null;
  const n = /^\d{1,3}([.,]\d{3})+$/.test(compact)
    ? Number(compact.replace(/[.,]/g, ""))
    : Number(compact.replace(",", "."));
  return Number.isFinite(n) && n >= MIN_LAP_METERS ? Math.round(n) : null;
}

/** Only facts the user actually gave reach the prompt; anything unusable is left out. */
export function toKnownFacts(draft: FactsDraft): KnownTrackFacts {
  const facts: KnownTrackFacts = {};
  const trackName = draft.trackName.trim();
  if (trackName) facts.trackName = trackName;
  const layoutName = draft.layoutName.trim();
  if (layoutName) facts.layoutName = layoutName;
  const length = parseLapLength(draft.lengthMeters);
  if (length !== null) facts.lengthMeters = length;
  if (draft.direction) facts.direction = draft.direction;
  const count = positiveNumber(draft.cornerCount);
  if (count !== null && Number.isInteger(count)) facts.cornerCount = count;
  if (draft.sim) facts.sim = draft.sim;
  return facts;
}
