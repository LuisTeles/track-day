import type { Corner, Layout, Track } from "@track-day/schema";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { RepositoriesProvider } from "@/data/provider";
import type { Repositories } from "@/data/repositories";
import { NoOutline } from "./no-outline";

const corner = (number: number, name: string | null): Corner =>
  ({ id: `c${number}`, number, name, direction: "left" }) as Corner;
const track = { id: "t1", name: "Test", city: null } as Track;
const layout = {
  id: "l1",
  lengthMeters: 4309,
  direction: "clockwise",
  outlinePath: null,
} as Layout;

function renderNoOutline(onSelect = vi.fn()) {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <RepositoriesProvider repositories={{} as Repositories}>
        <NoOutline
          track={track}
          layout={layout}
          corners={[corner(1, "S do Senna"), corner(2, null)]}
          onSelect={onSelect}
        />
      </RepositoriesProvider>
    </QueryClientProvider>,
  );
  return onSelect;
}

describe("NoOutline", () => {
  it("lists the corners in lap order and selects one", async () => {
    const onSelect = renderNoOutline();
    expect(screen.getByText(/no outline yet/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /S do Senna/ }));
    expect(onSelect).toHaveBeenCalledWith("c1");
    expect(screen.getByRole("button", { name: /Unnamed/ })).toBeInTheDocument();
  });

  it("opens the OpenStreetMap panel", async () => {
    renderNoOutline();
    await userEvent.click(screen.getByRole("button", { name: "Add map from OpenStreetMap" }));
    expect(screen.getByLabelText("Circuit")).toHaveValue("Test");
  });

  it("disables Add map when the layout has no lap length, and says why", () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <RepositoriesProvider repositories={{} as Repositories}>
          <NoOutline
            track={track}
            layout={{ ...layout, lengthMeters: null }}
            corners={[corner(1, "S do Senna")]}
            onSelect={vi.fn()}
          />
        </RepositoriesProvider>
      </QueryClientProvider>,
    );
    expect(screen.getByRole("button", { name: "Add map from OpenStreetMap" })).toBeDisabled();
    expect(screen.getByText(/needs the layout's lap length/)).toBeInTheDocument();
  });
});
