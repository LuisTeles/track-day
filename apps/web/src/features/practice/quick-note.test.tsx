import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Corner } from "@track-day/schema";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { RepositoriesProvider } from "@/data/provider";
import type { Repositories } from "@/data/repositories";
import { QuickNote } from "./quick-note";

const corner = { id: "c1", number: 4, notes: "" } as Corner;

function Host({
  guideId,
  onOpenChange,
}: {
  guideId: string | null;
  onOpenChange(open: boolean): void;
}) {
  const [open, setOpen] = useState(true);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Reopen
      </button>
      <QuickNote
        trackId="t1"
        corner={corner}
        guideId={guideId}
        existing={undefined}
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          onOpenChange(next);
        }}
      />
    </>
  );
}

function setup(guideId: string | null, create = vi.fn().mockResolvedValue({})) {
  const update = vi.fn().mockResolvedValue({});
  const onOpenChange = vi.fn();
  render(
    <QueryClientProvider client={new QueryClient()}>
      <RepositoriesProvider
        repositories={{ cornerGuides: { create }, corners: { update } } as unknown as Repositories}
      >
        <Host guideId={guideId} onOpenChange={onOpenChange} />
      </RepositoriesProvider>
    </QueryClientProvider>,
  );
  return { create, update, onOpenChange, user: userEvent.setup() };
}

describe("QuickNote", () => {
  it("adds a dated note to the car for this corner", async () => {
    const { create, onOpenChange, user } = setup("g1");
    expect(screen.getByText("Saved to this car’s notes for T4.")).toBeInTheDocument();
    await user.type(screen.getByLabelText("Note"), "Braked too late");
    await user.click(screen.getByRole("button", { name: "Save note" }));
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ notes: expect.stringMatching(/: Braked too late$/) }),
    );
    await vi.waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it("saves to the corner notes without a car, and says so", async () => {
    const { update, user } = setup(null);
    expect(
      screen.getByText("No car selected: saved to the corner notes for T4."),
    ).toBeInTheDocument();
    await user.type(screen.getByLabelText("Note"), "Kerb");
    await user.click(screen.getByRole("button", { name: "Save note" }));
    expect(update).toHaveBeenCalledWith("c1", { notes: expect.stringMatching(/: Kerb$/) });
  });

  it("stays open with the text when saving fails", async () => {
    const { onOpenChange, user } = setup("g1", vi.fn().mockRejectedValue(new Error("Disk full")));
    await user.type(screen.getByLabelText("Note"), "Late");
    await user.click(screen.getByRole("button", { name: "Save note" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Disk full");
    expect(screen.getByLabelText("Note")).toHaveValue("Late");
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it("clears a stale save error when the sheet is cancelled and reopened", async () => {
    const { user } = setup("g1", vi.fn().mockRejectedValue(new Error("Disk full")));
    await user.type(screen.getByLabelText("Note"), "Late");
    await user.click(screen.getByRole("button", { name: "Save note" }));
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await vi.waitFor(() => expect(screen.queryByLabelText("Note")).not.toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "Reopen" }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save note" })).toHaveTextContent("Save");
  });

  it("closes on Escape from the Cancel button without anything else seeing the key", async () => {
    const { onOpenChange, user } = setup("g1");
    const seen = vi.fn();
    document.addEventListener("keydown", seen);
    screen.getByRole("button", { name: "Cancel" }).focus();
    await user.keyboard("{Escape}");
    document.removeEventListener("keydown", seen);
    await vi.waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(seen.mock.calls[0]![0].defaultPrevented).toBe(true);
  });
});
