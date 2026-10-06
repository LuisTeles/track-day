import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { OsmElement } from "@track-day/osm-track";
import type { Corner, Layout, Track } from "@track-day/schema";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import interlagosOsm from "../../../../../packages/osm-track/test/fixtures/interlagos.json";
import { RepositoriesProvider } from "@/data/provider";
import type { Repositories } from "@/data/repositories";
import { AddMapPanel } from "./add-map-panel";
import type { OsmClient, Place } from "./osm-client";

const elements = interlagosOsm.elements as OsmElement[];
const place: Place = {
  id: "way/1",
  name: "Autódromo José Carlos Pace",
  description: "São Paulo, Brasil",
  bbox: [-23.712, -46.706, -23.695, -46.69],
};
const track = { id: "t1", name: "Autódromo José Carlos Pace", city: "São Paulo" } as Track;
const layout = {
  id: "l1",
  lengthMeters: 4309,
  direction: "anticlockwise",
  outlinePath: null,
} as Layout;
const corners = [
  ...Array.from({ length: 15 }, (_, i) => ({
    id: `c${i + 1}`,
    number: i + 1,
    distanceFromStartMeters: (i + 1) * 250,
  })),
  { id: "c16", number: 16, distanceFromStartMeters: 4200 },
  { id: "c17", number: 17, distanceFromStartMeters: null },
] as Corner[];

function setup({
  client = {
    searchPlaces: vi.fn().mockResolvedValue([place]),
    fetchRaceways: vi.fn().mockResolvedValue(elements),
  } as OsmClient,
  layoutOverride = {},
} = {}) {
  const saveOutline = vi.fn().mockResolvedValue(undefined);
  const onClose = vi.fn();
  render(
    <QueryClientProvider client={new QueryClient()}>
      <RepositoriesProvider
        repositories={{ layoutGeometry: { saveOutline } } as unknown as Repositories}
      >
        <AddMapPanel
          track={track}
          layout={{ ...layout, ...layoutOverride }}
          corners={corners}
          onClose={onClose}
          client={client}
        />
      </RepositoriesProvider>
    </QueryClientProvider>,
  );
  return { client, saveOutline, onClose, user: userEvent.setup() };
}

async function searchAndPick(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Search" }));
  await user.click(await screen.findByRole("button", { name: /Autódromo José Carlos Pace/ }));
  await screen.findByRole("img", { name: /Preview/ });
}

