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
});
