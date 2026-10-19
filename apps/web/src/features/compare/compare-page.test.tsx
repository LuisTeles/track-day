import interlagos from "@examples/interlagos.track.json";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { GuideImportPayload, TrackImportPayload } from "@track-day/schema";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RepositoriesProvider } from "@/data/provider";
import type { Repositories } from "@/data/repositories";
import { TrackDayDb } from "@/data/local/db";
import { createLocalRepositories } from "@/data/local/local-repositories";
import { ComparePage } from "./compare-page";

let search = new URLSearchParams();
const replace = vi.fn((url: string) => {
  search = new URLSearchParams(url.split("?")[1]);
  rerenderPage();
});
vi.mock("next/navigation", () => ({
  useSearchParams: () => search,
  useRouter: () => ({ replace }),
  usePathname: () => "/tracks/compare/",
}));

let db: TrackDayDb;
let repos: Repositories;
let rerenderPage = () => {};

beforeEach(() => {
  db = new TrackDayDb(`test-${crypto.randomUUID()}`);
  repos = createLocalRepositories(db);
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => db.delete());

const payload = (corners: object[]) =>
  GuideImportPayload.parse({ schemaVersion: 2, kind: "guide", guide: {}, corners });

async function open(guides: object[][], params: Record<string, string> = {}) {
  const { trackId, layoutId } = await repos.trackImport.importTrack(
    TrackImportPayload.parse(interlagos),
  );
  const ids: string[] = [];
  for (const [i, corners] of guides.entries()) {
    const cls = await repos.carClasses.create({
      name: `Class ${i + 1}`,
      description: "",
      drivetrain: null,
      downforce: null,
    });
    const { guideId } = await repos.guideImport.importGuide(payload(corners), {
      layoutId,
      target: { carClassId: cls.id },
      sim: null,
      source: "manual",
    });
    ids.push(guideId);
  }
  search = new URLSearchParams({ track: trackId, layout: layoutId, ...params });
  const client = new QueryClient();
  const ui = () => (
    <QueryClientProvider client={client}>
      <RepositoriesProvider repositories={repos}>
        <ComparePage />
      </RepositoriesProvider>
    </QueryClientProvider>
  );
  const view = render(ui());
  rerenderPage = () => view.rerender(ui());
  return { ids, layoutId, user: userEvent.setup() };
}

const cornerTable = (name: RegExp) => screen.getByRole("table", { name });

describe("ComparePage", () => {
  it("shows two cars side by side per corner, flagging differences", async () => {
    await open([
      [{ cornerNumber: 1, gear: 2, minSpeedKmh: 70 }],
      [{ cornerNumber: 1, gear: 3, minSpeedKmh: 70 }],
    ]);
    const t1 = await screen.findByRole("table", { name: /^T1 · / });
    expect(within(t1).getByRole("columnheader", { name: "Class 1 · any sim" })).toBeVisible();
    // Which car is first depends on guide order; the values must be one each.
    const gear = within(t1).getByRole("row", { name: /Gear/ });
    expect(gear.textContent).toMatch(/^Gear \(differs\)(23|32)$/);
    expect(within(t1).getByRole("row", { name: /Minimum/ })).toHaveTextContent(
      "Minimum70 km/h70 km/h",
    );
    expect(cornerTable(/^T2 · /)).toHaveTextContent("Neither car has values for this corner.");
  });

  it("switches a car from its picker, never offering the other one", async () => {
    const { ids, user } = await open([[], [], []]);
    const first = await screen.findByLabelText<HTMLSelectElement>("First car");
    const second = screen.getByLabelText<HTMLSelectElement>("Second car");
    const values = (select: HTMLSelectElement) => [...select.options].map((o) => o.value);
    expect(values(first)).not.toContain(second.value);
    expect(values(second)).not.toContain(first.value);
    const third = ids.find((id) => id !== first.value && id !== second.value)!;
    await user.selectOptions(second, third);
    expect(search.get("b")).toBe(third);
    expect(screen.getByLabelText("Second car")).toHaveValue(third);
  });

  it("needs two guides", async () => {
    await open([[]]);
    expect(
      await screen.findByText("Comparing needs two cars with a guide on this layout."),
    ).toBeInTheDocument();
  });

  it("scrolls to and highlights the corner it was opened from", async () => {
    const { layoutId } = await open([[], []]);
    const t5 = (await repos.corners.listByLayout(layoutId)).find((c) => c.number === 5)!;
    search.set("corner", t5.id);
    rerenderPage();
    const item = (await screen.findByRole("table", { name: /^T5 · / })).closest("li")!;
    expect(item.className).toContain("ring-2");
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
  });
});