describe("AddMapPanel", () => {
  it("prefills the search with the track name and city", () => {
    setup();
    expect(screen.getByLabelText("Circuit")).toHaveValue("Autódromo José Carlos Pace São Paulo");
  });

  it("previews the OSM loop and labels where each corner comes from", async () => {
    const { user, client } = setup();
    await searchAndPick(user);

    expect(client.fetchRaceways).toHaveBeenCalledWith(place.bbox);
    const list = screen.getByRole("list", { name: "Corner positions" });
    expect(within(list).getAllByText("Position from OpenStreetMap")).toHaveLength(15);
    expect(within(list).getByText("Placed from distance")).toBeInTheDocument();
    expect(within(list).getByText("Not on the map")).toBeInTheDocument();
    expect(screen.getByText(/Start line from OpenStreetMap/)).toBeInTheDocument();
  });

  it("saves the outline with OSM corner positions only", async () => {
    const { user, saveOutline, onClose } = setup();
    await searchAndPick(user);

    await user.click(screen.getByRole("button", { name: "Save map" }));

    expect(saveOutline).toHaveBeenCalledTimes(1);
    const input = saveOutline.mock.calls[0]![0];
    expect(input).toMatchObject({ layoutId: "l1", outlineSource: "osm" });
    expect(input.outlinePath).toMatch(/^M/);
    expect(input.cornerPositions).toHaveLength(15);
    expect(input.cornerPositions.map((p: { cornerId: string }) => p.cornerId)).not.toContain("c16");
    expect(input).not.toHaveProperty("lengthMeters");
    await vi.waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it("saves the loop the user selected, not the first one", async () => {
    const { user, saveOutline } = setup();
    await searchAndPick(user);
    const firstPath = screen
      .getByRole("img", { name: /Preview/ })
      .querySelector("path")!
      .getAttribute("d");

    await user.selectOptions(screen.getByLabelText("Loop"), "1");
    await user.click(screen.getByRole("button", { name: "Save map" }));

    expect(saveOutline.mock.calls[0]![0].outlinePath).not.toBe(firstPath);
  });

  it("offers OSM's length when the layout length is off, and saves it when chosen", async () => {
    const { user, saveOutline } = setup({ layoutOverride: { lengthMeters: 3900 } });
    await searchAndPick(user);

    await user.click(screen.getByRole("checkbox", { name: /Use OpenStreetMap's length/ }));
    await user.click(screen.getByRole("button", { name: "Save map" }));

    expect(saveOutline.mock.calls[0]![0].lengthMeters).toBeGreaterThan(4200);
  });

  it("explains a street circuit with no raceway loop", async () => {
    const { user } = setup({
      client: {
        searchPlaces: vi.fn().mockResolvedValue([place]),
        fetchRaceways: vi
          .fn()
          .mockResolvedValue(
            (await import("../../../../../packages/osm-track/test/fixtures/monaco.json"))
              .elements as OsmElement[],
          ),
      },
    });
    await user.click(screen.getByRole("button", { name: "Search" }));
    await user.click(await screen.findByRole("button", { name: /Autódromo/ }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/No loop near 4,309 m/);
    expect(alert).toHaveTextContent(/Street circuits/);
  });

  it("shows OSM client errors", async () => {
    const { OsmError } = await import("./osm-client");
    const { user } = setup({
      client: {
        searchPlaces: vi
          .fn()
          .mockRejectedValue(
            new OsmError("busy", "OpenStreetMap is busy — try again in a minute."),
          ),
        fetchRaceways: vi.fn(),
      },
    });
    await user.click(screen.getByRole("button", { name: "Search" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("OpenStreetMap is busy");
  });

  it("retries the failed request with Try again", async () => {
    const { OsmError } = await import("./osm-client");
    const searchPlaces = vi
      .fn()
      .mockRejectedValueOnce(new OsmError("network", "Couldn’t reach OpenStreetMap."))
      .mockResolvedValueOnce([place]);
    const { user } = setup({ client: { searchPlaces, fetchRaceways: vi.fn() } });
    await user.click(screen.getByRole("button", { name: "Search" }));
    await user.click(await screen.findByRole("button", { name: "Try again" }));

    expect(searchPlaces).toHaveBeenCalledTimes(2);
    expect(await screen.findByRole("button", { name: /Autódromo/ })).toBeInTheDocument();
  });

  it("ignores a slow earlier pick when a later one has already answered", async () => {
    let resolveFirst!: (e: OsmElement[]) => void;
    const other: Place = { ...place, id: "way/2", name: "Kartódromo" };
    const fetchRaceways = vi
      .fn()
      .mockImplementationOnce(() => new Promise<OsmElement[]>((r) => (resolveFirst = r)))
      .mockResolvedValueOnce([]);
    const { user } = setup({
      client: { searchPlaces: vi.fn().mockResolvedValue([place, other]), fetchRaceways },
    });
    await user.click(screen.getByRole("button", { name: "Search" }));
    await user.click(await screen.findByRole("button", { name: /Autódromo/ }));
    await user.click(screen.getByRole("button", { name: /Kartódromo/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/no circuit mapped here/);

    resolveFirst(elements);
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByRole("img", { name: /Preview/ })).not.toBeInTheDocument();
  });

  it("explains a layout without a lap length instead of searching, and can be closed", async () => {
    const { user, onClose } = setup({ layoutOverride: { lengthMeters: null } });
    expect(screen.getByText(/has no lap length/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Search" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalled();
  });

  it("drops a pick that is still loading when a new search starts", async () => {
    let resolvePick!: (e: OsmElement[]) => void;
    const searchPlaces = vi.fn().mockResolvedValue([place]);
    const fetchRaceways = vi.fn(() => new Promise<OsmElement[]>((r) => (resolvePick = r)));
    const { user } = setup({ client: { searchPlaces, fetchRaceways } });
    await user.click(screen.getByRole("button", { name: "Search" }));
    await user.click(await screen.findByRole("button", { name: /Autódromo/ }));

    await user.click(screen.getByRole("button", { name: "Search" }));
    await vi.waitFor(() => expect(searchPlaces).toHaveBeenCalledTimes(2));
    resolvePick(elements);
    await new Promise((r) => setTimeout(r, 0));

    expect(screen.queryByRole("img", { name: /Preview/ })).not.toBeInTheDocument();
  });

  it("credits OpenStreetMap under the preview", async () => {
    const { user } = setup();
    await searchAndPick(user);
    expect(screen.getByRole("link", { name: "OpenStreetMap contributors" })).toBeInTheDocument();
  });
});
