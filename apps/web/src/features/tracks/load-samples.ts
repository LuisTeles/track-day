import { GuideImportPayload, TrackImportPayload } from "@track-day/schema";
import type { Repositories } from "@/data/repositories";

/**
 * Imports the example tracks (and a sample road-car guide for Interlagos) so
 * there is something to look at. Loaded on demand to keep them out of the
 * main bundle.
 */
export async function loadSampleTracks(repos: Repositories): Promise<void> {
  const [interlagos, suzuka, roadCarGuide] = await Promise.all([
    import("@examples/interlagos.track.json"),
    import("@examples/suzuka.track.json"),
    import("@examples/interlagos.road-car.guide.json"),
  ]);

  const { layoutId } = await repos.trackImport.importTrack(
    TrackImportPayload.parse(interlagos.default),
  );
  await repos.trackImport.importTrack(TrackImportPayload.parse(suzuka.default));

  const roadCar =
    (await repos.carClasses.list()).find((c) => c.name === "Road car") ??
    (await repos.carClasses.create({
      name: "Road car",
      description: "Street-legal cars on road tyres.",
      drivetrain: null,
      downforce: "none",
    }));

  await repos.guideImport.importGuide(GuideImportPayload.parse(roadCarGuide.default), {
    layoutId,
    target: { carClassId: roadCar.id },
    sim: null,
    source: "ai",
  });
}
