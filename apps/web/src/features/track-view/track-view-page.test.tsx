import interlagos from "@examples/interlagos.track.json";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TrackImportPayload } from "@track-day/schema";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RepositoriesProvider } from "@/data/provider";
import type { Repositories } from "@/data/repositories";
import { TrackDayDb } from "@/data/local/db";
import { createLocalRepositories } from "@/data/local/local-repositories";
import { mockLayout } from "@/test/dom";
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

async function open(params: Record<string, string>) {
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

describe("TrackViewPage edit mode", () => {
  it("shows the edit forms for the selected corner", async () => {
    const { t1 } = await open({ edit: "1" });
    search.set("corner", t1.id);
    rerenderPage();
    expect(
      await screen.findByRole("form", { name: "Corner notes (all cars)" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("form", { name: /GT3 · any sim/ })).toBeInTheDocument();
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

  it("toggles edit mode from the toolbar", async () => {
    const { user } = await open({});
    await user.click(await screen.findByRole("button", { name: "Edit" }));
    expect(search.get("edit")).toBe("1");
  });
});
