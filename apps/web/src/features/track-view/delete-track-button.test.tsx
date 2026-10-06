import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RepositoriesProvider } from "@/data/provider";
import type { Repositories } from "@/data/repositories";
import { DeleteTrackButton } from "./delete-track-button";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

function setup(deleteTrack = vi.fn().mockResolvedValue(undefined)) {
  const repos = { trackDeletion: { deleteTrack } } as unknown as Repositories;
  render(
    <QueryClientProvider client={new QueryClient()}>
      <RepositoriesProvider repositories={repos}>
        <DeleteTrackButton trackId="t1" trackName="Autódromo José Carlos Pace" />
      </RepositoriesProvider>
    </QueryClientProvider>,
  );
  return { deleteTrack, user: userEvent.setup() };
}

describe("DeleteTrackButton", () => {
  beforeEach(() => push.mockReset());

  it("asks for confirmation and does nothing on cancel", async () => {
    const { deleteTrack, user } = setup();

    await user.click(screen.getByRole("button", { name: "Delete" }));
    const dialog = screen.getByRole("alertdialog", { name: /Delete Autódromo José Carlos Pace/ });
    expect(dialog).toHaveTextContent(/Export a backup first/);

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(deleteTrack).not.toHaveBeenCalled();
  });

  it("deletes the track and goes back to the track list", async () => {
    const { deleteTrack, user } = setup();

    await user.click(screen.getByRole("button", { name: "Delete" }));
    await user.click(screen.getByRole("button", { name: "Delete track" }));

    expect(deleteTrack).toHaveBeenCalledWith("t1");
    await vi.waitFor(() => expect(push).toHaveBeenCalledWith("/"));
  });

  it("keeps the dialog open with the error when deleting fails", async () => {
    const { user } = setup(vi.fn().mockRejectedValue(new Error("Database is locked")));

    await user.click(screen.getByRole("button", { name: "Delete" }));
    await user.click(screen.getByRole("button", { name: "Delete track" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Database is locked");
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });
});
