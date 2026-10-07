import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { CornerGuide } from "@track-day/schema";
import { act, render, renderHook, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { RepositoriesProvider } from "@/data/provider";
import type { Repositories } from "@/data/repositories";
import { emptyCornerGuide } from "./corner-guide-draft";
import { LinePoints, useLinePointPick } from "./line-points";

const guide = (line: Partial<CornerGuide["line"]> = {}) =>
  ({
    ...emptyCornerGuide("g1", "c1"),
    id: "cg1",
    line: {
      turnIn: null,
      apex: null,
      exit: null,
      turnInAt: null,
      apexAt: 0.5,
      exitAt: null,
      ...line,
    },
  }) as CornerGuide;

function wrap(repos: Partial<Repositories>) {
  const client = new QueryClient();
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>
        <RepositoriesProvider repositories={repos as Repositories}>{children}</RepositoriesProvider>
      </QueryClientProvider>
    );
  }
  return Wrapper;
}

describe("useLinePointPick", () => {
  const base = { guideId: "g1", cornerId: "c1", cornerFraction: 0.5, lengthMeters: 4000 };

  it("saves a point that keeps the order", async () => {
    const update = vi.fn().mockResolvedValue(guide());
    const onDone = vi.fn();
    const { result } = renderHook(
      () => useLinePointPick({ ...base, guide: guide(), point: "turnIn", onDone }),
      { wrapper: wrap({ cornerGuides: { update } as never }) },
    );
    await act(async () => result.current(0.49));
    expect(update).toHaveBeenCalledWith(
      "cg1",
      expect.objectContaining({ line: expect.objectContaining({ turnInAt: 0.49, apexAt: 0.5 }) }),
    );
    expect(onDone).toHaveBeenCalled();
  });

  it("refuses a point out of order", async () => {
    const update = vi.fn();
    const onError = vi.fn();
    const { result } = renderHook(
      () =>
        useLinePointPick({ ...base, guide: guide(), point: "turnIn", onDone: vi.fn(), onError }),
      { wrapper: wrap({ cornerGuides: { update } as never }) },
    );
    await act(async () => result.current(0.51));
    expect(update).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith("Turn-in must come before the apex and exit.");
  });

  it("asks before saving a point far from the corner", async () => {
    const update = vi.fn().mockResolvedValue(guide());
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const { result } = renderHook(
      () => useLinePointPick({ ...base, guide: guide(), point: "exit", onDone: vi.fn() }),
      { wrapper: wrap({ cornerGuides: { update } as never }) },
    );
    await act(async () => result.current(0.6)); // 400 m after the corner
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining("400 m"));
    expect(update).not.toHaveBeenCalled();
    confirm.mockRestore();
  });
});

describe("LinePoints", () => {
  it("starts picking, clears a point, and is disabled without an outline", async () => {
    const update = vi.fn().mockResolvedValue(guide());
    const onPickStart = vi.fn();
    const props = {
      guideId: "g1",
      cornerId: "c1",
      guide: guide(),
      cornerFraction: 0.5,
      lengthMeters: 4000,
      picking: null,
      onPickStart,
      onPickEnd: vi.fn(),
    };
    const Wrapper = wrap({ cornerGuides: { update } as never });
    const { rerender } = render(<LinePoints {...props} hasOutline />, { wrapper: Wrapper });
    await userEvent.click(screen.getByRole("button", { name: "Set turn-in" }));
    expect(onPickStart).toHaveBeenCalledWith("turnIn");
    await userEvent.click(screen.getByRole("button", { name: "Clear apex" }));
    expect(update).toHaveBeenCalledWith(
      "cg1",
      expect.objectContaining({ line: expect.objectContaining({ apexAt: null }) }),
    );

    rerender(<LinePoints {...props} hasOutline={false} />);
    expect(screen.getByRole("button", { name: "Set apex" })).toBeDisabled();
    expect(screen.getByText(/Add a map from OpenStreetMap/)).toBeInTheDocument();
  });
});
