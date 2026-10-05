import { simLabel, type Car, type CarClass, type CornerGuide, type Guide } from "@track-day/schema";
import type { CornerChip } from "./corner-markers";

/** e.g. "Road car · any sim" or "Mazda MX-5 · Assetto Corsa". */
export function guideLabel(guide: Guide, carClasses: CarClass[], cars: Car[]): string {
  const target =
    "carId" in guide.target
      ? (cars.find((c) => c.id === (guide.target as { carId: string }).carId)?.name ??
        "Unknown car")
      : (carClasses.find((c) => c.id === (guide.target as { carClassId: string }).carClassId)
          ?.name ?? "Unknown class");
  return `${target} · ${guide.sim ? simLabel(guide.sim) : "any sim"}`;
}

/** Chip per corner: minimum speed and gear, the two numbers you glance at mid-lap. */
export function chipsFor(cornerGuides: CornerGuide[]): Map<string, CornerChip> {
  const chips = new Map<string, CornerChip>();
  for (const g of cornerGuides) {
    const parts: string[] = [];
    const spoken: string[] = [];
    if (g.minSpeedKmh != null) {
      parts.push(`${Math.round(g.minSpeedKmh)} km/h`);
      spoken.push(`minimum ${Math.round(g.minSpeedKmh)} km/h`);
    }
    if (g.gear != null) {
      parts.push(`G${g.gear}`);
      spoken.push(`gear ${g.gear}`);
    }
    if (parts.length === 0) continue;
    chips.set(g.cornerId, {
      text: parts.join(" · "),
      description: spoken.join(", "),
      estimate: g.source === "ai",
    });
  }
  return chips;
}
