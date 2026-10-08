import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Guide } from "@track-day/schema";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { RepositoriesProvider } from "@/data/provider";
import type { Repositories } from "@/data/repositories";
import { CarSetup } from "./car-setup";

const guideWith = (setupNotes: string) => ({ id: "g1", setupNotes }) as Guide;

function setup(
  props: { setupNotes?: string; editing?: boolean },
  update = vi.fn().mockResolvedValue({}),
) {
  const onDirtyChange = vi.fn();
  const view = render(
    <QueryClientProvider client={new QueryClient()}>
      <RepositoriesProvider repositories={{ guides: { update } } as unknown as Repositories}>
        <CarSetup
          guide={guideWith(props.setupNotes ?? "")}
          label="GT3 · any sim"
          editing={props.editing ?? false}
          trackId="t1"
          onDirtyChange={onDirtyChange}
        />
      </RepositoriesProvider>
    </QueryClientProvider>,
  );
  return { update, onDirtyChange, unmount: view.unmount, user: userEvent.setup() };
}

describe("CarSetup", () => {
  it("shows the notes with their line breaks", () => {
    setup({ setupNotes: "Front 5\nRear 3" });
    const text = screen.getByText(/Front 5/);
    expect(text).toHaveClass("whitespace-pre-line");
    expect(text.textContent).toBe("Front 5\nRear 3");
  });

  it("says when there are no notes and how to add them", () => {
    setup({});
    expect(screen.getByText("No setup notes for GT3 · any sim yet.")).toBeInTheDocument();
    expect(screen.getByText("Turn on Edit to add them.")).toBeInTheDocument();
  });

  it("does not suggest Edit while editing", () => {
    setup({ editing: true });
    expect(screen.queryByText("Turn on Edit to add them.")).toBeNull();
  });

  it("saves the edited notes", async () => {
    const { update, onDirtyChange, user } = setup({ setupNotes: "Front 5", editing: true });
    const box = screen.getByLabelText("Setup notes");
    expect(box).toHaveValue("Front 5");
    expect(screen.queryByText("Unsaved changes")).toBeNull();
    await user.type(box, " rear 3");
    expect(screen.getByText("Unsaved changes")).toBeInTheDocument();
    expect(onDirtyChange).toHaveBeenLastCalledWith(true);
    await user.click(screen.getByRole("button", { name: "Save setup" }));
    expect(update).toHaveBeenCalledWith("g1", { setupNotes: "Front 5 rear 3" });
    expect(await screen.findByText("Saved")).toBeInTheDocument();
    expect(onDirtyChange).toHaveBeenLastCalledWith(false);
  });

  it("saves with Ctrl+Enter, once while pending", async () => {
    const { update, user } = setup(
      { editing: true },
      vi.fn(() => new Promise(() => {})),
    );
    await user.type(screen.getByLabelText("Setup notes"), "Soft");
    await user.keyboard("{Control>}{Enter}{Enter}{/Control}");
    expect(update).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith("g1", { setupNotes: "Soft" });
  });

  it("clears the dirty flag on unmount", async () => {
    const { onDirtyChange, unmount, user } = setup({ editing: true });
    await user.type(screen.getByLabelText("Setup notes"), "x");
    expect(onDirtyChange).toHaveBeenLastCalledWith(true);
    unmount();
    expect(onDirtyChange).toHaveBeenLastCalledWith(false);
  });
});
