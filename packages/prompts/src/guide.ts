import {
  guideImportJsonSchema,
  simLabel,
  type Car,
  type CarClass,
  type SimId,
  type TrackImportPayload,
} from "@track-day/schema";

export interface GuidePromptInput {
  /** The layout being driven, in import format so corners are referenced by number. */
  track: TrackImportPayload;
  car: Pick<
    Car,
    "name" | "powerHp" | "weightKg" | "drivetrain" | "downforce" | "transmission" | "abs" | "tc"
  >;
  carClass: Pick<CarClass, "name">;
  sim: SimId | null;
}

/** Prompt for estimating a per-corner driving guide for one car on one layout. */
export function buildGuidePrompt({ track, car, carClass, sim }: GuidePromptInput): string {
  const specs = {
    name: car.name,
    class: carClass.name,
    powerHp: car.powerHp,
    weightKg: car.weightKg,
    drivetrain: car.drivetrain,
    downforce: car.downforce,
    transmission: car.transmission,
    abs: car.abs,
    tractionControl: car.tc,
  };

  return `You are an experienced racing driver coach.

Write a corner-by-corner driving guide for the car below on the track below${sim ? `, as driven in ${simLabel(sim)}` : ""}.

## Car
${JSON.stringify(specs, null, 2)}

## Track
${JSON.stringify(track, null, 2)}

## Task
For every corner (referenced by "cornerNumber"), give:
- brakeReference: a visible reference for the braking point (e.g. "100m board", "end of the wall"), and brakeMarkerMeters if it is a distance board (meters before the turn-in point).
- brakePressure: "none" (lift or flat out), "light", "firm" or "heavy"; brakePressurePct (0-100) only if you can be more precise.
- entrySpeedKmh, minSpeedKmh, exitSpeedKmh in km/h, and the gear at the apex. downshiftTo only when the lowest gear under braking differs from the apex gear.
- line: turn-in, apex and exit descriptions.
- throttleNotes and trailBrakeNotes.
- priority: "exit" when the corner leads onto a long straight, "entry" when the next corner matters more, otherwise "balanced".
- cue: one short imperative sentence a driver can read at a glance, at most 90 characters (e.g. "Brake at 100 m, trail into the apex, early throttle").
- confidence: how sure you are about the numbers ("low", "medium" or "high").
Also give an approximate referenceLapTime ("m:ss.sss") and short setupNotes.

## Rules
- Output ONLY a single JSON object. No prose, no markdown code fences.
- The JSON must validate against the JSON Schema below.
- All speeds are in km/h.
- Use null when you are unsure of a value. Never guess wildly; a low-confidence estimate is better than nothing.

## JSON Schema
${JSON.stringify(guideImportJsonSchema(), null, 2)}
`;
}
