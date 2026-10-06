import {
  simLabel,
  trackImportJsonSchema,
  type SimId,
  type TrackImportPayload,
} from "@track-day/schema";

/**
 * Facts the user already knows. They go into the prompt as ground truth, which
 * anchors the AI: corner distances are scaled against a known length instead
 * of guessed from an unscaled image.
 */
export interface KnownTrackFacts {
  trackName?: string;
  layoutName?: string;
  /** The single most useful fact: every corner position is derived from it. */
  lengthMeters?: number;
  direction?: "clockwise" | "anticlockwise";
  cornerCount?: number;
  sim?: SimId;
}

const EXAMPLE: TrackImportPayload = {
  schemaVersion: 1,
  kind: "track",
  track: {
    name: "Autódromo José Carlos Pace",
    aliases: ["Interlagos"],
    country: "BR",
    city: "São Paulo",
  },
  layout: { name: "GP", lengthMeters: 4309, direction: "anticlockwise" },
  corners: [
    {
      number: 1,
      name: "S do Senna",
      direction: "left",
      type: "chicane",
      elevation: "downhill",
      distanceFromStartMeters: 350,
    },
    {
      number: 2,
      name: "S do Senna",
      direction: "right",
      type: "chicane",
      elevation: "downhill",
      distanceFromStartMeters: 450,
    },
    {
      number: 3,
      name: "Curva do Sol",
      direction: "left",
      type: "sweeper",
      elevation: "flat",
      distanceFromStartMeters: 700,
    },
  ],
  complexes: [{ name: "S do Senna", cornerNumbers: [1, 2] }],
  segments: [{ name: "Reta Oposta", fromCorner: 3, toCorner: 4 }],
};

function knownFactsSection(known: KnownTrackFacts): string {
  const lines = [
    known.trackName && `- Track: ${known.trackName}`,
    known.layoutName && `- Layout: ${known.layoutName}`,
    known.lengthMeters && `- Lap length: ${known.lengthMeters} m`,
    known.direction && `- Driving direction: ${known.direction}`,
    known.cornerCount && `- Number of corners (official numbering): ${known.cornerCount}`,
    known.sim && `- Sim: ${simLabel(known.sim)} (use this sim's version of the track)`,
  ].filter(Boolean);

  if (lines.length === 0) return "";
  return `
## Known facts (ground truth — do not contradict them)
${lines.join("\n")}
`;
}

/**
 * Prompt for turning a circuit map image (or screenshots) into a track
 * import payload. The user attaches the image in their AI chat of choice.
 */
export function buildTrackPrompt(known: KnownTrackFacts = {}): string {
  return `You are helping build a structured database of race track knowledge.

I will attach an image of a race circuit (a track map and/or screenshots). Identify the track and describe its layout as JSON.

If no image is attached, or the image is not a race circuit you can identify, do not guess: reply with only {"error": "<short reason>"} (for example {"error": "No image was attached"}).
${knownFactsSection(known)}
## Required — the import is rejected without these
- layout.lengthMeters: the official lap length in meters.${known.lengthMeters ? " Use the known value above." : ""}
- layout.direction: "clockwise" or "anticlockwise".
- Every corner, in lap order, with its number and direction ("left" or "right").

## Task
- Identify the track: official name, common aliases, country (ISO 3166-1 alpha-2 code) and city.
- Identify the layout shown (e.g. "GP", "National", "Short").
- List every corner in lap order, starting from the first corner after the start/finish line. For each: number, name (only if it has a well-known name), direction, type and elevation. Include camber, notes and commonMistakes only if you are confident.
- For each corner, estimate distanceFromStartMeters: the distance along the racing line from the start/finish line to the corner's apex. Scale it to the lap length, so values increase in lap order and stay below lengthMeters. Use known reference points (straight lengths, sector boundaries) when you know them.
- List complexes: groups of corners driven as one unit (e.g. an S or chicane), referencing corners by number.
- List named straights and sections as segments, referencing the corners they connect by number.

## Rules
- Output ONLY a single JSON object. No prose, no markdown code fences.
- The JSON must validate against the JSON Schema below, unless you reply with the error object described above.
- Use null when you are unsure of an optional value. Never guess.
- Never invent corner names. If a corner has no well-known name, set "name" to null.
- Use the official turn numbering when one exists.
- Omit layout.outlinePath, layout.outlineSource, layout.racingLinePath, layout.rotation, and each corner's pathPosition and labelOffset. The track geometry comes from map data or the app's editor, not from an image estimate.

## JSON Schema
${JSON.stringify(trackImportJsonSchema(), null, 2)}

## Example (abbreviated, for Interlagos)
${JSON.stringify(EXAMPLE, null, 2)}
`;
}
