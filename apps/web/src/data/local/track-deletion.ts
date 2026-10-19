import type { EntityBase, Layout } from "@track-day/schema";
import type { Table } from "dexie";
import type {
  CornerDeletionService,
  LayoutDeletionService,
  TrackDeletionService,
} from "../repositories";
import type { TrackDayDb } from "./db";

const softDeleter =
  (timestamp: string) =>
  <T extends EntityBase>(table: Table<T, string>, ids: string[]) =>
    table
      .where("id")
      .anyOf(ids)
      .modify((e) => {
        e.deletedAt = timestamp;
        e.updatedAt = timestamp;
      });

/**
 * Soft-deletes layouts with their corners, segments, complexes, guides and
 * corner guides, and removes their map images. Runs inside the caller's transaction.
 */
async function deleteLayouts(db: TrackDayDb, layouts: Layout[], timestamp: string) {
  const softDelete = softDeleter(timestamp);
  const layoutIds = layouts.map((l) => l.id);
  const byLayout = (table: Table<EntityBase & { layoutId: string }, string>) =>
    table.where("layoutId").anyOf(layoutIds).primaryKeys();

  const [cornerIds, segmentIds, complexIds, guideIds] = await Promise.all([
    byLayout(db.corners),
    byLayout(db.segments),
    byLayout(db.complexes),
    byLayout(db.guides),
  ]);
  const cornerGuideIds = await db.cornerGuides.where("guideId").anyOf(guideIds).primaryKeys();
  const mapIds = layouts.flatMap((l) => (l.mapAssetId ? [l.mapAssetId] : []));

  await Promise.all([
    softDelete(db.layouts, layoutIds),
    softDelete(db.corners, cornerIds),
    softDelete(db.segments, segmentIds),
    softDelete(db.complexes, complexIds),
    softDelete(db.guides, guideIds),
    softDelete(db.cornerGuides, cornerGuideIds),
    // Asset metadata is soft-deleted for sync; the image itself can go.
    softDelete(db.assets, mapIds),
    db.assetBlobs.bulkDelete(mapIds),
  ]);
}

export class LocalTrackDeletionService
  implements TrackDeletionService, LayoutDeletionService, CornerDeletionService
{
  constructor(private readonly db: TrackDayDb) {}

  private layoutTables() {
    const { db } = this;
    return [
      db.tracks,
      db.layouts,
      db.corners,
      db.segments,
      db.complexes,
      db.guides,
      db.cornerGuides,
      db.assets,
      db.assetBlobs,
    ];
  }

  deleteTrack(trackId: string) {
    const { db } = this;
    return db.transaction("rw", this.layoutTables(), async () => {
      // One timestamp for the whole cascade, so a merge or sync sees one delete.
      const timestamp = new Date().toISOString();
      const track = await db.tracks.get(trackId);
      if (!track || track.deletedAt) throw new Error(`tracks/${trackId} not found`);

      const layouts = await db.layouts.where("trackId").equals(trackId).toArray();
      await Promise.all([
        softDeleter(timestamp)(db.tracks, [trackId]),
        deleteLayouts(db, layouts, timestamp),
      ]);
    });
  }

  deleteLayout(layoutId: string) {
    const { db } = this;
    return db.transaction("rw", this.layoutTables(), async () => {
      const timestamp = new Date().toISOString();
      const layout = await db.layouts.get(layoutId);
      if (!layout || layout.deletedAt) throw new Error(`layouts/${layoutId} not found`);
      const siblings = await db.layouts.where("trackId").equals(layout.trackId).toArray();
      if (siblings.filter((l) => l.deletedAt === null).length <= 1) {
        throw new Error("A track’s last layout can’t be deleted; delete the track instead.");
      }
      await deleteLayouts(db, [layout], timestamp);
    });
  }

  deleteCorner(cornerId: string) {
    const { db } = this;
    const tables = [db.corners, db.cornerGuides, db.complexes, db.segments, db.guides];
    return db.transaction("rw", tables, async () => {
      const timestamp = new Date().toISOString();
      const softDelete = softDeleter(timestamp);
      const corner = await db.corners.get(cornerId);
      if (!corner || corner.deletedAt) throw new Error(`corners/${cornerId} not found`);
      const touch = { updatedAt: timestamp };

      const cornerGuideIds = await db.cornerGuides.where("cornerId").equals(cornerId).primaryKeys();
      await softDelete(db.corners, [cornerId]);
      await softDelete(db.cornerGuides, cornerGuideIds);

      const alive = <T extends EntityBase>(e: T) => e.deletedAt === null;
      const complexes = (
        await db.complexes.where("layoutId").equals(corner.layoutId).toArray()
      ).filter((c) => alive(c) && c.cornerIds.includes(cornerId));
      for (const complex of complexes) {
        const cornerIds = complex.cornerIds.filter((id) => id !== cornerId);
        // A complex needs at least two corners.
        if (cornerIds.length < 2) await softDelete(db.complexes, [complex.id]);
        else await db.complexes.update(complex.id, { cornerIds, ...touch });
      }

      const segments = (await db.segments.where("layoutId").equals(corner.layoutId).toArray())
        .filter(alive)
        .filter((s) => s.fromCornerId === cornerId || s.toCornerId === cornerId);
      for (const s of segments) {
        await db.segments.update(s.id, {
          fromCornerId: s.fromCornerId === cornerId ? null : s.fromCornerId,
          toCornerId: s.toCornerId === cornerId ? null : s.toCornerId,
          ...touch,
        });
      }

      const guides = (await db.guides.where("layoutId").equals(corner.layoutId).toArray())
        .filter(alive)
        .filter((g) => g.video?.marks.some((m) => m.cornerId === cornerId));
      for (const g of guides) {
        await db.guides.update(g.id, {
          video: { ...g.video!, marks: g.video!.marks.filter((m) => m.cornerId !== cornerId) },
          ...touch,
        });
      }
    });
  }
}
