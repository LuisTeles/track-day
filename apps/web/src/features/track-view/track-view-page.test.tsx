import interlagos from "@examples/interlagos.track.json";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TrackImportPayload, type Corner } from "@track-day/schema";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RepositoriesProvider } from "@/data/provider";
import type { Repositories } from "@/data/repositories";
import { TrackDayDb } from "@/data/local/db";
import { createLocalRepositories } from "@/data/local/local-repositories";
import { mockLayout } from "@/test/dom";
import { emptyCornerGuide } from "./edit/corner-guide-draft";
import { TrackViewPage } from "./track-view-page";

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
afterEach(() => db.delete());

async function open(
  params: Record<string, string>,
  seed?: (ids: { layoutId: string; guideId: string; t1: Corner }) => Promise<unknown>,
) {
  const { trackId, layoutId } = await repos.trackImport.importTrack(
    TrackImportPayload.parse(interlagos),
  );
  const cls = await repos.carClasses.create({
    name: "GT3",
    description: "",
    drivetrain: null,
    downforce: null,
  });
  const guide = await repos.guides.create({
    layoutId,
    target: { carClassId: cls.id },
    sim: null,
    referenceLapTime: null,
    setupNotes: "",
    source: "manual",
  });
  const t1 = (await repos.corners.listByLayout(layoutId)).find((c) => c.number === 1)!;
  const t2 = (await repos.corners.listByLayout(layoutId)).find((c) => c.number === 2)!;
  await seed?.({ layoutId, guideId: guide.id, t1 });
  search = new URLSearchParams({ track: trackId, layout: layoutId, guide: guide.id, ...params });
  const client = new QueryClient();
  const ui = () => (
    <QueryClientProvider client={client}>
      <RepositoriesProvider repositories={repos}>
        <TrackViewPage />
      </RepositoriesProvider>
    </QueryClientProvider>
  );
  const view = render(ui());
  rerenderPage = () => view.rerender(ui());
  return { t1, t2, guide, user: userEvent.setup() };
}

describe("TrackViewPage", () => {
  it("shows the car's notes for the selected corner", async () => {
    const { t1 } = await open({}, async ({ guideId, t1 }) => {
      await repos.cornerGuides.create({
        ...emptyCornerGuide(guideId, t1.id),
        notes: "Brake at the shadow\n2026-10-07: Turn in later",
      });
    });
    search.set("corner", t1.id);
    rerenderPage();
    const section = (await screen.findByRole("heading", { name: /GT3 · any sim/ })).closest(
      "section",
    )!;
    expect(within(section).getByText(/Brake at the shadow/)).toHaveTextContent(
      "Brake at the shadow 2026-10-07: Turn in later",
    );
  });
});

