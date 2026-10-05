import type { Table } from "dexie";
import {
  Asset,
  BackupPayload,
  Car,
  CarClass,
  Corner,
  CornerComplex,
  CornerGuide,
  CURRENT_SCHEMA_VERSION,
  Guide,
  Layout,
  Segment,
  Track,
  type EntityBase,
} from "@track-day/schema";
import type {
  AssetRepository,
  BackupImportMode,
  BackupService,
  EntityPatch,
  NewEntity,
  Repositories,
  Repository,
} from "../repositories";
import { base64ToBlob, blobToBase64 } from "./base64";
import { TrackDayDb } from "./db";

interface Schema<T> {
  parse(input: unknown): T;
}

const now = () => new Date().toISOString();
const alive = <T extends EntityBase>(e: T) => e.deletedAt === null;

class NotFoundError extends Error {
  override name = "NotFoundError";
}

/** CRUD shared by every entity table. Records are validated before every write. */
class LocalRepository<T extends EntityBase> implements Repository<T> {
  constructor(
    protected readonly table: Table<T, string>,
    protected readonly schema: Schema<T>,
  ) {}

  get(id: string) {
    return this.table.get(id);
  }

  async create(input: NewEntity<T>) {
    const timestamp = now();
    const entity = this.schema.parse({
      ...input,
      id: crypto.randomUUID(),
      createdAt: timestamp,
      updatedAt: timestamp,
      deletedAt: null,
    });
    await this.table.add(entity);
    return entity;
  }

  async update(id: string, patch: EntityPatch<T>) {
    return this.table.db.transaction("rw", this.table, async () => {
      const existing = await this.table.get(id);
      if (!existing) throw new NotFoundError(`${this.table.name}/${id} not found`);
      const entity = this.schema.parse({
        ...existing,
        ...patch,
        id,
        createdAt: existing.createdAt,
        updatedAt: now(),
      });
      await this.table.put(entity);
      return entity;
    });
  }

  async remove(id: string) {
    const timestamp = now();
    const changed = await this.table
      .where("id")
      .equals(id)
      .modify((e) => {
        e.deletedAt = timestamp;
        e.updatedAt = timestamp;
      });
    if (changed === 0) throw new NotFoundError(`${this.table.name}/${id} not found`);
  }

  protected async listWhere(index: string, value: string): Promise<T[]> {
    return (await this.table.where(index).equals(value).toArray()).filter(alive);
  }

  async list(): Promise<T[]> {
    return (await this.table.toArray()).filter(alive);
  }
}

const byName = <T extends { name: string }>(a: T, b: T) => a.name.localeCompare(b.name);

class LocalTrackRepository extends LocalRepository<Track> {
  override async list() {
    return (await super.list()).sort(byName);
  }
}

class LocalLayoutRepository extends LocalRepository<Layout> {
  async listByTrack(trackId: string) {
    return (await this.listWhere("trackId", trackId)).sort(byName);
  }
}

class LocalCornerRepository extends LocalRepository<Corner> {
  async listByLayout(layoutId: string) {
    return (await this.listWhere("layoutId", layoutId)).sort(
      (a, b) => a.order - b.order || a.number - b.number,
    );
  }

  async reorder(layoutId: string, cornerIds: readonly string[]) {
    await this.table.db.transaction("rw", this.table, async () => {
      const corners = await this.listWhere("layoutId", layoutId);
      const known = new Set(corners.map((c) => c.id));
      if (cornerIds.length !== known.size || !cornerIds.every((id) => known.has(id))) {
        throw new Error("reorder() needs exactly the layout's corner ids");
      }
      const timestamp = now();
      await Promise.all(
        cornerIds.map((id, order) => this.table.update(id, { order, updatedAt: timestamp })),
      );
    });
  }
}

class LocalLayoutChildRepository<
  T extends EntityBase & { layoutId: string },
> extends LocalRepository<T> {
  listByLayout(layoutId: string) {
    return this.listWhere("layoutId", layoutId);
  }
}

class LocalCarClassRepository extends LocalRepository<CarClass> {
  override async list() {
    return (await super.list()).sort(byName);
  }
}

class LocalCarRepository extends LocalRepository<Car> {
  override async list() {
    return (await super.list()).sort(byName);
  }

  async listByClass(classId: string) {
    return (await this.listWhere("classId", classId)).sort(byName);
  }
}

class LocalCornerGuideRepository extends LocalRepository<CornerGuide> {
  listByGuide(guideId: string) {
    return this.listWhere("guideId", guideId);
  }
}

class LocalAssetRepository implements AssetRepository {
  constructor(private readonly db: TrackDayDb) {}

