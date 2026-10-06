import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchRaceways, OVERPASS_SERVERS, searchArea, searchPlaces } from "./osm-client";

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

/** Size of a box in meters (east–west, north–south). */
function sizeOf([s, w, n, e]: [number, number, number, number]) {
  const mid = ((s + n) / 2) * (Math.PI / 180);
  return { x: (e - w) * 111_320 * Math.cos(mid), y: (n - s) * 111_320 };
}

describe("searchArea", () => {
  it("widens a point result (Monza's venue node, 8 × 11 m) to cover the circuit", () => {
    const point: [number, number, number, number] = [45.61995, 9.28795, 45.62005, 9.28805];
    const area = sizeOf(searchArea(point));
    expect(area.x).toBeGreaterThanOrEqual(3990);
    expect(area.y).toBeGreaterThanOrEqual(3990);
  });

  it("keeps a larger area centred, with a margin around it", () => {
    const big: [number, number, number, number] = [-23.73, -46.73, -23.68, -46.67];
    const before = sizeOf(big);
    const after = searchArea(big);
    expect(sizeOf(after).y).toBeCloseTo(before.y + 400, -1);
    expect((after[0] + after[2]) / 2).toBeCloseTo((big[0] + big[2]) / 2, 6);
  });

  it("rounds coordinates to keep the query short", () => {
    for (const c of searchArea(INTERLAGOS))
      expect(String(c).split(".")[1]?.length ?? 0).toBeLessThanOrEqual(6);
  });
});

describe("fetchRaceways", () => {
  it("posts the raceway query for the bounding box", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(json({ elements: [{ type: "node", id: 1, lat: 0, lon: 0 }] }));
    const elements = await fetchRaceways(INTERLAGOS, { fetch });

    const [url, init] = fetch.mock.calls[0]! as [string, RequestInit];
    expect(url).toBe(OVERPASS_SERVERS[0]);
    expect(init.method).toBe("POST");
    const [s, w, n, e] = searchArea(INTERLAGOS);
    expect(new URLSearchParams(init.body as string).get("data")).toBe(
      `[out:json][timeout:60];way["highway"="raceway"](${s},${w},${n},${e});out body;>;out body qt;`,
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

  it("rejects an area larger than a circuit without querying", async () => {
    const fetch = vi.fn();
    await expect(fetchRaceways([-23.8, -46.8, -23.4, -46.4], { fetch })).rejects.toMatchObject({
      kind: "too-large",
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("falls back to the next server when one refuses or can't be read", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(json({}, 406))
      .mockRejectedValueOnce(new TypeError("Failed to fetch")) // CORS-less error page
      .mockResolvedValueOnce(json({ elements: [{ type: "node", id: 7, lat: 0, lon: 0 }] }));
    const elements = await fetchRaceways(INTERLAGOS, { fetch });

    expect(elements).toHaveLength(1);
    expect(fetch.mock.calls.map((c) => c[0])).toEqual(OVERPASS_SERVERS.slice(0, 3));
  });

  it("explains when every map-data server fails", async () => {
    const fetch = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(fetchRaceways(INTERLAGOS, { fetch })).rejects.toMatchObject({
      kind: "busy",
      message: expect.stringContaining("map-data servers aren’t answering"),
    });
    expect(fetch).toHaveBeenCalledTimes(OVERPASS_SERVERS.length);
  });

  it("stops when the user cancels, without trying other servers", async () => {
    const controller = new AbortController();
    const fetch = vi.fn((_url: RequestInfo | URL, init?: RequestInit) => {
      controller.abort();
      return Promise.reject(init?.signal?.reason ?? new DOMException("aborted", "AbortError"));
    });
    await expect(
      fetchRaceways(INTERLAGOS, { fetch, signal: controller.signal }),
    ).rejects.toMatchObject({ kind: "cancelled" });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("works in browsers without AbortSignal.timeout (older Safari)", async () => {
    const original = AbortSignal.timeout;
    // @ts-expect-error simulating an older browser
    delete AbortSignal.timeout;
    try {
      const fetch = vi.fn().mockResolvedValue(json({ elements: [] }));
      await expect(fetchRaceways(INTERLAGOS, { fetch })).resolves.toEqual([]);
      await expect(
        searchPlaces("Interlagos", { fetch: vi.fn().mockResolvedValue(json([nominatimRow])) }),
      ).resolves.toHaveLength(1);
    } finally {
      AbortSignal.timeout = original;
    }
  });
});
