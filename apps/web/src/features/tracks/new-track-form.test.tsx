import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RepositoriesProvider } from "@/data/provider";
import type { Repositories } from "@/data/repositories";
import { NewTrackForm } from "./new-track-form";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

function setup(createTrack = vi.fn().mockResolvedValue({ id: "t1" })) {
  const createLayout = vi.fn().mockResolvedValue({ id: "l1" });
  const repos = {
    tracks: { create: createTrack },
    layouts: { create: createLayout },
  } as unknown as Repositories;
  render(
    <QueryClientProvider client={new QueryClient()}>
      <RepositoriesProvider repositories={repos}>
        <NewTrackForm />
      </RepositoriesProvider>
    </QueryClientProvider>,
  );
  return { createTrack, createLayout, user: userEvent.setup() };
}

describe("NewTrackForm", () => {
  beforeEach(() => push.mockReset());

  it("creates the track and its first layout, then opens it for editing", async () => {
    const { createTrack, createLayout, user } = setup();
    await user.type(screen.getByLabelText("Track name"), "Autódromo José Carlos Pace");
    await user.type(screen.getByLabelText("Short name"), "Interlagos");
    await user.type(screen.getByLabelText("City"), "São Paulo");
    await user.type(screen.getByLabelText("Country"), "Brazil");
    await user.type(screen.getByLabelText("Lap length (m)"), "4309");
    await user.selectOptions(screen.getByLabelText("Direction"), "anticlockwise");
    await user.click(screen.getByRole("button", { name: "Create track" }));

    expect(createTrack).toHaveBeenCalledWith({
      name: "Autódromo José Carlos Pace",
      aliases: ["Interlagos"],
      city: "São Paulo",
      country: "Brazil",
      sims: [],
    });
    expect(createLayout).toHaveBeenCalledWith({
      trackId: "t1",
      name: "Full circuit",
      lengthMeters: 4309,
      direction: "anticlockwise",
      mapAssetId: null,
      outlinePath: null,
      rotation: null,
      racingLine: null,
    });
    expect(push).toHaveBeenCalledWith("/tracks/view/?track=t1&layout=l1&edit=1&panel=corners");
  });

  it("needs a name and a positive lap length", async () => {
    const { createTrack, user } = setup();
    await user.type(screen.getByLabelText("Lap length (m)"), "-5");
    await user.click(screen.getByRole("button", { name: "Create track" }));

    expect(screen.getByText("Give the track a name.")).toBeInTheDocument();
    expect(screen.getByText("Enter the lap length in meters, e.g. 4309.")).toBeVisible();
    expect(createTrack).not.toHaveBeenCalled();
  });

  it("leaves optional fields empty as null", async () => {
    const { createTrack, createLayout, user } = setup();
    await user.type(screen.getByLabelText("Track name"), "Kart track");
    await user.click(screen.getByRole("button", { name: "Create track" }));

    expect(createTrack).toHaveBeenCalledWith({
      name: "Kart track",
      aliases: [],
      city: null,
      country: null,
      sims: [],
    });
    expect(createLayout).toHaveBeenCalledWith(
      expect.objectContaining({ lengthMeters: null, direction: null }),
    );
  });

  it("shows why creating failed", async () => {
    const { user } = setup(vi.fn().mockRejectedValue(new Error("QuotaExceededError")));
    await user.type(screen.getByLabelText("Track name"), "Kart track");
    await user.click(screen.getByRole("button", { name: "Create track" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Could not create the track: QuotaExceededError",
    );
    expect(push).not.toHaveBeenCalled();
  });
});
