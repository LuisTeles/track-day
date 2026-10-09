import interlagos from "@examples/interlagos.track.json";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TrackImportPayload } from "@track-day/schema";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RepositoriesProvider } from "@/data/provider";
import type { Repositories } from "@/data/repositories";
import { TrackDayDb } from "@/data/local/db";
import { createLocalRepositories } from "@/data/local/local-repositories";
import type { YTPlayerOptions } from "@/features/video/youtube-api";
import { mockLayout } from "@/test/dom";
import { controlsAfterReady } from "@/test/youtube";
import { PracticePage } from "./practice-page";

class FakeYTPlayer {
  static instances: FakeYTPlayer[] = [];
  time = 0;
  state = -1;
  constructor(_el: HTMLElement, opts: YTPlayerOptions) {
    FakeYTPlayer.instances.push(this);
    queueMicrotask(controlsAfterReady(this, opts));
  }
  seekTo(s: number) {
    this.time = s;
  }
  playVideo() {
    this.state = 1;
  }
  pauseVideo() {
    this.state = 2;
  }
  getCurrentTime() {
    return this.time;
  }
  getPlayerState() {
    return this.state;
  }
  destroy() {}
}
vi.mock("@/features/video/youtube-api", () => ({
  loadYouTubeApi: () => Promise.resolve({ Player: FakeYTPlayer }),
}));

let search = new URLSearchParams();
vi.mock("next/navigation", () => ({
  useSearchParams: () => search,
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => "/tracks/practice/",
}));

let db: TrackDayDb;
let repos: Repositories;

beforeEach(() => {
  mockLayout();
  FakeYTPlayer.instances = [];
  window.localStorage.setItem("practice:follow-video", "true");
  db = new TrackDayDb(`test-${crypto.randomUUID()}`);
  repos = createLocalRepositories(db);
});
afterEach(async () => {
  window.localStorage.clear();
  await db.delete();
});

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function openFollowing() {
  const { trackId, layoutId } = await repos.trackImport.importTrack(
    TrackImportPayload.parse(interlagos),
  );
  const corners = await repos.corners.listByLayout(layoutId);
  const t = (n: number) => corners.find((c) => c.number === n)!;
  const cls = await repos.carClasses.create({
    name: "GT3",
    description: "",
    drivetrain: null,
    downforce: null,
  });
  const guide = await repos.guides.create({
    layoutId,
    target: { carClassId: cls.id },
    sim: null,
    referenceLapTime: null,
    setupNotes: "",
    source: "manual",
    video: {
      source: "youtube",
      youtubeId: "dQw4w9WgXcQ",
      lapStartSec: 5,
      lapEndSec: null,
      marks: [
        { cornerId: t(1).id, sec: 10 },
        { cornerId: t(2).id, sec: 20 },
      ],
    },
  });
  search = new URLSearchParams({ track: trackId, layout: layoutId, guide: guide.id, corner: "1" });
  render(
    <QueryClientProvider client={new QueryClient()}>
      <RepositoriesProvider repositories={repos}>
        <PracticePage />
      </RepositoriesProvider>
    </QueryClientProvider>,
  );
  const card = await screen.findByTestId("practice-card");
  await waitFor(() => expect(card).toHaveAttribute("aria-label", expect.stringMatching(/^T1,/)));
  await waitFor(() => expect(FakeYTPlayer.instances[0]?.time).toBe(10));
  await wait(400); // the clock has seen T1
  return { card, guide, t, player: FakeYTPlayer.instances[0]! };
}

describe("PracticePage following the video", () => {
  it("keeps a note on its corner while the video passes the next mark", async () => {
    const { card, guide, t, player } = await openFollowing();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Note" }));
    expect(screen.getByRole("alertdialog", { name: "Note for T1" })).toBeInTheDocument();

    player.time = 21; // the video reaches T2 while typing
    await wait(700);
    expect(screen.getByRole("alertdialog", { name: "Note for T1" })).toBeInTheDocument();
    expect(card).toHaveAttribute("aria-label", expect.stringMatching(/^T1,/));

    await user.type(screen.getByLabelText("Note"), "Braked late");
    await user.click(screen.getByRole("button", { name: "Save note" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    const saved = await repos.cornerGuides.listByGuide(guide.id);
    expect(saved.map((g) => g.cornerId)).toEqual([t(1).id]);
    expect(saved[0]!.notes).toContain("Braked late");

    // Closed: the card catches up with the video.
    await waitFor(() => expect(card).toHaveAttribute("aria-label", expect.stringMatching(/^T2,/)));
  });
});
