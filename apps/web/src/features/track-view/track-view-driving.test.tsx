import interlagos from "@examples/interlagos.track.json";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { GuideImportPayload, TrackImportPayload, type Guide } from "@track-day/schema";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RepositoriesProvider } from "@/data/provider";
import type { Repositories } from "@/data/repositories";
import { TrackDayDb } from "@/data/local/db";
import { createLocalRepositories } from "@/data/local/local-repositories";
import { ConfirmProvider } from "@/shared/ui/confirm";
import { ToastProvider } from "@/shared/ui/toast";
import { mockLayout } from "@/test/dom";
import { TrackViewPage } from "./track-view-page";

// The car you're driving picks the guide a track opens with (ADR-004).

let search = new URLSearchParams();
const replace = vi.fn((url: string) => {
  search = new URLSearchParams(url.split("?")[1]);
  rerenderPage();
});
vi.mock("next/navigation", () => ({
  useSearchParams: () => search,
  useRouter: () => ({ replace, push: vi.fn() }),
  usePathname: () => "/tracks/view/",
}));

let db: TrackDayDb;
let repos: Repositories;
let rerenderPage = () => {};

beforeEach(() => {
  mockLayout();
  db = new TrackDayDb(`test-${crypto.randomUUID()}`);
  repos = createLocalRepositories(db);
});
afterEach(async () => {
  window.localStorage.clear();
  await db.delete();
});

const guideFor = (layoutId: string, target: Guide["target"], sim: Guide["sim"] = null) =>
  repos.guides.create({
    layoutId,
    target,
    sim,
    referenceLapTime: null,
    setupNotes: "",
    source: "manual",
    video: null,
  });

async function open(
  drive: boolean,
  params: Record<string, string> = {},
  seed?: (layoutId: string, carId: string) => Promise<unknown>,
) {
  const { trackId, layoutId } = await repos.trackImport.importTrack(
    TrackImportPayload.parse(interlagos),
  );
  const road = await repos.carClasses.create({
    name: "Road car",
    description: "",
    drivetrain: null,
    downforce: null,
  });
  const gt3 = await repos.carClasses.create({
    name: "GT3",
    description: "",
    drivetrain: null,
    downforce: null,
  });
  const car = await repos.cars.create({
    name: "Porsche 911 GT3 R",
    classId: gt3.id,
    sim: "iracing",
    powerHp: null,
    weightKg: null,
    drivetrain: null,
    downforce: null,
    transmission: null,
    abs: null,
    tc: null,
  });
  const roadGuide = await guideFor(layoutId, { carClassId: road.id });
  const classGuide = await guideFor(layoutId, { carClassId: gt3.id });
  await seed?.(layoutId, car.id);
  if (drive)
    window.localStorage.setItem("driving-with", JSON.stringify({ carId: car.id, sim: "iracing" }));
  const t1 = (await repos.corners.listByLayout(layoutId)).find((c) => c.number === 1)!;
  search = new URLSearchParams({ track: trackId, layout: layoutId, corner: t1.id, ...params });
  const client = new QueryClient();
  const ui = () => (
    <QueryClientProvider client={client}>
      <RepositoriesProvider repositories={repos}>
        <ToastProvider>
          <ConfirmProvider>
            <TrackViewPage />
          </ConfirmProvider>
        </ToastProvider>
      </RepositoriesProvider>
    </QueryClientProvider>
  );
  const view = render(ui());
  rerenderPage = () => view.rerender(ui());
  return { layoutId, car, roadGuide, classGuide, user: userEvent.setup() };
}

const picked = () => screen.getByLabelText<HTMLSelectElement>("Car").selectedOptions[0]?.text;

