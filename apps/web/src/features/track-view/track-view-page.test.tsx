import interlagos from "@examples/interlagos.track.json";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TrackImportPayload, type Corner } from "@track-day/schema";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RepositoriesProvider } from "@/data/provider";
import type { Repositories } from "@/data/repositories";
import { TrackDayDb } from "@/data/local/db";
import { createLocalRepositories } from "@/data/local/local-repositories";
import { ConfirmProvider } from "@/shared/ui/confirm";
import { ToastProvider } from "@/shared/ui/toast";
import { mockLayout } from "@/test/dom";
import { emptyCornerGuide } from "./edit/corner-guide-draft";
import type { YTPlayerOptions } from "@/features/video/youtube-api";
import { TrackViewPage } from "./track-view-page";

class FakeYTPlayer {
  static instances: FakeYTPlayer[] = [];
  /** False: call `ready()` by hand. */
  static autoReady = true;
  time = 0;
  destroyed = false;
  videoId: string;
  ready: () => void;
  constructor(_el: HTMLElement, opts: YTPlayerOptions) {
    FakeYTPlayer.instances.push(this);
    this.videoId = opts.videoId;
    this.ready = () => opts.events?.onReady?.({ target: this });
    if (FakeYTPlayer.autoReady) queueMicrotask(this.ready);
  }
  seekTo(s: number) {
    this.time = s;
  }
  playVideo() {}
  pauseVideo() {}
  getCurrentTime() {
    return this.time;
  }
  getPlayerState() {
    return -1;
  }
  destroy() {
    this.destroyed = true;
  }
}
vi.mock("@/features/video/youtube-api", () => ({
  loadYouTubeApi: () => Promise.resolve({ Player: FakeYTPlayer }),
}));

let search = new URLSearchParams();
const replace = vi.fn((url: string) => {
  search = new URLSearchParams(url.split("?")[1]);
  rerenderPage();
});
const push = vi.fn();
vi.mock("next/navigation", () => ({
  useSearchParams: () => search,
  useRouter: () => ({ replace, push }),
  usePathname: () => "/tracks/view/",
}));

let db: TrackDayDb;
let repos: Repositories;
let rerenderPage = () => {};

beforeEach(() => {
  mockLayout();
  push.mockClear();
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
    video: null,
  });
  const t1 = (await repos.corners.listByLayout(layoutId)).find((c) => c.number === 1)!;
  const t2 = (await repos.corners.listByLayout(layoutId)).find((c) => c.number === 2)!;
  await seed?.({ layoutId, guideId: guide.id, t1 });
  search = new URLSearchParams({ track: trackId, layout: layoutId, guide: guide.id, ...params });
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

