import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { RepositoriesProvider } from "@/data/provider";
import type { Repositories } from "@/data/repositories";
import { ToastProvider } from "@/shared/ui/toast";
import { TrackList } from "./track-list";

const track = (name: string, alias?: string) => ({
  id: name,
  name,
  aliases: alias ? [alias] : [],
  city: null,
  country: null,
});

function setup(list: () => Promise<unknown[]>) {
  const tracks = { list: vi.fn(list) };
  render(
    <QueryClientProvider client={new QueryClient()}>
      <RepositoriesProvider repositories={{ tracks } as unknown as Repositories}>
        <ToastProvider>
          <TrackList />
        </ToastProvider>
      </RepositoriesProvider>
    </QueryClientProvider>,
  );
}

const six = ["Suzuka", "Spa", "Monza", "Imola", "Fuji", "Laguna Seca"].map((n) => track(n));

describe("TrackList", () => {
  it("shows a busy skeleton list while loading", () => {
    setup(() => new Promise(() => {}));
    expect(screen.getByRole("list", { name: "Loading tracks" })).toHaveAttribute(
      "aria-busy",
      "true",
    );
  });

  it("lists tracks as links whose names include the alias and the full name", async () => {
    setup(async () => [track("Autódromo José Carlos Pace", "Interlagos")]);
    const link = await screen.findByRole("link", { name: /Interlagos/ });
    expect(link).toHaveAccessibleName(/Autódromo José Carlos Pace/);
  });

  it("has no search box below six tracks", async () => {
    setup(async () => six.slice(0, 5));
    await screen.findAllByRole("link");
    expect(screen.queryByRole("searchbox")).toBeNull();
  });

  it("offers search from six tracks and filters as you type", async () => {
    setup(async () => six);
    const search = await screen.findByRole("searchbox", { name: "Search tracks" });
    await userEvent.type(search, "suzu");
    expect(screen.getAllByRole("link")).toHaveLength(1);
  });

  it("says when nothing matches", async () => {
    setup(async () => six);
    await userEvent.type(await screen.findByRole("searchbox", { name: "Search tracks" }), "zzz");
    expect(screen.getByText("No tracks match “zzz”.")).toBeInTheDocument();
  });
});
