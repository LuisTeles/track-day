import interlagos from "@examples/interlagos.track.json";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TrackImportPayload, type CornerGuide } from "@track-day/schema";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { RepositoriesProvider } from "@/data/provider";
import type { Repositories } from "@/data/repositories";
import { TrackDayDb } from "@/data/local/db";
import { createLocalRepositories } from "@/data/local/local-repositories";
import { emptyCornerGuide } from "./corner-guide-draft";
import { useAppendNote, useSaveCorner, useSaveCornerGuide } from "./use-edit-mutations";

let db: TrackDayDb;
let repos: Repositories;
beforeEach(() => {
  db = new TrackDayDb(`test-${crypto.randomUUID()}`);
  repos = createLocalRepositories(db);
});
afterEach(() => db.delete());

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient()}>
    <RepositoriesProvider repositories={repos}>{children}</RepositoriesProvider>
  </QueryClientProvider>
);

async function seed() {
  const { trackId, layoutId } = await repos.trackImport.importTrack(
    TrackImportPayload.parse(interlagos),
  );
  const corner = (await repos.corners.listByLayout(layoutId))[0]!;
  const classId = (
    await repos.carClasses.create({
      name: "GT3",
      description: "",
      drivetrain: null,
      downforce: null,
    })
  ).id;
  const guide = await repos.guides.create({
    layoutId,
    target: { carClassId: classId },
    sim: null,
    referenceLapTime: null,
    setupNotes: "",
    source: "manual",
    video: null,
  });
  return { trackId, corner, guideId: guide.id };
}

describe("edit mutations", () => {
  it("saves corner notes and mistakes", async () => {
    const { trackId, corner } = await seed();
    const { result } = renderHook(() => useSaveCorner(trackId), { wrapper });
    await act(() =>
      result.current.mutateAsync({
        id: corner.id,
        patch: { notes: "Bumpy", commonMistakes: ["Early apex"] },
      }),
    );
    expect(await repos.corners.get(corner.id)).toMatchObject({
      notes: "Bumpy",
      commonMistakes: ["Early apex"],
    });
  });

  it("creates a corner guide on first save, then updates it", async () => {
    const { corner, guideId } = await seed();
    const { result } = renderHook(() => useSaveCornerGuide(), { wrapper });
    const created = await act(() =>
      result.current.mutateAsync({
        guideId,
        cornerId: corner.id,
        existing: undefined,
        patch: { gear: 2 },
      }),
    );
    expect(created).toMatchObject({ gear: 2, source: "manual", notes: "" });
    await act(() =>
      result.current.mutateAsync({
        guideId,
        cornerId: corner.id,
        existing: created,
        patch: { gear: 3 },
      }),
    );
    const all = await repos.cornerGuides.listByGuide(guideId);
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({ gear: 3 });
  });

  it("marks an edited AI value as manual", async () => {
    const { corner, guideId } = await seed();
    const ai = await repos.cornerGuides.create({
      ...emptyCornerGuide(guideId, corner.id),
      source: "ai",
      confidence: "low",
    });
    const { result } = renderHook(() => useSaveCornerGuide(), { wrapper });
    await act(() =>
      result.current.mutateAsync({
        guideId,
        cornerId: corner.id,
        existing: ai,
        patch: { gear: 4 },
      }),
    );
    expect(await repos.cornerGuides.get(ai.id)).toMatchObject({
      gear: 4,
      source: "manual",
      confidence: null,
    });
  });

  it("appends a quick note to the car, or to the corner without a car", async () => {
    const { trackId, corner, guideId } = await seed();
    const { result } = renderHook(() => useAppendNote(trackId), { wrapper });
    await act(() =>
      result.current.mutateAsync({ text: "Late", corner, guideId, existing: undefined }),
    );
    const [cg] = await repos.cornerGuides.listByGuide(guideId);
    expect(cg!.notes).toMatch(/^\d{4}-\d{2}-\d{2}: Late$/);

    await act(() =>
      result.current.mutateAsync({ text: "Kerb", corner, guideId: null, existing: undefined }),
    );
    expect((await repos.corners.get(corner.id))!.notes).toMatch(/\d{4}-\d{2}-\d{2}: Kerb$/);
  });

  it("appends a quick note to a corner guide stored before notes existed", async () => {
    const { trackId, corner, guideId } = await seed();
    const legacy: Partial<CornerGuide> & { id: string } = {
      ...emptyCornerGuide(guideId, corner.id),
      id: crypto.randomUUID(),
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      deletedAt: null,
      gear: 3,
    };
    delete legacy.notes;
    await db.cornerGuides.put(legacy as never);
    const { result } = renderHook(() => useAppendNote(trackId), { wrapper });
    // The row exactly as an older build left it: no `notes` key at all.
    const existing = legacy as unknown as CornerGuide;
    await act(() =>
      result.current.mutateAsync({ text: "Turn in later", corner, guideId, existing }),
    );
    expect(await repos.cornerGuides.get(legacy.id)).toMatchObject({
      gear: 3,
      notes: expect.stringMatching(/^\d{4}-\d{2}-\d{2}: Turn in later$/),
    });
  });
});
