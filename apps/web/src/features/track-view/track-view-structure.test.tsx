import interlagos from "@examples/interlagos.track.json";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TrackImportPayload } from "@track-day/schema";
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

// Editing the track's structure from the track view (M2): track details,
// layouts, complexes and segments, and corners.

let search = new URLSearchParams();
const replace = vi.fn((url: string) => {
  search = new URLSearchParams(url.split("?")[1]);
  rerenderPage();
});
vi.mock("@/shared/lib/image", () => ({
  downscaleImage: (file: Blob) => Promise.resolve({ blob: file, width: 800, height: 600 }),
}));
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
  search = new URLSearchParams({ track: trackId, layout: layoutId, ...params });
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
  const corners = await repos.corners.listByLayout(layoutId);
  const t = (n: number) => corners.find((c) => c.number === n)!;
  return { trackId, layoutId, t, user: userEvent.setup() };
}

const panel = () => screen.getByTestId("side-panel");

describe("Track details", () => {
  it("reads the track and layout, and points to Edit", async () => {
    await open({ panel: "track" });
    const p = await screen.findByTestId("side-panel");
    expect(within(p).getByRole("heading", { name: "Track details" })).toBeInTheDocument();
    expect(within(p).getByText("Autódromo José Carlos Pace")).toBeInTheDocument();
    expect(within(p).getByText("4309 m")).toBeInTheDocument();
    expect(within(p).getByText(/Turn on Edit to change/)).toBeInTheDocument();
  });

  it("renames the track and sets its sims", async () => {
    const { trackId, user } = await open({ panel: "track", edit: "1" });
    const form = await screen.findByRole("form", { name: "Track details" });
    await user.clear(within(form).getByLabelText("Short names"));
    await user.type(within(form).getByLabelText("Short names"), "Interlagos, José Carlos Pace");
    await user.click(within(form).getByRole("checkbox", { name: "iRacing" }));
    await user.click(within(form).getByRole("checkbox", { name: "Real world" }));
    await user.click(within(form).getByRole("button", { name: "Save track details" }));

    await waitFor(async () =>
      expect(await repos.tracks.get(trackId)).toMatchObject({
        aliases: ["Interlagos", "José Carlos Pace"],
        sims: [
          { sim: "real-world", trackId: null },
          { sim: "assetto-corsa", trackId: null },
        ],
      }),
    );
  });

  it("edits the layout and asks before leaving unsaved changes", async () => {
    const { layoutId, user } = await open({ panel: "track", edit: "1" });
    const form = await screen.findByRole("form", { name: "Layout details" });
    await user.clear(within(form).getByLabelText("Map rotation (°)"));
    await user.type(within(form).getByLabelText("Map rotation (°)"), "90");

    await user.click(screen.getByRole("button", { name: "Corners" }));
    expect(await screen.findByRole("alertdialog")).toHaveTextContent(
      "Your track details haven’t been saved.",
    );
    await user.click(screen.getByRole("button", { name: "Keep editing" }));

    await user.click(within(form).getByRole("button", { name: "Save layout" }));
    await waitFor(async () =>
      expect(await repos.layouts.get(layoutId)).toMatchObject({ rotation: 90 }),
    );
  });

  it("adds a layout and switches to it, then deletes it", async () => {
    const { trackId, user } = await open({ panel: "track", edit: "1" });
    await user.click(await screen.findByRole("button", { name: "Add layout" }));
    const form = screen.getByRole("form", { name: "New layout" });
    await user.type(within(form).getByLabelText("Layout name"), "Outer loop");
    await user.click(within(form).getByRole("button", { name: "Add layout" }));

    await waitFor(() => expect(screen.getByRole("combobox", { name: "Layout" })).toBeVisible());
    const added = (await repos.layouts.listByTrack(trackId)).find((l) => l.name === "Outer loop")!;
    expect(search.get("layout")).toBe(added.id);

    const layoutForm = await screen.findByRole("form", { name: "Layout details" });
    await waitFor(() =>
      expect(within(layoutForm).getByLabelText("Layout name")).toHaveValue("Outer loop"),
    );
    await user.click(within(layoutForm).getByRole("button", { name: "Delete layout" }));
    await user.click(
      within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Delete layout" }),
    );
    await waitFor(async () => expect(await repos.layouts.listByTrack(trackId)).toHaveLength(1));
    await waitFor(() => expect(search.get("layout")).toBeNull());
  });

  it("adds, replaces and removes the layout's map image", async () => {
    URL.createObjectURL = vi.fn(() => "blob:map");
    URL.revokeObjectURL = vi.fn();
    const { layoutId, user } = await open({ panel: "track", edit: "1" });
    await user.upload(
      await screen.findByLabelText("Add map image"),
      new File(["png"], "map.png", { type: "image/png" }),
    );
    expect(await screen.findByRole("img", { name: "Map image of the GP layout" })).toBeVisible();
    const first = (await repos.layouts.get(layoutId))!.mapAssetId!;
    expect(await repos.assets.get(first)).toMatchObject({
      asset: { fileName: "map.png", width: 800 },
    });

    await user.upload(
      screen.getByLabelText("Replace map image"),
      new File(["png2"], "map2.png", { type: "image/png" }),
    );
    // The replace is done once the old image is gone and the buttons are back.
    await waitFor(async () => expect(await repos.assets.get(first)).toBeUndefined());
    expect((await repos.layouts.get(layoutId))!.mapAssetId).not.toBe(first);
    await waitFor(() => expect(screen.getByRole("button", { name: "Remove image" })).toBeEnabled());

    await user.click(screen.getByRole("button", { name: "Remove image" }));
    await user.click(
      within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Remove image" }),
    );
    await waitFor(async () => expect((await repos.layouts.get(layoutId))!.mapAssetId).toBeNull());
  });

  it("won't delete the last layout", async () => {
    await open({ panel: "track", edit: "1" });
    const form = await screen.findByRole("form", { name: "Layout details" });
    expect(within(form).getByRole("button", { name: "Delete layout" })).toBeDisabled();
    expect(within(form).getByText(/delete the track instead/)).toBeInTheDocument();
  });
});

