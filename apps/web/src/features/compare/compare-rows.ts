import type { CornerGuide } from "@track-day/schema";
import { isEstimate } from "@/features/guides/estimate";
import { brakeAtText, pressureOf } from "@/features/practice/format";

const EMPTY = "—";

/** One line of the comparison: a value per car, "—" where the car has none. */
export interface CompareRow {
  term: string;
  a: string;
  b: string;
  /** The two cars differ here (both known). */
  differs: boolean;
}

const speed = (v: number | null | undefined) => (v == null ? null : `${Math.round(v)} km/h`);

function gearText(g: CornerGuide | undefined) {
  if (g?.gear == null) return null;
  const down = g.downshiftTo != null && g.downshiftTo !== g.gear ? ` (↓${g.downshiftTo})` : "";
  return `${g.gear}${down}`;
}

const FIELDS: { term: string; value: (g: CornerGuide | undefined) => string | null }[] = [
  { term: "Entry", value: (g) => speed(g?.entrySpeedKmh) },
  { term: "Minimum", value: (g) => speed(g?.minSpeedKmh) },
  { term: "Exit", value: (g) => speed(g?.exitSpeedKmh) },
  { term: "Gear", value: gearText },
  { term: "Brake", value: (g) => brakeAtText(g ?? null) },
  { term: "Pressure", value: (g) => pressureOf(g ?? null)?.label ?? null },
  { term: "Cue", value: (g) => g?.cue ?? null },
  { term: "Notes", value: (g) => g?.notes.trim() || null },
];

/** Rows for one corner; rows neither car has are left out. */
export function compareRows(a: CornerGuide | undefined, b: CornerGuide | undefined): CompareRow[] {
  const mark = (g: CornerGuide | undefined, v: string) =>
    g && isEstimate(g) && v !== EMPTY ? `${v} (est.)` : v;
  return FIELDS.flatMap(({ term, value }) => {
    const va = value(a);
    const vb = value(b);
    if (va === null && vb === null) return [];
    return [
      {
        term,
        a: mark(a, va ?? EMPTY),
        b: mark(b, vb ?? EMPTY),
        differs: va !== null && vb !== null && va !== vb,
      },
    ];
  });
}
