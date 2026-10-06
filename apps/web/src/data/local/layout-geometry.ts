import type { LayoutGeometryService, Repositories, SaveOutlineInput } from "../repositories";
import type { TrackDayDb } from "./db";

export class LocalLayoutGeometryService implements LayoutGeometryService {
  constructor(
    private readonly db: TrackDayDb,
    private readonly repos: Pick<Repositories, "layouts" | "corners">,
  ) {}

  saveOutline(input: SaveOutlineInput) {
    const { db, repos } = this;
    // Repository writes join this transaction, so a failure rolls back everything.
    return db.transaction("rw", [db.layouts, db.corners], async () => {
      const layout = await db.layouts.get(input.layoutId);
      if (!layout || layout.deletedAt) throw new Error(`layouts/${input.layoutId} not found`);
      if (layout.outlinePath) throw new Error("This layout already has a map.");

      await repos.layouts.update(input.layoutId, {
        outlinePath: input.outlinePath,
        outlineSource: input.outlineSource,
        ...(input.lengthMeters !== undefined && { lengthMeters: input.lengthMeters }),
      });
      for (const { cornerId, pathPosition } of input.cornerPositions) {
        const corner = await db.corners.get(cornerId);
        if (!corner || corner.layoutId !== input.layoutId) {
          throw new Error(`Corner ${cornerId} is not on this layout`);
        }
        await repos.corners.update(cornerId, { pathPosition });
      }
    });
  }
}