describe("Complexes & segments", () => {
  it("lists them read-only", async () => {
    await open({ panel: "sections" });
    const p = await screen.findByTestId("side-panel");
    expect(within(p).getByText("S do Senna")).toBeInTheDocument();
    expect(within(p).getByText("T1 + T2")).toBeInTheDocument();
    expect(within(p).getByText("T3 → T4")).toBeInTheDocument();
    expect(within(p).queryByRole("button", { name: /Edit/ })).not.toBeInTheDocument();
  });

  it("adds a complex with corners in lap order", async () => {
    const { layoutId, t, user } = await open({ panel: "sections", edit: "1" });
    await user.click(await screen.findByRole("button", { name: "Add complex" }));
    const form = screen.getByRole("form", { name: "New complex" });
    await user.click(within(form).getByRole("button", { name: "Save new complex" }));
    expect(within(form).getByText("Give the complex a name.")).toBeInTheDocument();
    expect(within(form).getByText("Pick at least two corners.")).toBeInTheDocument();

    await user.type(within(form).getByLabelText("Name"), "Junção");
    await user.click(within(form).getByRole("checkbox", { name: "T13" }));
    await user.click(within(form).getByRole("checkbox", { name: "T12" }));
    await user.click(within(form).getByRole("button", { name: "Save new complex" }));

    await waitFor(async () =>
      expect(
        (await repos.complexes.listByLayout(layoutId)).find((c) => c.name === "Junção")?.cornerIds,
      ).toEqual([t(12).id, t(13).id]),
    );
    expect(await within(panel()).findByText("T12 + T13")).toBeInTheDocument();
  });

  it("edits and deletes a segment", async () => {
    const { layoutId, t, user } = await open({ panel: "sections", edit: "1" });
    await user.click(await screen.findByRole("button", { name: "Edit Reta Oposta" }));
    const form = screen.getByRole("form", { name: "Edit Reta Oposta" });
    await user.selectOptions(within(form).getByLabelText("To"), t(5).id);
    await user.click(within(form).getByRole("button", { name: "Save Reta Oposta" }));
    expect(await within(panel()).findByText("T3 → T5")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Edit Reta Oposta" }));
    await user.click(screen.getByRole("button", { name: "Delete segment" }));
    await user.click(
      within(await screen.findByRole("alertdialog")).getByRole("button", {
        name: "Delete segment",
      }),
    );
    await waitFor(async () => expect(await repos.segments.listByLayout(layoutId)).toEqual([]));
  });
});
