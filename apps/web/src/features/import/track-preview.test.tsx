import interlagos from "@examples/interlagos.track.json";
import { TrackImportPayload } from "@track-day/schema";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TrackPreview } from "./track-preview";

const payload = TrackImportPayload.parse(interlagos);

describe("TrackPreview", () => {
  it("summarises the track, layout and corners in lap order", () => {
    render(<TrackPreview payload={payload} existingNames={[]} />);

    expect(screen.getByText(payload.track.name)).toBeInTheDocument();
    expect(screen.getByText(/4309 m/)).toBeInTheDocument();
    const items = within(screen.getByRole("list", { name: "Corners" })).getAllByRole("listitem");
    expect(items).toHaveLength(payload.corners.length);
    expect(items[0]).toHaveTextContent("S do Senna");
    expect(screen.getByText(/From AI/)).toBeInTheDocument();
  });

  it("warns, without blocking, when a track with the same name exists", () => {
    render(
      <TrackPreview payload={payload} existingNames={[`  ${payload.track.name.toUpperCase()} `]} />,
    );
    expect(screen.getByText(/You already have a track named/)).toBeInTheDocument();
  });

  it("does not warn for a different name", () => {
    render(<TrackPreview payload={payload} existingNames={["Suzuka Circuit"]} />);
    expect(screen.queryByText(/You already have a track named/)).not.toBeInTheDocument();
  });
});
