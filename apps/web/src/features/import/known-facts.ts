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

/** Only facts the user actually gave reach the prompt; anything unusable is left out. */
export function toKnownFacts(draft: FactsDraft): KnownTrackFacts {
  const facts: KnownTrackFacts = {};
  const trackName = draft.trackName.trim();
  if (trackName) facts.trackName = trackName;
  const layoutName = draft.layoutName.trim();
  if (layoutName) facts.layoutName = layoutName;
  const length = positiveNumber(draft.lengthMeters);
  if (length !== null) facts.lengthMeters = Math.round(length);
  if (draft.direction) facts.direction = draft.direction;
  const count = positiveNumber(draft.cornerCount);
  if (count !== null && Number.isInteger(count)) facts.cornerCount = count;
  if (draft.sim) facts.sim = draft.sim;
  return facts;
}
