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
      const replacing = input.replace === true && layout.outlineSource === "osm";
      if (layout.outlinePath && !replacing) throw new Error("This layout already has a map.");

      await repos.layouts.update(input.layoutId, {
        outlinePath: input.outlinePath,
        outlineSource: input.outlineSource,
        ...(input.lengthMeters !== undefined && { lengthMeters: input.lengthMeters }),
      });
      if (replacing) {
        const kept = new Set(input.cornerPositions.map((p) => p.cornerId));
        for (const corner of await db.corners.where("layoutId").equals(input.layoutId).toArray()) {
          if (!kept.has(corner.id) && corner.pathPosition !== null) {
            await repos.corners.update(corner.id, { pathPosition: null });
          }
        }
      }
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
