import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchRaceways, OsmError, searchPlaces } from "./osm-client";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const nominatimRow = {
  osm_type: "way",
  osm_id: 123,
  name: "Autódromo José Carlos Pace",
  display_name: "Autódromo José Carlos Pace, São Paulo, Brasil",
  boundingbox: ["-23.712", "-23.695", "-46.706", "-46.690"],
};
const INTERLAGOS: [number, number, number, number] = [-23.712, -46.706, -23.695, -46.69];

afterEach(() => vi.restoreAllMocks());

describe("searchPlaces", () => {
  it("queries Nominatim with the encoded text and maps the bounding box", async () => {
    const fetch = vi.fn().mockResolvedValue(json([nominatimRow]));
    const places = await searchPlaces("Autódromo José Carlos Pace São Paulo", { fetch });

    const url = new URL(fetch.mock.calls[0]![0] as string);
    expect(url.origin + url.pathname).toBe("https://nominatim.openstreetmap.org/search");
    expect(url.searchParams.get("q")).toBe("Autódromo José Carlos Pace São Paulo");
    expect(url.searchParams.get("format")).toBe("jsonv2");
    expect(url.searchParams.get("limit")).toBe("5");
    expect(places).toEqual([
      {
        id: "way/123",
        name: "Autódromo José Carlos Pace",
        description: "Autódromo José Carlos Pace, São Paulo, Brasil",
        bbox: INTERLAGOS,
      },
    ]);
  });

  it("explains an empty result", async () => {
    const fetch = vi.fn().mockResolvedValue(json([]));
    await expect(searchPlaces("Nowhere Ring", { fetch })).rejects.toMatchObject({
      kind: "not-found",
      message: expect.stringContaining("No places found for “Nowhere Ring”"),
    });
  });

  it("does not call the network when offline", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    const fetch = vi.fn();
    await expect(searchPlaces("Interlagos", { fetch })).rejects.toMatchObject({ kind: "offline" });
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("fetchRaceways", () => {
  it("posts the raceway query for the bounding box", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(json({ elements: [{ type: "node", id: 1, lat: 0, lon: 0 }] }));
    const elements = await fetchRaceways(INTERLAGOS, { fetch });

    const [url, init] = fetch.mock.calls[0]! as [string, RequestInit];
    expect(url).toBe("https://overpass-api.de/api/interpreter");
    expect(init.method).toBe("POST");
    expect(new URLSearchParams(init.body as string).get("data")).toBe(
      '[out:json][timeout:60];way["highway"="raceway"](-23.712,-46.706,-23.695,-46.69);out body;>;out body qt;',
    );
    expect(elements).toHaveLength(1);
  });

  it("retries once when Overpass is rate-limited", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(json({}, 429))
      .mockResolvedValueOnce(json({ elements: [] }));
    await expect(fetchRaceways(INTERLAGOS, { fetch, retryDelayMs: 0 })).resolves.toEqual([]);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("reports busy after a second 504", async () => {
    const fetch = vi.fn().mockResolvedValue(json({}, 504));
    await expect(fetchRaceways(INTERLAGOS, { fetch, retryDelayMs: 0 })).rejects.toMatchObject({
      kind: "busy",
    });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("treats a 200 with a timeout remark as busy, not as an empty area", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(
        json({ elements: [], remark: 'runtime error: Query timed out in "query"' }),
      );
    await expect(fetchRaceways(INTERLAGOS, { fetch })).rejects.toMatchObject({ kind: "busy" });
  });

  it("rejects an area larger than a circuit without querying", async () => {
    const fetch = vi.fn();
    await expect(fetchRaceways([-23.8, -46.8, -23.4, -46.4], { fetch })).rejects.toMatchObject({
      kind: "too-large",
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("turns a network failure into a readable error", async () => {
    const fetch = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    const error = await fetchRaceways(INTERLAGOS, { fetch }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(OsmError);
    expect(error).toMatchObject({ kind: "network", message: "Couldn’t reach OpenStreetMap." });
  });
});
