import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { OsmAttribution } from "./osm-attribution";

describe("OsmAttribution", () => {
  it("credits OpenStreetMap contributors with a link to the copyright page", () => {
    render(<OsmAttribution />);
    expect(screen.getByText(/Map data ©/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "OpenStreetMap contributors" })).toHaveAttribute(
      "href",
      "https://www.openstreetmap.org/copyright",
    );
  });
});
