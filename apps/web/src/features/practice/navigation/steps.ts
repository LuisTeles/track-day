import type { Corner, CornerComplex, CornerGuide } from "@track-day/schema";

export type StepMode = "corner" | "complex";

/** One screen in practice mode: a single corner, or a complex driven as one unit. */
export interface PracticeStep {
  corners: Corner[];
  complex: CornerComplex | null;
}

/**
 * Steps in lap order. In complex mode, the corners of a complex become one
 * step at the position of its first corner (e.g. Senna S = T1 + T2).
 */
export function buildSteps(
  corners: Corner[],
  complexes: CornerComplex[],
  mode: StepMode,
): PracticeStep[] {
  if (mode === "corner") return corners.map((c) => ({ corners: [c], complex: null }));

  const complexOf = new Map<string, CornerComplex>();
  for (const complex of complexes) for (const id of complex.cornerIds) complexOf.set(id, complex);

  const steps: PracticeStep[] = [];
  const done = new Set<string>();
  for (const corner of corners) {
    if (done.has(corner.id)) continue;
    const complex = complexOf.get(corner.id);
    if (!complex) {
      steps.push({ corners: [corner], complex: null });
      continue;
    }
    const members = corners.filter((c) => complex.cornerIds.includes(c.id));
    members.forEach((c) => done.add(c.id));
    steps.push({ corners: members, complex });
  }
  return steps;
}

/** The step containing corner `number`, or 0. */
export function stepIndexOf(steps: PracticeStep[], number: number): number {
  const i = steps.findIndex((s) => s.corners.some((c) => c.number === number));
  return Math.max(0, i);
}

/**
 * Guidance for a step. A single corner uses its own guide. A complex brakes
 * where its first corner says, and shows the slowest point of the complex
 * (lowest minimum speed, with that corner's gear).
 */
export function stepGuide(step: PracticeStep, guideFor: (cornerId: string) => CornerGuide | null) {
  const guides = step.corners.map((c) => guideFor(c.id));
  const first = guides[0] ?? null;
  if (step.corners.length === 1 || !first) return first;
  const slowest = guides
    .filter((g): g is CornerGuide => g !== null && g.minSpeedKmh != null)
    .sort((a, b) => a.minSpeedKmh! - b.minSpeedKmh!)[0];
  return slowest ? { ...first, minSpeedKmh: slowest.minSpeedKmh, gear: slowest.gear } : first;
}