  async put(blob: Blob, meta: { fileName?: string; width?: number; height?: number } = {}) {
    const timestamp = now();
    const asset = Asset.parse({
      id: crypto.randomUUID(),
      createdAt: timestamp,
      updatedAt: timestamp,
      deletedAt: null,
      mimeType: blob.type || "application/octet-stream",
      fileName: meta.fileName ?? null,
      sizeBytes: blob.size,
      width: meta.width ?? null,
      height: meta.height ?? null,
    });
    await this.db.transaction("rw", this.db.assets, this.db.assetBlobs, async () => {
      await this.db.assets.add(asset);
      await this.db.assetBlobs.add({ id: asset.id, blob });
    });
    return asset;
  }

  async get(id: string) {
    const [asset, stored] = await Promise.all([this.db.assets.get(id), this.db.assetBlobs.get(id)]);
    return asset && stored ? { asset, blob: stored.blob } : undefined;
  }

  async remove(id: string) {
    // Metadata is soft-deleted for sync; the blob itself can go.
    const timestamp = now();
    await this.db.transaction("rw", this.db.assets, this.db.assetBlobs, async () => {
      await this.db.assets.update(id, { deletedAt: timestamp, updatedAt: timestamp });
      await this.db.assetBlobs.delete(id);
    });
  }
}

const ENTITY_TABLES = [
  "tracks",
  "layouts",
  "corners",
  "segments",
  "complexes",
  "carClasses",
  "cars",
  "guides",
  "cornerGuides",
] as const;

class LocalBackupService implements BackupService {
  constructor(private readonly db: TrackDayDb) {}

  async exportAll(): Promise<BackupPayload> {
    // Read a consistent snapshot first; blob encoding happens outside the
    // transaction because awaiting non-IndexedDB promises would close it.
    const { entities, assets, blobs } = await this.db.transaction("r", this.db.tables, async () => {
      const entities = await Promise.all(
        ENTITY_TABLES.map((name) => this.db.table(name).toArray()),
      );
      const assets = await this.db.assets.toArray();
      const blobs = await this.db.assetBlobs.bulkGet(assets.map((a) => a.id));
      return { entities, assets, blobs };
    });

    const backupAssets = await Promise.all(
      assets.flatMap((asset, i) => {
        const blob = blobs[i]?.blob;
        return blob ? [blobToBase64(blob).then((dataBase64) => ({ ...asset, dataBase64 }))] : [];
      }),
    );

    return BackupPayload.parse({
      schemaVersion: CURRENT_SCHEMA_VERSION,
      kind: "backup",
      exportedAt: now(),
      data: {
        ...Object.fromEntries(ENTITY_TABLES.map((name, i) => [name, entities[i]])),
        assets: backupAssets,
      },
    });
  }

  async importAll(payload: BackupPayload, mode: BackupImportMode) {
    const { assets, ...entities } = BackupPayload.parse(payload).data;
    const assetBlobs = assets.map(({ dataBase64, ...asset }) => ({
      asset,
      blob: base64ToBlob(dataBase64, asset.mimeType),
    }));

    await this.db.transaction("rw", this.db.tables, async () => {
      if (mode === "replace") {
        await Promise.all(this.db.tables.map((t) => t.clear()));
      }

      for (const name of ENTITY_TABLES) {
        await this.putNewer(this.db.table(name), entities[name]);
      }

      const winners = await this.putNewer(
        this.db.assets,
        assetBlobs.map((a) => a.asset),
      );
      const winnerIds = new Set(winners.map((a) => a.id));
      await this.db.assetBlobs.bulkPut(
        assetBlobs
          .filter((a) => winnerIds.has(a.asset.id))
          .map(({ asset, blob }) => ({ id: asset.id, blob })),
      );
    });
  }

  /** Last-write-wins: writes each record unless the local copy is at least as new. */
  private async putNewer<T extends EntityBase>(table: Table<T, string>, incoming: T[]) {
    const existing = await table.bulkGet(incoming.map((e) => e.id));
    const winners = incoming.filter((e, i) => {
      const local = existing[i];
      return !local || e.updatedAt > local.updatedAt;
    });
    await table.bulkPut(winners);
    return winners;
  }
}

export function createLocalRepositories(db = new TrackDayDb()): Repositories {
  return {
    tracks: new LocalTrackRepository(db.tracks, Track),
    layouts: new LocalLayoutRepository(db.layouts, Layout),
    corners: new LocalCornerRepository(db.corners, Corner),
    segments: new LocalLayoutChildRepository(db.segments, Segment),
    complexes: new LocalLayoutChildRepository(db.complexes, CornerComplex),
    carClasses: new LocalCarClassRepository(db.carClasses, CarClass),
    cars: new LocalCarRepository(db.cars, Car),
    guides: new LocalLayoutChildRepository(db.guides, Guide),
    cornerGuides: new LocalCornerGuideRepository(db.cornerGuides, CornerGuide),
    assets: new LocalAssetRepository(db),
    backup: new LocalBackupService(db),
  };
}
