import type { NamedSection, OsmCorner } from "@track-day/osm-track";
import type { Corner } from "@track-day/schema";
import { cornerFraction } from "@/features/track-view/geometry/anchors";

/** Where a corner's position comes from, best first. */
export type PositionSource = "osm" | "name" | "distance" | "none";

export interface MatchedCorner {
  corner: Corner;
  source: PositionSource;
  fraction: number | null;
}

const wrap = (f: number) => ((f % 1) + 1) % 1;

/** "Variante Áscari", "variante-ascari" → "variante ascari". */
export function normalizeName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/**
 * The section a corner name refers to: an exact match on its name or an
 * alias, else the only section whose name contains the corner's (or the
 * reverse), so "Parabolica" finds "Curva Parabolica" but "Lesmo" doesn't
 * pick between "Lesmo 1" and "Lesmo 2".
 */
function sectionFor(name: string, sections: NamedSection[]): NamedSection | undefined {
  const wanted = normalizeName(name);
  if (wanted === "") return undefined;
  const names = (s: NamedSection) => [s.name, ...s.aliases].map(normalizeName);
  const exact = sections.filter((s) => names(s).includes(wanted));
  if (exact.length > 0) return exact[0];
  const partial = sections.filter((s) =>
    names(s).some(
      (n) => n.length >= 5 && wanted.length >= 5 && (n.includes(wanted) || wanted.includes(n)),
    ),
  );
  return partial.length === 1 ? partial[0] : undefined;
}

/**
 * The layout's own corners, placed by OSM's corner number, else by a named
 * OSM section matching the corner's name, else by distance from the start.
 * Corners sharing a section (a chicane's two halves) are spread across it.
 */
export function matchCorners(
  corners: Corner[],
  osm: OsmCorner[],
  lengthMeters: number,
  sections: NamedSection[] = [],
): MatchedCorner[] {
  const byNumber = new Map(osm.map((o) => [o.number, o.position]));

  const bySection = new Map<NamedSection, Corner[]>();
  for (const corner of corners) {
    if (byNumber.has(corner.number) || !corner.name) continue;
    const section = sectionFor(corner.name, sections);
    if (section) bySection.set(section, [...(bySection.get(section) ?? []), corner]);
  }
  const named = new Map<string, number>();
  for (const [section, shared] of bySection) {
    const span = wrap(section.to - section.from);
    shared
      .sort((a, b) => a.number - b.number)
      .forEach((corner, i) =>
        named.set(corner.id, wrap(section.from + (span * (i + 0.5)) / shared.length)),
      );
  }

  return corners.map((corner) => {
    const tagged = byNumber.get(corner.number);
    if (tagged !== undefined) return { corner, source: "osm", fraction: tagged };
    const byName = named.get(corner.id);
    if (byName !== undefined) return { corner, source: "name", fraction: byName };
    const fraction = cornerFraction({ ...corner, pathPosition: null }, { lengthMeters });
    return fraction === null
      ? { corner, source: "none", fraction: null }
      : { corner, source: "distance", fraction };
  });
}

export function cornerPositionsToSave(matched: MatchedCorner[]) {
  return matched.flatMap((m) =>
    (m.source === "osm" || m.source === "name") && m.fraction !== null
      ? [{ cornerId: m.corner.id, pathPosition: m.fraction }]
      : [],
  );
}
