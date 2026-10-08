import type { Corner, CornerGuide } from "@track-day/schema";
import { isEstimate } from "@/features/guides/estimate";
import { brakeAtText } from "@/features/practice/format";

export interface CheatSheetRow {
  number: string;
  name: string;
  direction: string;
  gear: string;
  brake: string;
  minSpeed: string;
  cue: string;
  estimate: boolean;
}

const EMPTY = "—";

/** Display strings for the printed table; "—" where the car has no value. */
export function cheatSheetRows(
  corners: Corner[],
  guideFor: (cornerId: string) => CornerGuide | null,
): CheatSheetRow[] {
  return corners.map((corner) => {
    const guide = guideFor(corner.id);
    const down = guide?.downshiftTo != null && guide.downshiftTo !== guide.gear;
    const gear = [
      guide?.gear != null ? String(guide.gear) : null,
      down ? `↓${guide!.downshiftTo}` : null,
    ]
      .filter(Boolean)
      .join(" ");
    return {
      number: `T${corner.number}`,
      name: corner.name ?? EMPTY,
      direction: corner.direction ? (corner.direction === "left" ? "Left" : "Right") : EMPTY,
      gear: gear || EMPTY,
      brake: brakeAtText(guide) ?? EMPTY,
      minSpeed: guide?.minSpeedKmh != null ? `${Math.round(guide.minSpeedKmh)} km/h` : EMPTY,
      cue: guide?.cue ?? EMPTY,
      estimate: guide ? isEstimate(guide) : false,
    };
  });
}