describe("TrackViewPage with a car you drive", () => {
  it("opens the first guide when you drive nothing", async () => {
    const { layoutId, roadGuide } = await open(false);
    const [first] = await repos.guides.listByLayout(layoutId);
    await waitFor(() =>
      expect(picked()).toBe(first!.id === roadGuide.id ? "Road car · any sim" : "GT3 · any sim"),
    );
    expect(screen.queryByRole("region", { name: "Class guide" })).not.toBeInTheDocument();
  });

  it("falls back to your car's class guide, and says so", async () => {
    await open(true);
    await waitFor(() => expect(picked()).toBe("GT3 · any sim"));
    expect(await screen.findByRole("region", { name: "Class guide" })).toHaveTextContent(
      "GT3 class guide — no Porsche 911 GT3 R guide on this layout yet.",
    );
  });

  it("prefers the car's own guide for its sim", async () => {
    await open(true, {}, async (layoutId, carId) => {
      await guideFor(layoutId, { carId }, "assetto-corsa");
      await guideFor(layoutId, { carId }, "iracing");
    });
    await waitFor(() => expect(picked()).toBe("Porsche 911 GT3 R · iRacing"));
  });

  it("lets the URL's guide win", async () => {
    const { roadGuide } = await open(true);
    search.set("guide", roadGuide.id);
    rerenderPage();
    await waitFor(() => expect(picked()).toBe("Road car · any sim"));
  });

  it("in edit mode, offers a guide for your car, preselected in Add car", async () => {
    const { layoutId, car, user } = await open(true, { edit: "1" });
    const note = await screen.findByRole("region", { name: "Class guide" });
    await user.click(
      within(note).getByRole("button", { name: "Add a guide for Porsche 911 GT3 R" }),
    );
    const dialog = await screen.findByRole("alertdialog", { name: "Add a car" });
    expect(within(dialog).getByLabelText("Which car")).toHaveValue(car.id);
    await user.click(within(dialog).getByRole("button", { name: "Add car" }));
    await waitFor(async () =>
      expect(
        (await repos.guides.listByLayout(layoutId)).some(
          (g) => "carId" in g.target && g.target.carId === car.id,
        ),
      ).toBe(true),
    );
    expect((await repos.cars.list()).length).toBe(1);
    await waitFor(() =>
      expect(screen.queryByRole("region", { name: "Class guide" })).not.toBeInTheDocument(),
    );
  });
});

describe("Confirming estimates", () => {
  async function withAiGuide(params: Record<string, string>) {
    let guideId = "";
    const opened = await open(false, params, async (layoutId) => {
      ({ guideId } = await repos.guideImport.importGuide(
        GuideImportPayload.parse({
          schemaVersion: 2,
          kind: "guide",
          guide: {},
          corners: [
            { cornerNumber: 1, gear: 2, minSpeedKmh: 70 },
            { cornerNumber: 2, gear: 3 },
          ],
        }),
        { layoutId, target: { carClassId: crypto.randomUUID() }, sim: null },
      ));
    });
    search.set("guide", guideId);
    rerenderPage();
    return { ...opened, guideId };
  }

  it("marks one corner's AI values as confirmed, keeping the numbers", async () => {
    const { guideId, user } = await withAiGuide({});
    await user.click(await screen.findByRole("button", { name: "Mark as confirmed" }));
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Mark as confirmed" })).not.toBeInTheDocument(),
    );
    expect(screen.queryByText("AI estimate")).not.toBeInTheDocument();
    const [t1] = (await repos.cornerGuides.listByGuide(guideId)).filter((g) => g.gear === 2);
    expect(t1).toMatchObject({ source: "manual", confidence: null, minSpeedKmh: 70 });
  });

  it("confirms every corner of a car from its setup panel, after asking", async () => {
    const { guideId, user } = await withAiGuide({ edit: "1", panel: "setup" });
    search.delete("corner");
    rerenderPage();
    await user.click(await screen.findByRole("button", { name: "Confirm all estimates" }));
    await user.click(
      within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Confirm all" }),
    );
    await waitFor(async () =>
      expect((await repos.cornerGuides.listByGuide(guideId)).map((g) => g.source)).toEqual([
        "manual",
        "manual",
      ]),
    );
  });
});
