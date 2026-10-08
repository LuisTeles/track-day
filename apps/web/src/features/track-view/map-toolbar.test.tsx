import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { MapToolbar } from "./map-toolbar";

const props = () => ({
  hasMap: true,
  onZoomIn: vi.fn(),
  onZoomOut: vi.fn(),
  onReset: vi.fn(),
  chips: { on: true, disabled: false, toggle: vi.fn() },
  terrain: { on: false, disabled: false, toggle: vi.fn() },
  racingLine: { on: false, disabled: false, toggle: vi.fn() },
  editing: false,
  onToggleEdit: vi.fn(),
  carPicker: (
    <select aria-label="Car">
      <option>Miata</option>
    </select>
  ),
  listOpen: false,
  onToggleList: vi.fn(),
  redoMap: { available: true, active: false, open: vi.fn() },
  carSetup: { available: true, open: vi.fn() },
  cheatSheetHref: "/tracks/print/?track=t&layout=l&guide=g",
  onCheatSheetClick: vi.fn((e: { preventDefault(): void }) => e.preventDefault()),
  onShowShortcuts: vi.fn(),
});

describe("MapToolbar", () => {
  it("keeps the names e2e relies on", () => {
    render(<MapToolbar {...props()} />);
    for (const name of ["Zoom in", "Zoom out", "Edit", "Corners"])
      expect(screen.getByRole("button", { name })).toBeInTheDocument();
    expect(screen.getByRole("toolbar", { name: "Map controls" })).toBeInTheDocument();
  });

  it("puts the layer toggles in a Layers menu as checkboxes", async () => {
    const p = props();
    render(<MapToolbar {...p} />);
    await userEvent.click(screen.getByRole("button", { name: "Layers" }));
    expect(screen.getByRole("menuitemcheckbox", { name: "Speed & gear" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(screen.getByRole("menuitemcheckbox", { name: "Racing line" })).toHaveAttribute(
      "aria-checked",
      "false",
    );
    await userEvent.click(screen.getByRole("menuitemcheckbox", { name: "Racing line" }));
    expect(p.racingLine.toggle).toHaveBeenCalled();
  });

  it("has an Elevation & camber layer that can be disabled", async () => {
    const p = props();
    const { unmount } = render(<MapToolbar {...p} />);
    await userEvent.click(screen.getByRole("button", { name: "Layers" }));
    await userEvent.click(screen.getByRole("menuitemcheckbox", { name: "Elevation & camber" }));
    expect(p.terrain.toggle).toHaveBeenCalled();
    unmount();
    render(<MapToolbar {...p} terrain={{ ...p.terrain, disabled: true }} />);
    await userEvent.click(screen.getByRole("button", { name: "Layers" }));
    expect(screen.getByRole("menuitemcheckbox", { name: "Elevation & camber" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });

  it("puts Reset view and Redo map in the More menu", async () => {
    const p = props();
    render(<MapToolbar {...p} />);
    await userEvent.click(screen.getByRole("button", { name: "More map actions" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Reset view" }));
    expect(p.onReset).toHaveBeenCalled();
  });

  it("moves zoom into the More menu below sm, so the car picker has room", async () => {
    const p = props();
    render(<MapToolbar {...p} />);
    // One of each pair is display:none per breakpoint, so only one is ever exposed.
    expect(screen.getByRole("button", { name: "Zoom in" })).toHaveClass("max-sm:hidden");
    expect(screen.getByRole("button", { name: "Zoom out" })).toHaveClass("max-sm:hidden");
    await userEvent.click(screen.getByRole("button", { name: "More map actions" }));
    const zoomIn = screen.getByRole("menuitem", { name: "Zoom in" });
    expect(zoomIn).toHaveClass("sm:hidden");
    expect(screen.getByRole("menuitem", { name: "Zoom out" })).toHaveClass("sm:hidden");
    await userEvent.click(zoomIn);
    expect(p.onZoomIn).toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "More map actions" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Zoom out" }));
    expect(p.onZoomOut).toHaveBeenCalled();
  });

  it("opens the shortcuts help from the More menu", async () => {
    const p = props();
    render(<MapToolbar {...p} />);
    await userEvent.click(screen.getByRole("button", { name: "More map actions" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Keyboard shortcuts" }));
    expect(p.onShowShortcuts).toHaveBeenCalled();
  });

  it("shows only Edit, car and Corners without a map", () => {
    render(<MapToolbar {...props()} hasMap={false} />);
    expect(screen.queryByRole("button", { name: "Zoom in" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Layers" })).toBeNull();
    expect(screen.getByRole("button", { name: "Edit" })).toBeInTheDocument();
  });

  it("opens Car setup from the More menu", async () => {
    const p = props();
    render(<MapToolbar {...p} />);
    await userEvent.click(screen.getByRole("button", { name: "More map actions" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Car setup" }));
    expect(p.carSetup.open).toHaveBeenCalled();
  });

  it("disables Car setup with a reason when there is no car", async () => {
    const p = props();
    render(<MapToolbar {...p} carSetup={{ available: false, open: p.carSetup.open }} />);
    await userEvent.click(screen.getByRole("button", { name: "More map actions" }));
    const item = screen.getByRole("menuitem", { name: "Car setup" });
    expect(item).toHaveAttribute("aria-disabled", "true");
    expect(item).toHaveAttribute("title", "Add a car first");
  });

  it("keeps the More menu without a map, minus the map-only items", async () => {
    render(<MapToolbar {...props()} hasMap={false} />);
    await userEvent.click(screen.getByRole("button", { name: "More map actions" }));
    expect(screen.getByRole("menuitem", { name: "Car setup" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Keyboard shortcuts" })).toBeInTheDocument();
    for (const name of ["Reset view", "Redo map", "Zoom in", "Zoom out"])
      expect(screen.queryByRole("menuitem", { name })).toBeNull();
  });

  it("links to the cheat sheet through the click guard, with or without a map", async () => {
    for (const hasMap of [true, false]) {
      const p = { ...props(), hasMap };
      const { unmount } = render(<MapToolbar {...p} />);
      await userEvent.click(screen.getByRole("button", { name: "More map actions" }));
      const link = screen.getByRole("menuitem", { name: "Cheat sheet" });
      expect(link).toHaveAttribute(
        "href",
        expect.stringMatching(/^\/tracks\/print\/?\?track=t&layout=l&guide=g$/),
      );
      await userEvent.click(link);
      expect(p.onCheatSheetClick).toHaveBeenCalledTimes(1);
      unmount();
    }
  });
});
