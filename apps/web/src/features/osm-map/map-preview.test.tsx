import type { Corner } from "@track-day/schema";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MapPreview } from "./map-preview";

const c = (number: number) => ({ id: `c${number}`, number }) as Corner;

describe("MapPreview", () => {
  it("draws the outline and a marker per placeable corner", () => {
    const { container } = render(
      <MapPreview
        outlinePath="M0 0 L100 0 L100 100 L0 100 Z"
        matched={[
          { corner: c(1), source: "osm", fraction: 0.1 },
          { corner: c(2), source: "distance", fraction: 0.5 },
          { corner: c(3), source: "none", fraction: null },
        ]}
        label="Preview of Interlagos"
      />,
    );
    expect(screen.getByRole("img", { name: "Preview of Interlagos" })).toBeInTheDocument();
    expect(container.querySelectorAll("[data-preview-corner]")).toHaveLength(2);
  });
});
