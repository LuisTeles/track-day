import interlagos from "@examples/interlagos.track.json";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RepositoriesProvider } from "@/data/provider";
import type { Repositories } from "@/data/repositories";
import { TrackImportPage } from "./track-import-page";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

function setup(importTrack = vi.fn().mockResolvedValue({ trackId: "t1", layoutId: "l1" })) {
  const repos = {
    tracks: { list: vi.fn().mockResolvedValue([]) },
    trackImport: { importTrack },
  } as unknown as Repositories;
  render(
    <QueryClientProvider client={new QueryClient()}>
      <RepositoriesProvider repositories={repos}>
        <TrackImportPage />
      </RepositoriesProvider>
    </QueryClientProvider>,
  );
  return { importTrack };
}

async function pasteValid(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByLabelText("AI answer"));
  await user.paste(JSON.stringify(interlagos));
  await user.click(screen.getByRole("button", { name: "Check JSON" }));
}

describe("TrackImportPage", () => {
  beforeEach(() => push.mockReset());

  it("shows the preview only after a valid check", async () => {
    const user = userEvent.setup();
    setup();
    expect(screen.queryByRole("region", { name: "3. Check and save" })).not.toBeInTheDocument();

    await pasteValid(user);

    expect(screen.getByRole("region", { name: "3. Check and save" })).toBeInTheDocument();
  });

  it("saves once and opens the new track", async () => {
    const user = userEvent.setup();
    const { importTrack } = setup();
    await pasteValid(user);

    const save = screen.getByRole("button", { name: "Save track" });
    await user.click(save);
    await user.click(save);

    expect(importTrack).toHaveBeenCalledTimes(1);
    expect(importTrack).toHaveBeenCalledWith(expect.objectContaining({ kind: "track" }));
    await vi.waitFor(() => expect(push).toHaveBeenCalledWith("/tracks/view/?track=t1"));
  });

  it("keeps the pasted text and shows the error when saving fails", async () => {
    const user = userEvent.setup();
    setup(vi.fn().mockRejectedValue(new Error("Disk full")));
    await pasteValid(user);

    await user.click(screen.getByRole("button", { name: "Save track" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Disk full");
    expect((screen.getByLabelText("AI answer") as HTMLTextAreaElement).value).toContain(
      interlagos.track.name,
    );
    expect(push).not.toHaveBeenCalled();
  });

  it("locks the answer while saving, so a re-check can't re-enable Save", async () => {
    const user = userEvent.setup();
    setup(vi.fn(() => new Promise<never>(() => {})));
    await pasteValid(user);

    await user.click(screen.getByRole("button", { name: "Save track" }));

    expect(screen.getByRole("button", { name: "Check JSON" })).toBeDisabled();
    expect(screen.getByLabelText("AI answer")).toBeDisabled();
  });
});
