import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { CornerGuide } from "@track-day/schema";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { RepositoriesProvider } from "@/data/provider";
import type { Repositories } from "@/data/repositories";
import { emptyCornerGuide } from "./corner-guide-draft";
import { CornerGuideForm } from "./corner-guide-form";

function setup(guide?: CornerGuide) {
  const create = vi.fn().mockImplementation(async (v) => ({ id: "cg1", ...v }));
  const update = vi.fn().mockImplementation(async (id, patch) => ({ ...guide, id, ...patch }));
  const onDirtyChange = vi.fn();
  const view = render(
    <QueryClientProvider client={new QueryClient()}>
      <RepositoriesProvider
        repositories={{ cornerGuides: { create, update } } as unknown as Repositories}
      >
        <CornerGuideForm
          guideId="g1"
          cornerId="c1"
          label="MX-5 · T1"
          guide={guide}
          onDirtyChange={onDirtyChange}
        />
      </RepositoriesProvider>
    </QueryClientProvider>,
  );
  return { create, update, onDirtyChange, unmount: view.unmount, user: userEvent.setup() };
}

describe("CornerGuideForm", () => {
  it("creates the corner guide on first save", async () => {
    const { create, user } = setup();
    await user.type(screen.getByLabelText("Minimum speed (km/h)"), "72");
    await user.type(screen.getByLabelText("Gear"), "3");
    await user.selectOptions(screen.getByLabelText("Brake pressure"), "firm");
    await user.type(screen.getByLabelText("Car notes"), "Brake earlier than the AI says");
    await user.click(screen.getByRole("button", { name: "Save car values" }));
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        guideId: "g1",
        cornerId: "c1",
        minSpeedKmh: 72,
        gear: 3,
        brakePressure: "firm",
        notes: "Brake earlier than the AI says",
        source: "manual",
      }),
    );
  });

  it("updates an AI guide and marks it manual", async () => {
    const ai = {
      ...emptyCornerGuide("g1", "c1"),
      id: "cg1",
      gear: 2,
      source: "ai",
      confidence: "low",
    } as CornerGuide;
    const { update, user } = setup(ai);
    expect(screen.getByLabelText("Gear")).toHaveValue("2");
    await user.clear(screen.getByLabelText("Gear"));
    await user.type(screen.getByLabelText("Gear"), "3");
    await user.click(screen.getByRole("button", { name: "Save car values" }));
    expect(update).toHaveBeenCalledWith(
      "cg1",
      expect.objectContaining({ gear: 3, source: "manual", confidence: null }),
    );
  });

  it("shows errors next to the fields and saves nothing", async () => {
    const { create, user } = setup();
    await user.type(screen.getByLabelText("Gear"), "12");
    await user.type(screen.getByLabelText("Minimum speed (km/h)"), "abc");
    await user.click(screen.getByRole("button", { name: "Save car values" }));
    expect(screen.getByLabelText("Gear")).toHaveAccessibleDescription(/.+/);
    expect(screen.getByLabelText("Minimum speed (km/h)")).toHaveAccessibleDescription(
      "Enter a number",
    );
    expect(create).not.toHaveBeenCalled();
  });

  it("counts the cue against its limit", async () => {
    const { user } = setup();
    await user.type(screen.getByLabelText("Cue"), "Late apex");
    expect(screen.getByText("9/160")).toBeInTheDocument();
  });

  it("reports no unsaved changes once unmounted", async () => {
    const { onDirtyChange, unmount, user } = setup();
    await user.type(screen.getByLabelText("Gear"), "3");
    expect(onDirtyChange).toHaveBeenLastCalledWith(true);
    unmount();
    expect(onDirtyChange).toHaveBeenLastCalledWith(false);
  });

  it("keeps field names but shows short labels with unit suffixes", () => {
    setup();
    const entry = screen.getByLabelText("Entry speed (km/h)");
    expect(entry.parentElement).toHaveTextContent("km/h");
    expect(screen.getByText("Entry", { selector: "label" })).toBeVisible();
    for (const n of [
      "Minimum speed (km/h)",
      "Exit speed (km/h)",
      "Gear",
      "Downshift to",
      "Brake board (m)",
      "Pressure (%)",
    ])
      expect(screen.getByLabelText(n)).toBeInTheDocument();
  });

  it("lays numeric fields out in two columns", () => {
    setup();
    const grid = screen.getByLabelText("Entry speed (km/h)").closest("[data-slot=field-grid]");
    expect(grid).toHaveClass("grid-cols-2");
  });

  it("saves with Ctrl/Cmd+Enter from any field", async () => {
    const { create, user } = setup();
    await user.type(screen.getByLabelText("Gear"), "3");
    await user.keyboard("{Control>}{Enter}{/Control}");
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ gear: 3 }));
  });

  it("shows Unsaved changes in the save bar only when dirty", async () => {
    const { user } = setup();
    expect(screen.queryByText("Unsaved changes")).toBeNull();
    await user.type(screen.getByLabelText("Gear"), "3");
    expect(screen.getByText("Unsaved changes")).toBeInTheDocument();
  });
});
