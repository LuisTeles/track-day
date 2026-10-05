import type { BrakePressure, Corner, CornerGuide } from "@track-day/schema";

/** "100 m board", or "100 m" from the marker alone; null when unknown. */
export function brakeAtText(
  guide: Pick<CornerGuide, "brakeReference" | "brakeMarkerMeters"> | null,
) {
  if (!guide) return null;
  if (guide.brakeReference) return guide.brakeReference;
  if (guide.brakeMarkerMeters != null) return `${guide.brakeMarkerMeters} m`;
  return null;
}

const PRESSURE_LEVEL: Record<BrakePressure, number> = { none: 0, light: 33, firm: 66, heavy: 100 };

/** Bar fill 0–100 and its text label; null when unknown. */
export function pressureOf(guide: Pick<CornerGuide, "brakePressure" | "brakePressurePct"> | null) {
  if (!guide || (guide.brakePressure == null && guide.brakePressurePct == null)) return null;
  const pct = guide.brakePressurePct ?? PRESSURE_LEVEL[guide.brakePressure!];
  const label =
    guide.brakePressure === "none"
      ? "Lift / flat"
      : guide.brakePressure
        ? guide.brakePressure[0]!.toUpperCase() + guide.brakePressure.slice(1)
        : `${Math.round(pct)}%`;
  return {
    pct,
    label:
      guide.brakePressurePct != null && guide.brakePressure
        ? `${label} · ${Math.round(pct)}%`
        : label,
  };
}

export function directionText(corners: Pick<Corner, "direction">[]) {
  const dirs = corners.map((c) => c.direction).filter((d): d is "left" | "right" => d != null);
  if (dirs.length === 0) return null;
  return dirs.map((d) => (d === "left" ? "Left" : "Right")).join(" → ");
}

export function titleOf(corners: Pick<Corner, "number">[]) {
  const first = corners[0]!;
  const last = corners[corners.length - 1]!;
  return first === last ? `T${first.number}` : `T${first.number}–T${last.number}`;
}