describe("TrackViewPage edit mode", () => {
  it("shows the edit forms for the selected corner", async () => {
    const { t1 } = await open({ edit: "1" });
    search.set("corner", t1.id);
    rerenderPage();
    expect(
      await screen.findByRole("form", { name: "Corner notes (all cars)" }),
    ).toBeInTheDocument();
    // The car's form waits for its stored values before it renders.
    expect(await screen.findByRole("form", { name: /GT3 · any sim/ })).toBeInTheDocument();
  });

  it("asks before leaving a corner with unsaved edits, and not otherwise", async () => {
    const { t1, t2, user } = await open({ edit: "1" });
    search.set("corner", t1.id);
    rerenderPage();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);

    // fireEvent: user-event's mousedown has no `view`, which d3-zoom chokes on.
    fireEvent.click(await screen.findByRole("button", { name: /^Turn 2,/ }));
    expect(confirm).not.toHaveBeenCalled();
    expect(search.get("corner")).toBe(t2.id);

    search.set("corner", t1.id);
    rerenderPage();
    await user.type(await screen.findByLabelText("Corner notes"), "x");
    fireEvent.click(screen.getByRole("button", { name: /^Turn 2,/ }));
    expect(confirm).toHaveBeenCalledWith("Discard unsaved changes?");
    expect(search.get("corner")).toBe(t1.id);
    confirm.mockRestore();
  });

  it("asks before opening Add car over unsaved edits", async () => {
    const { t1, user } = await open({ edit: "1" });
    search.set("corner", t1.id);
    rerenderPage();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    await user.type(await screen.findByLabelText("Corner notes"), "x");
    await user.selectOptions(screen.getByLabelText("Car"), "__add__");
    expect(confirm).toHaveBeenCalledWith("Discard unsaved changes?");
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();

    confirm.mockReturnValue(true);
    await user.selectOptions(screen.getByLabelText("Car"), "__add__");
    expect(await screen.findByRole("alertdialog")).toBeInTheDocument();
    confirm.mockRestore();
  });

  it("keeps focus and every keystroke while typing in the notes", async () => {
    const { t1, user } = await open({ edit: "1" });
    search.set("corner", t1.id);
    rerenderPage();
    const notes = await screen.findByLabelText("Corner notes");
    await user.clear(notes);
    await user.type(notes, "late brake");
    expect(notes).toHaveValue("late brake");
    expect(notes).toHaveFocus();
  });

  it("cancels a pick on Escape without closing the panel", async () => {
    const { t1, user } = await open({ edit: "1" });
    search.set("corner", t1.id);
    rerenderPage();
    const confirm = vi.spyOn(window, "confirm");
    const apex = await screen.findByRole("button", { name: /^Set apex/ });
    await user.click(apex);
    expect(screen.getByText(/Click or tap the track/)).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByText(/Click or tap the track/)).not.toBeInTheDocument();
    expect(screen.getByTestId("side-panel")).toBeInTheDocument();
    expect(search.get("corner")).toBe(t1.id);
    expect(confirm).not.toHaveBeenCalled();
    confirm.mockRestore();
  });

  it("shows the stored values after switching car with a corner open", async () => {
    let gt4 = "";
    const { t1, user } = await open({ edit: "1" }, async ({ layoutId, t1 }) => {
      const cls = await repos.carClasses.create({
        name: "GT4",
        description: "",
        drivetrain: null,
        downforce: null,
      });
      gt4 = (
        await repos.guides.create({
          layoutId,
          target: { carClassId: cls.id },
          sim: null,
          referenceLapTime: null,
          setupNotes: "",
          source: "manual",
        })
      ).id;
      await repos.cornerGuides.create({
        ...emptyCornerGuide(gt4, t1.id),
        gear: 4,
        notes: "Stay wide",
      });
    });
    search.set("corner", t1.id);
    rerenderPage();
    await screen.findByRole("form", { name: /GT3 · any sim/ });

    await user.selectOptions(screen.getByLabelText("Car"), gt4);
    const form = await screen.findByRole("form", { name: /GT4 · any sim/ });
    expect(within(form).getByLabelText("Gear")).toHaveValue("4");
    expect(within(form).getByLabelText("Car notes")).toHaveValue("Stay wide");
  });

  it("asks before the Corners button drops unsaved edits, and not otherwise", async () => {
    const { t1, user } = await open({ edit: "1" });
    search.set("corner", t1.id);
    rerenderPage();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const corners = await screen.findByRole("button", { name: "Corners" });

    await user.type(await screen.findByLabelText("Corner notes"), "x");
    await user.click(corners);
    expect(confirm).toHaveBeenCalledWith("Discard unsaved changes?");
    expect(search.get("corner")).toBe(t1.id);

    confirm.mockClear();
    fireEvent.change(screen.getByLabelText("Corner notes"), { target: { value: t1.notes } });
    await user.click(corners);
    expect(confirm).not.toHaveBeenCalled();
    expect(search.get("panel")).toBe("corners");
    confirm.mockRestore();
  });

  it("asks before Practice from T# drops unsaved edits, and not otherwise", async () => {
    const { t1, user } = await open({ edit: "1" });
    search.set("corner", t1.id);
    rerenderPage();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const link = await screen.findByRole("link", { name: "Practice from T1" });
    // Stop jsdom from navigating; fireEvent's return value says whether the
    // page's own handler cancelled the click.
    const block = (e: Event) => e.preventDefault();

    await user.type(await screen.findByLabelText("Corner notes"), "x");
    expect(fireEvent.click(link)).toBe(false);
    expect(confirm).toHaveBeenCalledWith("Discard unsaved changes?");

    confirm.mockClear();
    fireEvent.change(screen.getByLabelText("Corner notes"), { target: { value: t1.notes } });
    document.addEventListener("click", block);
    fireEvent.click(link);
    document.removeEventListener("click", block);
    expect(confirm).not.toHaveBeenCalled();
    confirm.mockRestore();
  });

  it("forgets a discarded draft once its form is gone", async () => {
    const { t1, t2, user } = await open({ edit: "1" });
    search.set("corner", t1.id);
    rerenderPage();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    await user.type(await screen.findByLabelText("Corner notes"), "x");
    await user.click(screen.getByRole("button", { name: "Corners" }));
    expect(confirm).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: /^Turn 2,/ }));
    expect(search.get("corner")).toBe(t2.id);
    expect(confirm).toHaveBeenCalledTimes(1);
    confirm.mockRestore();
  });

  it("re-measures the panel to keep the corner in view when a pick starts", async () => {
    const { t1, user } = await open({ edit: "1" });
    search.set("corner", t1.id);
    rerenderPage();
    const apex = await screen.findByRole("button", { name: /^Set apex/ });
    const rect = vi.spyOn(Element.prototype, "getBoundingClientRect");
    const panelMeasures = () =>
      rect.mock.contexts.filter((el) => (el as Element).matches("[data-testid=side-panel]")).length;
    await new Promise((r) => requestAnimationFrame(r)); // let any pending measure run
    const before = panelMeasures();

    // On a phone the pick hint changes the bottom sheet: the corner must stay clear of it.
    await user.click(apex);
    await waitFor(() => expect(panelMeasures()).toBeGreaterThan(before));
    rect.mockRestore();
  });

  it("toggles edit mode from the toolbar", async () => {
    const { user } = await open({});
    await user.click(await screen.findByRole("button", { name: "Edit" }));
    expect(search.get("edit")).toBe("1");
  });
});
