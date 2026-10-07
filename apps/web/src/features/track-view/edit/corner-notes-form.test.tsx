import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Corner } from "@track-day/schema";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { RepositoriesProvider } from "@/data/provider";
import type { Repositories } from "@/data/repositories";
import { CornerNotesForm } from "./corner-notes-form";

const corner = { id: "c1", notes: "Bumpy", commonMistakes: ["Early apex"] } as Corner;

function setup(update = vi.fn().mockResolvedValue(corner)) {
  const onDirtyChange = vi.fn();
  const view = render(
    <QueryClientProvider client={new QueryClient()}>
      <RepositoriesProvider repositories={{ corners: { update } } as unknown as Repositories}>
        <CornerNotesForm trackId="t1" corner={corner} onDirtyChange={onDirtyChange} />
      </RepositoriesProvider>
    </QueryClientProvider>,
  );
  return { update, onDirtyChange, unmount: view.unmount, user: userEvent.setup() };
}

describe("CornerNotesForm", () => {
  it("saves notes and the edited list of mistakes", async () => {
    const { update, onDirtyChange, user } = setup();
    await user.type(screen.getByLabelText("Corner notes"), " on entry");
    expect(onDirtyChange).toHaveBeenLastCalledWith(true);
    await user.click(screen.getByRole("button", { name: "Add mistake" }));
    await user.type(screen.getByLabelText("Mistake 2"), "Too much kerb");
    await user.click(screen.getByRole("button", { name: "Remove mistake 1" }));
    await user.click(screen.getByRole("button", { name: "Save corner notes" }));

    expect(update).toHaveBeenCalledWith("c1", {
      notes: "Bumpy on entry",
      commonMistakes: ["Too much kerb"],
    });
    expect(await screen.findByText("Saved")).toBeInTheDocument();
    expect(onDirtyChange).toHaveBeenLastCalledWith(false);
  });

  it("drops empty mistakes and cancels back to the stored values", async () => {
    const { update, user } = setup();
    await user.click(screen.getByRole("button", { name: "Add mistake" }));
    await user.click(screen.getByRole("button", { name: "Save corner notes" }));
    expect(update).toHaveBeenCalledWith("c1", { notes: "Bumpy", commonMistakes: ["Early apex"] });

    await user.clear(screen.getByLabelText("Corner notes"));
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByLabelText("Corner notes")).toHaveValue("Bumpy");
  });

  it("keeps the input and offers retry when saving fails", async () => {
    const { user } = setup(vi.fn().mockRejectedValue(new Error("QuotaExceededError")));
    await user.type(screen.getByLabelText("Corner notes"), "!");
    await user.click(screen.getByRole("button", { name: "Save corner notes" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Could not save: QuotaExceededError",
    );
    expect(screen.getByLabelText("Corner notes")).toHaveValue("Bumpy!");
  });

  it("reports no unsaved changes once unmounted", async () => {
    const { onDirtyChange, unmount, user } = setup();
    await user.type(screen.getByLabelText("Corner notes"), " x");
    expect(onDirtyChange).toHaveBeenLastCalledWith(true);
    unmount();
    expect(onDirtyChange).toHaveBeenLastCalledWith(false);
  });
});
