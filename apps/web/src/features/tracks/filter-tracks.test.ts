import { describe, expect, it } from "vitest";
import { filterTracks } from "./filter-tracks";

const t = (
  name: string,
  aliases: string[] = [],
  city: string | null = null,
  country: string | null = null,
) => ({ id: name, name, aliases, city, country }) as never;

describe("filterTracks", () => {
  const tracks = [
    t("Autódromo José Carlos Pace", ["Interlagos"], "São Paulo", "BR"),
    t("Suzuka International Racing Course", ["Suzuka"], "Suzuka", "JP"),
  ];

  it("returns everything for a blank query", () => {
    expect(filterTracks(tracks, "  ")).toHaveLength(2);
  });

  it("matches name, alias, city and country, ignoring case and accents", () => {
    expect(filterTracks(tracks, "interlagos")).toHaveLength(1);
    expect(filterTracks(tracks, "autodromo")).toHaveLength(1);
    expect(filterTracks(tracks, "sao paulo")).toHaveLength(1);
    expect(filterTracks(tracks, "jp")).toHaveLength(1);
  });
});
