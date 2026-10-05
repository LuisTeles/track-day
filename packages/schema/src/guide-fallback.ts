import type { Car, Guide } from "./entities";
import type { SimId } from "./sim";

/**
 * Picks the guide to show for a car on a layout. Most to least specific:
 *
 * 1. this car, this sim
 * 2. this car, any sim (`sim: null`)
 * 3. the car's class, this sim
 * 4. the car's class, any sim
 *
 * A guide for a different sim is never used. Among equal matches the most
 * recently updated wins. Deleted guides are ignored.
 */
export function resolveGuide<G extends Pick<Guide, "target" | "sim" | "updatedAt" | "deletedAt">>(
  guides: readonly G[],
  car: Pick<Car, "id" | "classId">,
  sim: SimId | null,
): G | undefined {
  const rank = (g: G): number | undefined => {
    const simRank = g.sim === null ? 1 : sim !== null && g.sim === sim ? 0 : undefined;
    if (simRank === undefined) return undefined;
    if ("carId" in g.target && g.target.carId === car.id) return simRank;
    if ("carClassId" in g.target && g.target.carClassId === car.classId) return 2 + simRank;
    return undefined;
  };

  let best: { guide: G; rank: number } | undefined;
  for (const guide of guides) {
    if (guide.deletedAt !== null) continue;
    const r = rank(guide);
    if (r === undefined) continue;
    if (!best || r < best.rank || (r === best.rank && guide.updatedAt > best.guide.updatedAt)) {
      best = { guide, rank: r };
    }
  }
  return best?.guide;
}
