import Dexie, { type Table } from "dexie";
import type {
  Asset,
  Car,
  CarClass,
  Corner,
  CornerComplex,
  CornerGuide,
  Guide,
  Layout,
  Segment,
  Track,
} from "@track-day/schema";

export interface AssetBlob {
  id: string;
  blob: Blob;
}

// Plain `Table` rather than `EntityTable`: ids are always client-generated,
// never auto-incremented, so they are required on insert.
export class TrackDayDb extends Dexie {
  tracks!: Table<Track, string>;
  layouts!: Table<Layout, string>;
  corners!: Table<Corner, string>;
  segments!: Table<Segment, string>;
  complexes!: Table<CornerComplex, string>;
  carClasses!: Table<CarClass, string>;
  cars!: Table<Car, string>;
  guides!: Table<Guide, string>;
  cornerGuides!: Table<CornerGuide, string>;
  assets!: Table<Asset, string>;
  assetBlobs!: Table<AssetBlob, string>;

  constructor(name = "track-day") {
    super(name);
    // Only indexed fields are listed; Dexie stores the whole object regardless.
    // Changing indexes requires a new `.version(n)` — never edit an old one.
    this.version(1).stores({
      tracks: "id, updatedAt",
      layouts: "id, trackId, updatedAt",
      corners: "id, layoutId, updatedAt",
      segments: "id, layoutId, updatedAt",
      complexes: "id, layoutId, updatedAt",
      carClasses: "id, updatedAt",
      cars: "id, classId, updatedAt",
      guides: "id, layoutId, updatedAt",
      cornerGuides: "id, guideId, cornerId, updatedAt",
      assets: "id, updatedAt",
      assetBlobs: "id",
    });
  }
}
