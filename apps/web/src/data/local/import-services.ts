import type { GuideImportPayload, TrackImportPayload } from "@track-day/schema";
import type {
  GuideImportOptions,
  GuideImportService,
  Repositories,
  TrackImportService,
} from "../repositories";
import type { TrackDayDb } from "./db";

type EntityRepositories = Omit<Repositories, "trackImport" | "guideImport">;

export class LocalTrackImportService implements TrackImportService {
  constructor(
    private readonly db: TrackDayDb,
    private readonly repos: EntityRepositories,
  ) {}

  importTrack(payload: TrackImportPayload) {
    const { db, repos } = this;
    // Repository writes join this transaction, so a failure rolls back everything.
    return db.transaction(
      "rw",
      [db.tracks, db.layouts, db.corners, db.segments, db.complexes],
      async () => {
        const track = await repos.tracks.create({
          name: payload.track.name,
          aliases: payload.track.aliases ?? [],
          country: payload.track.country ?? null,
          city: payload.track.city ?? null,
          sims: (payload.track.sims ?? []).map((s) => ({ sim: s.sim, trackId: s.trackId ?? null })),
        });

        const layout = await repos.layouts.create({
          trackId: track.id,
          name: payload.layout.name,
          lengthMeters: payload.layout.lengthMeters,
          direction: payload.layout.direction,
          mapAssetId: null,
          outlinePath: payload.layout.outlinePath ?? null,
          rotation: payload.layout.rotation ?? null,
          racingLine: payload.layout.racingLinePath
            ? { path: payload.layout.racingLinePath, source: "manual" }
            : null,
        });

        const cornerIds = new Map<number, string>();
        for (const [order, c] of payload.corners.entries()) {
          const corner = await repos.corners.create({
            layoutId: layout.id,
            number: c.number,
            name: c.name ?? null,
            direction: c.direction,
            type: c.type ?? null,
            elevation: c.elevation ?? null,
            camber: c.camber ?? null,
            pathPosition: c.pathPosition ?? null,
            labelOffset: c.labelOffset ?? null,
            order,
            distanceFromStartMeters: c.distanceFromStartMeters ?? null,
            notes: c.notes ?? "",
            commonMistakes: c.commonMistakes ?? [],
          });
          cornerIds.set(c.number, corner.id);
        }

        // The payload schema guarantees every referenced corner number exists.
        const idOf = (n: number | null | undefined) => (n == null ? null : cornerIds.get(n)!);

        for (const s of payload.segments ?? []) {
          await repos.segments.create({
            layoutId: layout.id,
            name: s.name,
            fromCornerId: idOf(s.fromCorner),
            toCornerId: idOf(s.toCorner),
            notes: s.notes ?? "",
          });
        }

        for (const c of payload.complexes ?? []) {
          await repos.complexes.create({
            layoutId: layout.id,
            name: c.name,
            cornerIds: c.cornerNumbers.map((n) => idOf(n)!),
            notes: c.notes ?? "",
          });
        }

        return { trackId: track.id, layoutId: layout.id };
      },
    );
  }
}

export class LocalGuideImportService implements GuideImportService {
  constructor(
    private readonly db: TrackDayDb,
    private readonly repos: EntityRepositories,
  ) {}

  importGuide(payload: GuideImportPayload, options: GuideImportOptions) {
    const { db, repos } = this;
    const source = options.source ?? "ai";
    return db.transaction("rw", [db.corners, db.guides, db.cornerGuides], async () => {
      const corners = await repos.corners.listByLayout(options.layoutId);
      const byNumber = new Map(corners.map((c) => [c.number, c.id]));
      const missing = payload.corners.map((c) => c.cornerNumber).filter((n) => !byNumber.has(n));
      if (missing.length > 0) {
        throw new Error(`The layout has no corner(s) numbered ${missing.join(", ")}`);
      }

      const guide = await repos.guides.create({
        layoutId: options.layoutId,
        target: options.target,
        sim: options.sim,
        referenceLapTime: payload.guide.referenceLapTime ?? null,
        setupNotes: payload.guide.setupNotes ?? "",
        source,
      });

      for (const c of payload.corners) {
        await repos.cornerGuides.create({
          guideId: guide.id,
          cornerId: byNumber.get(c.cornerNumber)!,
          brakeReference: c.brakeReference ?? null,
          brakeMarkerMeters: c.brakeMarkerMeters ?? null,
          entrySpeedKmh: c.entrySpeedKmh ?? null,
          minSpeedKmh: c.minSpeedKmh ?? null,
          exitSpeedKmh: c.exitSpeedKmh ?? null,
          gear: c.gear ?? null,
          line: {
            turnIn: c.line?.turnIn ?? null,
            apex: c.line?.apex ?? null,
            exit: c.line?.exit ?? null,
            turnInAt: null,
            apexAt: null,
            exitAt: null,
          },
          throttleNotes: c.throttleNotes ?? "",
          trailBrakeNotes: c.trailBrakeNotes ?? "",
          priority: c.priority ?? null,
          source,
          confidence: c.confidence ?? null,
        });
      }

      return { guideId: guide.id };
    });
  }
}
