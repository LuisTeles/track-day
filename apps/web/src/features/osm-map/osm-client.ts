import { haversine, type OsmElement, type OsmNode } from "@track-day/osm-track";

/** south, west, north, east */
export type BBox = [number, number, number, number];

export interface Place {
  id: string;
  name: string;
  description: string;
  bbox: BBox;
}

export type OsmErrorKind = "offline" | "busy" | "not-found" | "too-large" | "network";

export class OsmError extends Error {
  override name = "OsmError";
  constructor(
    readonly kind: OsmErrorKind,
    message: string,
  ) {
    super(message);
  }
}

export interface ClientOptions {
  fetch?: typeof fetch;
  retryDelayMs?: number;
}

const NOMINATIM = "https://nominatim.openstreetmap.org/search";
const OVERPASS = "https://overpass-api.de/api/interpreter";
/** A circuit fits well inside this; anything bigger is a city or region. */
const MAX_DIAGONAL_M = 10_000;

const BUSY = "OpenStreetMap is busy — try again in a minute.";
const UNREACHABLE = "Couldn’t reach OpenStreetMap.";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function request(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  options: ClientOptions,
): Promise<Response> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    throw new OsmError("offline", "Adding a map needs an internet connection.");
  }
  const doFetch = options.fetch ?? fetch;
  for (let attempt = 0; ; attempt++) {
    let res: Response;
    try {
      res = await doFetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
    } catch {
      throw new OsmError("network", UNREACHABLE);
    }
    if (res.status === 429 || res.status === 504) {
      if (attempt === 0) {
        await sleep(options.retryDelayMs ?? 5000);
        continue;
      }
      throw new OsmError("busy", BUSY);
    }
    if (!res.ok) throw new OsmError("network", `${UNREACHABLE} (HTTP ${res.status})`);
    return res;
  }
}

interface NominatimRow {
  osm_type: string;
  osm_id: number;
  name?: string;
  display_name: string;
  /** [minLat, maxLat, minLon, maxLon] as strings */
  boundingbox: [string, string, string, string];
}

/** Searches places by name. Call only on an explicit user action (Nominatim policy). */
export async function searchPlaces(query: string, options: ClientOptions = {}): Promise<Place[]> {
  const url = `${NOMINATIM}?${new URLSearchParams({ format: "jsonv2", limit: "5", q: query })}`;
  const res = await request(url, { headers: { Accept: "application/json" } }, 15_000, options);
  const rows = (await res.json()) as NominatimRow[];
  if (rows.length === 0) {
    throw new OsmError(
      "not-found",
      `No places found for “${query}”. Try the circuit’s official name or the city.`,
    );
  }
  return rows.map((r) => ({
    id: `${r.osm_type}/${r.osm_id}`,
    name: r.name || r.display_name.split(",")[0]!,
    description: r.display_name,
    bbox: [
      Number(r.boundingbox[0]),
      Number(r.boundingbox[2]),
      Number(r.boundingbox[1]),
      Number(r.boundingbox[3]),
    ],
  }));
}

const corner = (lat: number, lon: number): OsmNode => ({ type: "node", id: 0, lat, lon });

/** Raceway ways (and their nodes) inside the box — the same query as scripts/osm-outline. */
export async function fetchRaceways(
  bbox: BBox,
  options: ClientOptions = {},
): Promise<OsmElement[]> {
  const [s, w, n, e] = bbox;
  if (haversine(corner(s, w), corner(n, e)) > MAX_DIAGONAL_M) {
    throw new OsmError(
      "too-large",
      "That area is too large — pick the circuit itself, not the city.",
    );
  }
  const query = `[out:json][timeout:60];way["highway"="raceway"](${s},${w},${n},${e});out body;>;out body qt;`;
  const res = await request(
    OVERPASS,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ data: query }).toString(),
    },
    60_000,
    options,
  );
  const body = (await res.json()) as { elements?: OsmElement[]; remark?: string };
  // Overpass reports server-side timeouts as a 200 with a remark and no data.
  if (body.remark && /runtime error|timed out|out of memory/i.test(body.remark)) {
    throw new OsmError("busy", BUSY);
  }
  return body.elements ?? [];
}

export interface OsmClient {
  searchPlaces: typeof searchPlaces;
  fetchRaceways: typeof fetchRaceways;
}

export const osmClient: OsmClient = { searchPlaces, fetchRaceways };