describe("TrackViewPage without an outline", () => {
  it("still offers the car picker", async () => {
    await open({}, ({ layoutId }) =>
      repos.layouts.update(layoutId, { outlinePath: null, outlineSource: null }),
    );
    const car = await screen.findByRole("combobox", { name: "Car" });
    expect(within(car).getByRole("option", { name: "+ Add car…" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit" })).toBeInTheDocument();
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

  const discardDialog = () =>
    screen.findByRole("alertdialog", { name: "Discard unsaved changes?" });

  it("does not ask when nothing is dirty", async () => {
    const { t1, t2 } = await open({ edit: "1" });
    search.set("corner", t1.id);
    rerenderPage();
    // fireEvent: user-event's mousedown has no `view`, which d3-zoom chokes on.
    fireEvent.click(await screen.findByRole("button", { name: /^Turn 2,/ }));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(search.get("corner")).toBe(t2.id);
  });

  it("keeps the edits and the corner on Keep editing", async () => {
    const { t1, user } = await open({ edit: "1" });
    search.set("corner", t1.id);
    rerenderPage();
    await user.type(await screen.findByLabelText("Corner notes"), "x");
    fireEvent.click(screen.getByRole("button", { name: /^Turn 2,/ }));
    await discardDialog();
    await user.click(screen.getByRole("button", { name: "Keep editing" }));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(search.get("corner")).toBe(t1.id);
    expect((screen.getByLabelText("Corner notes") as HTMLTextAreaElement).value).toMatch(/x$/);
  });

  it("moves on after Discard changes", async () => {
    const { t1, t2, user } = await open({ edit: "1" });
    search.set("corner", t1.id);
    rerenderPage();
    await user.type(await screen.findByLabelText("Corner notes"), "x");
    fireEvent.click(screen.getByRole("button", { name: /^Turn 2,/ }));
    await user.click(
      within(await discardDialog()).getByRole("button", { name: "Discard changes" }),
    );
    await waitFor(() => expect(search.get("corner")).toBe(t2.id));
  });

  it("asks before opening Add car over unsaved edits", async () => {
    const { t1, user } = await open({ edit: "1" });
    search.set("corner", t1.id);
    rerenderPage();
    await user.type(await screen.findByLabelText("Corner notes"), "x");
    await user.selectOptions(screen.getByLabelText("Car"), "__add__");
    await user.click(within(await discardDialog()).getByRole("button", { name: "Keep editing" }));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("Car"), "__add__");
    await user.click(
      within(await discardDialog()).getByRole("button", { name: "Discard changes" }),
    );
    const addCar = await screen.findByRole("alertdialog", { name: "Add a car" });
    // The second dialog is usable: focus is inside it and it takes pointer input.
    await waitFor(() => expect(addCar).toContainElement(document.activeElement as HTMLElement));
    await user.click(within(addCar).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
  });

  it("asks before following the back link, and navigates only on Discard changes", async () => {
    const { t1, user } = await open({ edit: "1" });
    search.set("corner", t1.id);
    rerenderPage();
    await user.type(await screen.findByLabelText("Corner notes"), "x");
    await user.click(screen.getByRole("link", { name: "Back to tracks" }));
    await discardDialog();
    expect(push).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Discard changes" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/"));
  });

  it("switches car only after Discard changes", async () => {
    let gt4 = "";
    const { t1, guide, user } = await open({ edit: "1" }, async ({ layoutId }) => {
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
          video: null,
        })
      ).id;
    });
    search.set("corner", t1.id);
    rerenderPage();
    await user.type(await screen.findByLabelText("Corner notes"), "x");

    await user.selectOptions(screen.getByLabelText("Car"), gt4);
    await user.click(within(await discardDialog()).getByRole("button", { name: "Keep editing" }));
    expect(search.get("guide")).toBe(guide.id);
    expect((screen.getByLabelText("Corner notes") as HTMLTextAreaElement).value).toMatch(/x$/);

    await user.selectOptions(screen.getByLabelText("Car"), gt4);
    await user.click(
      within(await discardDialog()).getByRole("button", { name: "Discard changes" }),
    );
    await waitFor(() => expect(search.get("guide")).toBe(gt4));
  });

  it("switches layout only after Discard changes", async () => {
    let short = "";
    const { t1, user } = await open({ edit: "1" }, async ({ layoutId }) => {
      const { id, createdAt, updatedAt, deletedAt, ...gp } = (await repos.layouts.get(layoutId))!;
      void [id, createdAt, updatedAt, deletedAt];
      short = (await repos.layouts.create({ ...gp, name: "Short" })).id;
    });
    const layoutId = search.get("layout");
    search.set("corner", t1.id);
    rerenderPage();
    await user.type(await screen.findByLabelText("Corner notes"), "x");

    await user.selectOptions(screen.getByLabelText("Layout"), short);
    await user.click(within(await discardDialog()).getByRole("button", { name: "Keep editing" }));
    expect(search.get("layout")).toBe(layoutId);
    expect(search.get("corner")).toBe(t1.id);
    expect((screen.getByLabelText("Corner notes") as HTMLTextAreaElement).value).toMatch(/x$/);

    await user.selectOptions(screen.getByLabelText("Layout"), short);
    await user.click(
      within(await discardDialog()).getByRole("button", { name: "Discard changes" }),
    );
    await waitFor(() => expect(search.get("layout")).toBe(short));
    expect(search.get("corner")).toBeNull();
  });

  it("asks before the top-bar Practice link, and navigates only on Discard changes", async () => {
    const { t1, user } = await open({ edit: "1" });
    search.set("corner", t1.id);
    rerenderPage();
    await user.type(await screen.findByLabelText("Corner notes"), "x");
    const link = screen.getByRole("link", { name: "Practice" });

    expect(fireEvent.click(link)).toBe(false);
    await user.click(within(await discardDialog()).getByRole("button", { name: "Keep editing" }));
    expect(push).not.toHaveBeenCalled();

    expect(fireEvent.click(link)).toBe(false);
    await user.click(
      within(await discardDialog()).getByRole("button", { name: "Discard changes" }),
    );
    await waitFor(() =>
      expect(push).toHaveBeenCalledWith(expect.stringMatching(/^\/tracks\/practice\/\?.*corner=1/)),
    );
  });

  it("closes only the dialog on Escape, leaving the panel open", async () => {
    const { t1, user } = await open({ edit: "1" });
    search.set("corner", t1.id);
    rerenderPage();
    await user.type(await screen.findByLabelText("Corner notes"), "x");
    fireEvent.click(screen.getByRole("button", { name: /^Turn 2,/ }));
    await discardDialog();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(screen.getByTestId("side-panel")).toBeInTheDocument();
    expect(search.get("corner")).toBe(t1.id);
  });

  it("closes only the far-point dialog on Escape, keeping the pick", async () => {
    const { t1, user } = await open({ edit: "1" });
    search.set("corner", t1.id);
    rerenderPage();
    await user.click(await screen.findByRole("button", { name: /^Set apex/ }));
    // A click on the map far from Turn 1 asks first.
    fireEvent.click(screen.getByRole("img", { name: /^Map of / }).parentElement!);
    await screen.findByRole("alertdialog", { name: /^Place the apex \d+ m from the corner\?$/ });
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(screen.getByText(/Click or tap the track/)).toBeInTheDocument();
    expect(screen.getByTestId("side-panel")).toBeInTheDocument();
    expect(search.get("corner")).toBe(t1.id);
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
    const apex = await screen.findByRole("button", { name: /^Set apex/ });
    await user.click(apex);
    expect(screen.getByText(/Click or tap the track/)).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByText(/Click or tap the track/)).not.toBeInTheDocument();
    expect(screen.getByTestId("side-panel")).toBeInTheDocument();
    expect(search.get("corner")).toBe(t1.id);
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("closes a menu opened over a pick on Escape before cancelling the pick", async () => {
    const { t1, user } = await open({ edit: "1" });
    search.set("corner", t1.id);
    rerenderPage();
    await user.click(await screen.findByRole("button", { name: /^Set apex/ }));
    expect(screen.getByText(/Click or tap the track/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Layers" }));
    expect(await screen.findByRole("menu")).toBeInTheDocument();

    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("menu")).not.toBeInTheDocument());
    expect(screen.getByText(/Click or tap the track/)).toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(screen.queryByText(/Click or tap the track/)).not.toBeInTheDocument();
    expect(screen.getByTestId("side-panel")).toBeInTheDocument();
    expect(search.get("corner")).toBe(t1.id);
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
          video: null,
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
    const corners = await screen.findByRole("button", { name: "Corners" });

    await user.type(await screen.findByLabelText("Corner notes"), "x");
    await user.click(corners);
    await user.click(within(await discardDialog()).getByRole("button", { name: "Keep editing" }));
    expect(search.get("corner")).toBe(t1.id);

    fireEvent.change(screen.getByLabelText("Corner notes"), { target: { value: t1.notes } });
    await user.click(corners);
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(search.get("panel")).toBe("corners");
  });

  it("asks before Practice from T# drops unsaved edits, and not otherwise", async () => {
    const { t1, user } = await open({ edit: "1" });
    search.set("corner", t1.id);
    rerenderPage();
    const link = await screen.findByRole("link", { name: "Practice from T1" });
    // Stop jsdom from navigating; fireEvent's return value says whether the
    // page's own handler cancelled the click.
    const block = (e: Event) => e.preventDefault();

    await user.type(await screen.findByLabelText("Corner notes"), "x");
    expect(fireEvent.click(link)).toBe(false);
    await user.click(within(await discardDialog()).getByRole("button", { name: "Keep editing" }));
    expect(push).not.toHaveBeenCalled();

    expect(fireEvent.click(link)).toBe(false);
    await user.click(
      within(await discardDialog()).getByRole("button", { name: "Discard changes" }),
    );
    await waitFor(() =>
      expect(push).toHaveBeenCalledWith(expect.stringMatching(/^\/tracks\/practice\/\?.*corner=1/)),
    );
    push.mockClear();

    fireEvent.change(screen.getByLabelText("Corner notes"), { target: { value: t1.notes } });
    document.addEventListener("click", block);
    fireEvent.click(link);
    document.removeEventListener("click", block);
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(push).not.toHaveBeenCalled(); // the link navigates by itself
  });

  it("leaves modified clicks on Practice from T# to the browser", async () => {
    const { t1, user } = await open({ edit: "1" });
    search.set("corner", t1.id);
    rerenderPage();
    const link = await screen.findByRole("link", { name: "Practice from T1" });
    const block = (e: Event) => e.preventDefault();
    await user.type(await screen.findByLabelText("Corner notes"), "x");
    document.addEventListener("click", block);
    fireEvent.click(link, { ctrlKey: true }); // new tab: these edits stay put
    document.removeEventListener("click", block);
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
    expect((screen.getByLabelText("Corner notes") as HTMLTextAreaElement).value).toMatch(/x$/);
  });

  it("forgets a discarded draft once its form is gone", async () => {
    const { t1, t2, user } = await open({ edit: "1" });
    search.set("corner", t1.id);
    rerenderPage();
    await user.type(await screen.findByLabelText("Corner notes"), "x");
    await user.click(screen.getByRole("button", { name: "Corners" }));
    await user.click(
      within(await discardDialog()).getByRole("button", { name: "Discard changes" }),
    );
    await waitFor(() => expect(search.get("panel")).toBe("corners"));

    fireEvent.click(screen.getByRole("button", { name: /^Turn 2,/ }));
    expect(search.get("corner")).toBe(t2.id);
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
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

  it("shows a failed clear, and drops the error on another corner", async () => {
    const { t1, t2, user } = await open({ edit: "1" }, ({ guideId, t1 }) =>
      repos.cornerGuides.create({
        ...emptyCornerGuide(guideId, t1.id),
        line: { turnIn: null, apex: null, exit: null, turnInAt: null, apexAt: 0.02, exitAt: null },
      }),
    );
    search.set("corner", t1.id);
    rerenderPage();
    vi.spyOn(repos.cornerGuides, "update").mockRejectedValueOnce(new Error("Disk full"));
    await user.click(await screen.findByRole("button", { name: "Clear apex" }));
    expect(await screen.findByText("Could not save: Disk full")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /^Turn 2,/ }));
    expect(search.get("corner")).toBe(t2.id);
    await screen.findByRole("form", { name: /GT3 · any sim · T2/ });
    expect(screen.queryByText("Could not save: Disk full")).not.toBeInTheDocument();
  });

  it("toggles edit mode from the toolbar", async () => {
    const { user } = await open({});
    await user.click(await screen.findByRole("button", { name: "Edit" }));
    expect(search.get("edit")).toBe("1");
  });
});

describe("TrackViewPage shortcuts", () => {
  it("moves between corners with ] and [", async () => {
    const { t1, t2, user } = await open({});
    search.set("corner", t1.id);
    rerenderPage();
    await screen.findByTestId("side-panel");
    document.body.focus();
    await user.keyboard("]");
    expect(search.get("corner")).toBe(t2.id);
    await user.keyboard("[["); // "[[" is the literal "[" in user-event syntax
    expect(search.get("corner")).toBe(t1.id);
  });

  it("toggles edit mode with e, but not while typing in a field", async () => {
    const { t1, user } = await open({});
    search.set("corner", t1.id);
    rerenderPage();
    await screen.findByTestId("side-panel");
    document.body.focus();
    await user.keyboard("e");
    expect(search.get("edit")).toBe("1");

    const notes = await screen.findByLabelText("Corner notes");
    await user.click(notes);
    await user.keyboard("e");
    expect(search.get("edit")).toBe("1");
    expect((notes as HTMLTextAreaElement).value).toMatch(/e$/);
  });

  it("opens the shortcuts help with ?", async () => {
    await open({});
    await screen.findByRole("toolbar", { name: "Map controls" });
    document.body.focus();
    await userEvent.keyboard("?");
    expect(
      await screen.findByRole("alertdialog", { name: "Keyboard shortcuts" }),
    ).toBeInTheDocument();
  });
});

describe("TrackViewPage car setup", () => {
  const openSetup = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.click(await screen.findByRole("button", { name: "More map actions" }));
    await user.click(screen.getByRole("menuitem", { name: "Car setup" }));
  };

  it("opens the car's setup from the More menu", async () => {
    const { user } = await open({}, async ({ guideId }) => {
      await repos.guides.update(guideId, { setupNotes: "Front 5\nRear 3" });
    });
    await openSetup(user);
    expect(search.get("panel")).toBe("setup");
    expect(await screen.findByRole("heading", { name: "Setup · GT3 · any sim" })).toBeVisible();
    expect(await screen.findByText(/Front 5/)).toHaveClass("whitespace-pre-line");
  });

  it("opens setup in edit mode as a form", async () => {
    await open({ edit: "1", panel: "setup" });
    expect(await screen.findByLabelText("Setup notes")).toBeInTheDocument();
  });

  it("asks before a marker click drops unsaved setup edits", async () => {
    const { user } = await open({ edit: "1", panel: "setup" });
    await user.type(await screen.findByLabelText("Setup notes"), "Soft springs");
    fireEvent.click(screen.getByRole("button", { name: /^Turn 2,/ }));
    const dialog = await screen.findByRole("alertdialog", { name: "Discard unsaved changes?" });
    expect(within(dialog).getByText("Your setup notes haven’t been saved.")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Keep editing" }));
    expect(search.get("panel")).toBe("setup");
    expect(screen.getByLabelText("Setup notes")).toHaveValue("Soft springs");
  });

  it("asks before the cheat sheet link drops unsaved setup edits", async () => {
    const { user } = await open({ edit: "1", panel: "setup" });
    await user.type(await screen.findByLabelText("Setup notes"), "Soft springs");
    await user.click(screen.getByRole("button", { name: "More map actions" }));
    await user.click(screen.getByRole("menuitem", { name: "Cheat sheet" }));
    await screen.findByRole("alertdialog", { name: "Discard unsaved changes?" });
    await user.click(screen.getByRole("button", { name: "Keep editing" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(push).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Setup notes")).toHaveValue("Soft springs");
    expect(document.body.style.pointerEvents).not.toBe("none");
  });

  it("selecting a corner closes setup", async () => {
    const { t2 } = await open({ panel: "setup" });
    fireEvent.click(await screen.findByRole("button", { name: /^Turn 2,/ }));
    await waitFor(() => expect(search.get("corner")).toBe(t2.id));
    expect(search.get("panel")).toBeNull();
  });

  it("opening setup clears the selected corner", async () => {
    const { t1, user } = await open({});
    search.set("corner", t1.id);
    rerenderPage();
    await openSetup(user);
    expect(search.get("corner")).toBeNull();
    expect(search.get("panel")).toBe("setup");
  });

  it("disables Car setup without a car", async () => {
    const { user } = await open({}, async ({ guideId }) => {
      await repos.guides.remove(guideId);
    });
    await user.click(await screen.findByRole("button", { name: "More map actions" }));
    expect(screen.getByRole("menuitem", { name: "Car setup" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });
});

describe("TrackViewPage reference video", () => {
  const openVideo = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.click(await screen.findByRole("button", { name: "More map actions" }));
    await user.click(screen.getByRole("menuitem", { name: "Reference video" }));
  };
  const withVideo = ({ guideId, t1 }: { guideId: string; t1: Corner }) =>
    repos.guides.update(guideId, {
      video: {
        source: "youtube",
        youtubeId: "dQw4w9WgXcQ",
        lapStartSec: 5,
        lapEndSec: null,
        marks: [{ cornerId: t1.id, sec: 12.5 }],
      },
    });
  beforeEach(() => {
    FakeYTPlayer.instances = [];
    FakeYTPlayer.autoReady = true;
  });

  it("switching car remounts the player for that car's video and drops a pending seek", async () => {
    let other = "";
    const { user } = await open({ panel: "video" }, async (ids) => {
      await withVideo(ids);
      const cls = await repos.carClasses.create({
        name: "GT4",
        description: "",
        drivetrain: null,
        downforce: null,
      });
      other = (
        await repos.guides.create({
          layoutId: ids.layoutId,
          target: { carClassId: cls.id },
          sim: null,
          referenceLapTime: null,
          setupNotes: "",
          source: "manual",
          video: {
            source: "youtube",
            youtubeId: "abcdefghijk",
            lapStartSec: null,
            lapEndSec: null,
            marks: [],
          },
        })
      ).id;
    });
    FakeYTPlayer.autoReady = false;
    await waitFor(() => expect(FakeYTPlayer.instances).toHaveLength(1));
    const first = FakeYTPlayer.instances[0]!;
    // Not ready yet: the seek waits for the player.
    fireEvent.click(screen.getByRole("button", { name: /^Turn 1,/ }));
    expect(first.time).toBe(0);

    await user.selectOptions(screen.getByLabelText("Car"), other);
    await waitFor(() => expect(FakeYTPlayer.instances).toHaveLength(2));
    expect(first.destroyed).toBe(true);
    const second = FakeYTPlayer.instances[1]!;
    expect(second.videoId).toBe("abcdefghijk");
    expect(await screen.findByRole("heading", { name: "Video · GT4 · any sim" })).toBeVisible();
    act(() => second.ready());
    expect(second.time).toBe(0);
  });

  it("closes the video panel after adding a car", async () => {
    const { user } = await open({ panel: "video" }, async ({ guideId }) => {
      await repos.guides.remove(guideId);
    });
    search.delete("guide");
    rerenderPage();
    await user.selectOptions(await screen.findByLabelText("Car"), "__add__");
    const dialog = await screen.findByRole("alertdialog", { name: "Add a car" });
    await user.type(within(dialog).getByLabelText("Car name"), "Mazda MX-5");
    await user.click(within(dialog).getByRole("button", { name: "Add car" }));
    await waitFor(() => expect(search.get("guide")).not.toBeNull());
    expect(search.get("panel")).toBeNull();
    expect(screen.queryByRole("heading", { name: /^Video · / })).toBeNull();
  });

  it("opens from the More menu, clearing the selected corner", async () => {
    const { t1, user } = await open({});
    search.set("corner", t1.id);
    rerenderPage();
    await openVideo(user);
    expect(search.get("panel")).toBe("video");
    expect(search.get("corner")).toBeNull();
    expect(await screen.findByRole("heading", { name: "Video · GT3 · any sim" })).toBeVisible();
    expect(screen.getByLabelText("Paste a YouTube link")).toBeInTheDocument();
  });

  it("asks before opening over unsaved edits", async () => {
    const { user } = await open({ edit: "1", panel: "setup" });
    await user.type(await screen.findByLabelText("Setup notes"), "Soft springs");
    await openVideo(user);
    await screen.findByRole("alertdialog", { name: "Discard unsaved changes?" });
    await user.click(screen.getByRole("button", { name: "Keep editing" }));
    expect(search.get("panel")).toBe("setup");
  });

  it("disables Reference video without a car", async () => {
    const { user } = await open({}, async ({ guideId }) => {
      await repos.guides.remove(guideId);
    });
    await user.click(await screen.findByRole("button", { name: "More map actions" }));
    const item = screen.getByRole("menuitem", { name: "Reference video" });
    expect(item).toHaveAttribute("aria-disabled", "true");
    expect(item).toHaveAttribute("title", "Add a car first");
  });

  it("seeks to a marked corner from the map instead of opening its card", async () => {
    await open({ panel: "video" }, withVideo);
    await waitFor(() => expect(FakeYTPlayer.instances).toHaveLength(1));
    await act(() => Promise.resolve()); // onReady
    const t1Marker = screen.getByRole("button", { name: /^Turn 1,/ });
    fireEvent.click(t1Marker);
    expect(FakeYTPlayer.instances[0]!.time).toBe(12.5);
    expect(search.get("corner")).toBeNull();
    expect(search.get("panel")).toBe("video");
    // The corner whose mark is current is the selected marker.
    await waitFor(() => expect(t1Marker).toHaveAttribute("aria-pressed", "true"));
  });

  it("says when a clicked corner isn't marked yet", async () => {
    await open({ panel: "video" }, withVideo);
    await waitFor(() => expect(FakeYTPlayer.instances).toHaveLength(1));
    fireEvent.click(screen.getByRole("button", { name: /^Turn 2,/ }));
    expect(await screen.findByText("T2 isn't marked yet.")).toBeInTheDocument();
    expect(search.get("corner")).toBeNull();
    expect(FakeYTPlayer.instances[0]!.time).toBe(0);
  });

  it("seeks from the panel's corner list", async () => {
    const { user } = await open({ panel: "video" }, withVideo);
    await waitFor(() => expect(FakeYTPlayer.instances).toHaveLength(1));
    await act(() => Promise.resolve());
    await user.click(screen.getByRole("button", { name: /^T1 .* · 0:12\.5$/ }));
    expect(FakeYTPlayer.instances[0]!.time).toBe(12.5);
  });

  it("stops the player when the panel closes", async () => {
    const { user } = await open({ panel: "video" }, withVideo);
    await waitFor(() => expect(FakeYTPlayer.instances).toHaveLength(1));
    await user.click(screen.getByRole("button", { name: "Close panel" }));
    expect(search.get("panel")).toBeNull();
    await waitFor(() => expect(FakeYTPlayer.instances[0]!.destroyed).toBe(true));
    // Markers open the corner card again.
    fireEvent.click(screen.getByRole("button", { name: /^Turn 2,/ }));
    expect(search.get("corner")).not.toBeNull();
  });
});
