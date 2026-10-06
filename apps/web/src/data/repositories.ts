import type {
  Asset,
  BackupPayload,
  Car,
  CarClass,
  Corner,
  CornerComplex,
  CornerGuide,
  EntityBase,
  Guide,
  GuideImportPayload,
  GuideTarget,
  Layout,
  Segment,
  SimId,
  Source,
  Track,
  TrackImportPayload,
} from "@track-day/schema";

/**
 * Data access contracts. UI code depends only on these interfaces; v1 binds
 * the IndexedDB implementations in `local/`, a future backend binds `http/`.
 * Every method is async because the HTTP versions will be.
 */

/** What callers provide when creating: everything but id and timestamps. */
export type NewEntity<T extends EntityBase> = Omit<T, keyof EntityBase>;
export type EntityPatch<T extends EntityBase> = Partial<NewEntity<T>>;

export interface Repository<T extends EntityBase> {
  /** Returns the entity even if soft-deleted, so references can still render. */
  get(id: string): Promise<T | undefined>;
  create(input: NewEntity<T>): Promise<T>;
  update(id: string, patch: EntityPatch<T>): Promise<T>;
  /** Soft delete: sets `deletedAt`, keeping the record for sync. */
  remove(id: string): Promise<void>;
}

export interface TrackRepository extends Repository<Track> {
  list(): Promise<Track[]>;
}

export interface LayoutRepository extends Repository<Layout> {
  listByTrack(trackId: string): Promise<Layout[]>;
}

export interface CornerRepository extends Repository<Corner> {
  /** Sorted by lap order. */
  listByLayout(layoutId: string): Promise<Corner[]>;
  /** Rewrites `order` so corners follow the given id sequence. */
  reorder(layoutId: string, cornerIds: readonly string[]): Promise<void>;
}

export interface SegmentRepository extends Repository<Segment> {
  listByLayout(layoutId: string): Promise<Segment[]>;
}

export interface CornerComplexRepository extends Repository<CornerComplex> {
  listByLayout(layoutId: string): Promise<CornerComplex[]>;
}

export interface CarClassRepository extends Repository<CarClass> {
  list(): Promise<CarClass[]>;
}

export interface CarRepository extends Repository<Car> {
  list(): Promise<Car[]>;
  listByClass(classId: string): Promise<Car[]>;
}

export interface GuideRepository extends Repository<Guide> {
  listByLayout(layoutId: string): Promise<Guide[]>;
}

export interface CornerGuideRepository extends Repository<CornerGuide> {
  listByGuide(guideId: string): Promise<CornerGuide[]>;
}

export interface AssetRepository {
  /** Stores a binary (e.g. a track map image) and returns its metadata. */
  put(blob: Blob, meta?: { fileName?: string; width?: number; height?: number }): Promise<Asset>;
  get(id: string): Promise<{ asset: Asset; blob: Blob } | undefined>;
  remove(id: string): Promise<void>;
}

export type BackupImportMode =
  /** Wipe local data, then load the backup. */
  | "replace"
  /** Keep local data; per record, the newer `updatedAt` wins. */
  | "merge";

export interface BackupService {
  exportAll(): Promise<BackupPayload>;
  importAll(payload: BackupPayload, mode: BackupImportMode): Promise<void>;
}

export interface TrackImportService {
  /**
   * Creates a track with its layout, corners, segments and complexes in one
   * transaction: either everything is saved or nothing is.
   */
  importTrack(payload: TrackImportPayload): Promise<{ trackId: string; layoutId: string }>;
}

export interface TrackDeletionService {
  /**
   * Soft-deletes a track with its layouts, corners, segments, complexes,
   * guides and corner guides in one transaction, and removes its map images.
   */
  deleteTrack(trackId: string): Promise<void>;
}

export interface GuideImportOptions {
  layoutId: string;
  target: GuideTarget;
  sim: SimId | null;
  /** Defaults to "ai": imported numbers are estimates until confirmed. */
  source?: Source;
}

export interface GuideImportService {
  /** Creates a guide and its corner guides, matching corners by number. */
  importGuide(
    payload: GuideImportPayload,
    options: GuideImportOptions,
  ): Promise<{ guideId: string }>;
}

export interface SaveOutlineInput {
  layoutId: string;
  outlinePath: string;
  outlineSource: "osm";
  /** Corners that get an exact position; others keep theirs (usually null). */
  cornerPositions: { cornerId: string; pathPosition: number }[];
  /** Only when the user chose the outline source's lap length. */
  lengthMeters?: number;
}

export interface LayoutGeometryService {
  /** Adds an outline to a layout without one, with corner positions, in one transaction. */
  saveOutline(input: SaveOutlineInput): Promise<void>;
}

export interface Repositories {
  tracks: TrackRepository;
  layouts: LayoutRepository;
  corners: CornerRepository;
  segments: SegmentRepository;
  complexes: CornerComplexRepository;
  carClasses: CarClassRepository;
  cars: CarRepository;
  guides: GuideRepository;
  cornerGuides: CornerGuideRepository;
  assets: AssetRepository;
  backup: BackupService;
  trackImport: TrackImportService;
  guideImport: GuideImportService;
  trackDeletion: TrackDeletionService;
  layoutGeometry: LayoutGeometryService;
}
