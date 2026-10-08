import interlagos from "@examples/interlagos.track.json";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TrackImportPayload } from "@track-day/schema";
import { render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RepositoriesProvider } from "@/data/provider";
import type { Repositories } from "@/data/repositories";
import { TrackDayDb } from "@/data/local/db";
import { createLocalRepositories } from "@/data/local/local-repositories";
import { mockLayout } from "@/test/dom";
import { CheatSheetPage } from "./cheat-sheet-page";

let search = new URLSearchParams();
vi.mock("next/navigation", () => ({ useSearchParams: () => search }));

let db: TrackDayDb;
let repos: Repositories;
beforeEach(() => {
  mockLayout();
  db = new TrackDayDb(`test-${crypto.randomUUID()}`);
  repos = createLocalRepositories(db);
});
afterEach(() => db.delete());

async function open(opts: { setupNotes?: string; noOutline?: boolean } = {}) {
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
    setupNotes: opts.setupNotes ?? "",
    source: "manual",
  });
  if (opts.noOutline)
    await repos.layouts.update(layoutId, { outlinePath: null, outlineSource: null });
  search = new URLSearchParams({ track: trackId, layout: layoutId, guide: guide.id });
  render(
    <QueryClientProvider client={new QueryClient()}>
      <RepositoriesProvider repositories={repos}>
        <CheatSheetPage />
      </RepositoriesProvider>
    </QueryClientProvider>,
  );
}

describe("CheatSheetPage", () => {
  it("titles the sheet with the track, layout and car, one row per corner", async () => {
    await open();
    expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent(/Interlagos/);
    expect(screen.getByText(/GT3 · any sim/)).toBeInTheDocument();
    const table = screen.getByRole("table");
    expect(within(table).getAllByRole("row")).toHaveLength(1 + 15);
    expect(within(table).getByRole("cell", { name: "T1" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /^Map of .*Interlagos/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to track" })).toHaveAttribute(
      "href",
      expect.stringContaining("/tracks/view"),
    );
    expect(screen.getByRole("button", { name: "Print" })).toBeInTheDocument();
  });

  it("omits the map when the layout has no outline", async () => {
    await open({ noOutline: true });
    await screen.findByRole("table");
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("shows setup notes only when the car has them", async () => {
    await open();
    await screen.findByRole("table");
    expect(screen.queryByRole("heading", { name: "Setup notes" })).not.toBeInTheDocument();
  });

  it("prints the car's setup notes", async () => {
    await open({ setupNotes: "Front ARB stiff" });
    expect(await screen.findByRole("heading", { name: "Setup notes" })).toBeInTheDocument();
    expect(screen.getByText("Front ARB stiff")).toBeInTheDocument();
  });
});
