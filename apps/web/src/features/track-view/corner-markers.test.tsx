import type { Corner } from "@track-day/schema";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { mockLayout } from "@/test/dom";
import { CornerMarkers, estimateLabelSize, type CornerChip } from "./corner-markers";
import { TrackCanvas } from "./track-canvas";

beforeAll(() => mockLayout());

const corner = (number: number, extra: Partial<Corner> = {}): Corner => ({
  id: `c${number}`,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  deletedAt: null,
  layoutId: "l",
  number,
  name: null,
  direction: "left",
  type: null,
  elevation: null,
  camber: null,
  pathPosition: null,
  labelOffset: null,
  order: number - 1,
  distanceFromStartMeters: null,
  notes: "",
  commonMistakes: [],
  ...extra,
});

function renderMarkers(
  corners: Corner[],
  props: { selectedId?: string; chips?: Map<string, CornerChip> } = {},
) {
  const onSelect = vi.fn();
  render(
    <TrackCanvas
      outlinePath="M 0 0 L 100 0 L 100 100 L 0 100 Z"
      label="Map"
      overlay={(ctx) => (
        <CornerMarkers
          ctx={ctx}
          layout={{ lengthMeters: 400 }}
          corners={corners}
          selectedId={props.selectedId ?? null}
          onSelect={onSelect}
          chips={props.chips}
        />
      )}
    />,
  );
  return { onSelect };
}

describe("CornerMarkers", () => {
  it("renders a marker for each corner that can be placed", () => {
    renderMarkers([
      corner(1, { pathPosition: 0.2, name: "First" }),
      corner(2, { distanceFromStartMeters: 300 }),
      corner(3),
    ]);
    expect(screen.getByRole("button", { name: "Turn 1, First" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Turn 2" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Turn 3/ })).not.toBeInTheDocument();
  });

  it("selects a corner on click and marks it pressed", async () => {
    const { onSelect } = renderMarkers([corner(1, { pathPosition: 0.2 })], { selectedId: "c1" });
    const marker = screen.getByRole("button", { name: "Turn 1" });
    expect(marker).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(marker);
    expect(onSelect).toHaveBeenCalledWith("c1");
  });

  it("shows the selected corner's name and chips with a text estimate marker", () => {
    const chips = new Map([
      ["c1", { text: "70 km/h · 2", description: "70 km/h, gear 2", estimate: true }],
    ]);
    renderMarkers([corner(1, { pathPosition: 0.2, name: "Senna" })], { selectedId: "c1", chips });
    const marker = screen.getByRole("button", { name: "Turn 1, Senna, 70 km/h, gear 2, estimate" });
    expect(marker).toHaveTextContent("Senna");
    expect(marker).toHaveTextContent("70 km/h · 2 est.");
  });

  it("draws a leader line when labels collide", () => {
    renderMarkers([corner(1, { pathPosition: 0.2 }), corner(2, { pathPosition: 0.201 })]);
    expect(screen.getByTestId("corner-markers").querySelectorAll("line")).toHaveLength(1);
  });
});

describe("estimateLabelSize", () => {
  it("grows with the name and chip", () => {
    const badge = estimateLabelSize(null, null);
    expect(badge).toEqual({ width: 26, height: 26 });
    expect(estimateLabelSize("S do Senna", null).width).toBeGreaterThan(badge.width);
    expect(estimateLabelSize("S do Senna", "70 km/h · 2").width).toBeGreaterThan(
      estimateLabelSize("S do Senna", null).width,
    );
  });
});
