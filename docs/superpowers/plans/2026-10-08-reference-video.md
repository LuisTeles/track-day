# Reference Video Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Each car can have a reference onboard lap (a YouTube link or a video file on the user's device). Clicking a corner jumps the video there, a dot follows the car around the map while it plays, and practice mode can follow the video.

**Architecture:** The video belongs to the car's `Guide` (one guide per car per layout, ADR-004), as a new `video` field holding the YouTube id or the file's name/size/duration, plus hand-marked corner times. Video files are never stored or uploaded: the user picks the file each session and the app recognizes it by name and size. Both sources sit behind one `VideoPlayerHandle`, so marking, the map dot and practice don't care where the video comes from. All timing maths is pure functions.

**Tech Stack:** Next.js 16 static export, React 19, Tailwind 4.3, Radix (`src/shared/ui`), TanStack Query, Dexie behind repositories, Zod schemas in `packages/schema`, YouTube IFrame Player API (no key), HTML `<video>` with `URL.createObjectURL`, Vitest, Playwright + axe.

**Spec:** `docs/ideas/2026-10-08-track-learning.md` (Must-haves → "Onboard video synced to the map") with these decisions from the user on 2026-10-08:

- Reference video is **per car** (per `Guide`).
- Local files: **pick the file each session**. No copy kept in the browser, no File System Access handles.
- The app **never hosts video**: only a YouTube id or a file's name/size/duration is saved. No video bytes ever leave the device or enter IndexedDB or the backup.

## Global Constraints

- No backend, no API keys, no video bytes stored anywhere (IndexedDB, backup, server). Only `youtubeId` or `{ name, sizeBytes, durationSec }` plus marks.
- YouTube is loaded from `https://www.youtube.com/iframe_api` with the player `host` set to `https://www.youtube-nocookie.com`. Only the 11-character video id is stored, never a full URL.
- Tests never touch the real YouTube: unit tests use a fake `YT` object, e2e routes `iframe_api` to a fake script.
- Schema changes follow `docs/data-model.md` → "Changing the model": the backup payload changes, so `CURRENT_SCHEMA_VERSION` goes 1 → 2 with a migration and a test. Old rows read from Dexie get `video: null` through the schema `.default(null)` (`LocalRepository.normalize`).
- Data access only through `useRepositories()` and TanStack Query; features never import Dexie.
- Design system ADR-008: shared primitives, tokens only, controls `h-10` / `pointer-coarse:h-11`, text ≥ 12px, keyboard reachable, zero axe violations (light and dark) — add the video panel to `e2e/a11y.spec.ts`.
- Unsaved marks use the existing guard (`dirty` record + `leaveEdits` / `guardLink` in `track-view-page.tsx`) under a new `dirty.video` key; the discard dialog text names video marks.
- Shared `DropdownMenu` is non-modal (since 931ec9a); keep it that way.
- No page scrolls sideways at 360px (`e2e/small-phone.spec.ts`); the 360px map toolbar must still fit.
- Conventional Commits, scope `web` (`schema` for package changes, `docs` for docs), ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Read `apps/web/AGENTS.md` before using Next.js APIs.
- Verify from the repo root: `pnpm typecheck && pnpm lint && pnpm test && pnpm --filter web build && pnpm test:e2e`.

## Review Focus

1. **Offline or blocked YouTube** (no connection, ad blocker, embedding disabled by the owner): the panel shows a clear message and a "Watch on YouTube" link; the rest of the track view keeps working; no unhandled promise rejection. Owned by Task 3.
2. **Incomplete or odd marks** (no marks, one mark, unmarked corners in between, marks out of lap order, playback before the first or after the last mark): the dot hides instead of jumping or showing NaN; saving out-of-order marks is blocked with a message naming the corners. Owned by Tasks 2 and 5.
3. **A different file picked** for a car whose video is a file: marks are never silently reused — the user chooses "Use with these marks" or "Start new marks". Owned by Task 4.
4. **Leaving with unsaved marks** (close panel, Escape, marker click, More menu items, back link, car/layout switch): asks first. Owned by Task 5.
5. **Practice following the video**: pressing Next/Prev while following seeks the video instead of fighting it (no loop, no jitter); exiting practice stops playback and releases the object URL. Owned by Task 7.

---

## File structure

**Create**

| File                                                      | Responsibility                                                                                                              |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `apps/web/src/features/video/youtube-id.ts` (+ test)      | Parse a pasted YouTube link or id into an 11-char id                                                                        |
| `apps/web/src/features/video/video-sync.ts` (+ test)      | Pure timing maths: anchors, lap fraction at a time, corner at a time, next corner to mark, mark validation, time formatting |
| `apps/web/src/features/video/player.ts`                   | `VideoPlayerHandle` interface                                                                                               |
| `apps/web/src/features/video/youtube-api.ts` (+ test)     | Load the IFrame API once, with timeout; minimal `YT` types                                                                  |
| `apps/web/src/features/video/youtube-player.tsx` (+ test) | YouTube player behind `VideoPlayerHandle`, with error states                                                                |
| `apps/web/src/features/video/file-player.tsx` (+ test)    | `<video>` from a picked file behind `VideoPlayerHandle`                                                                     |
| `apps/web/src/features/video/use-video-time.ts`           | Poll the handle's current time (~4 Hz while active)                                                                         |
| `apps/web/src/features/video/use-save-video.ts`           | Mutation saving `Guide.video`                                                                                               |
| `apps/web/src/features/video/video-panel.tsx` (+ test)    | Attach a video, pick the file, watch, seek from the corner list                                                             |
| `apps/web/src/features/video/mark-corners.tsx` (+ test)   | Marking mode: start line, corners, finish line, nudge, undo, save                                                           |
| `apps/web/src/features/video/video-dot.tsx` (+ test)      | Map overlay dot at the current lap position                                                                                 |
| `apps/web/e2e/fixtures/fake-youtube.ts`                   | Fake `iframe_api` script for Playwright routing                                                                             |
| `apps/web/e2e/video.spec.ts`                              | End-to-end flows                                                                                                            |
| `docs/adr/009-reference-video.md`                         | Decision record                                                                                                             |

**Modify:** `packages/schema/src/entities.ts`, `payloads.ts`, `migrations.ts` (+ tests), `packages/prompts/src/track.ts` (schemaVersion in the template), `apps/web/src/features/track-view/{track-view-page,map-toolbar,corner-markers}.tsx` (+ tests), `apps/web/src/features/practice/practice-page.tsx` (+ test), `apps/web/e2e/a11y.spec.ts`, `docs/data-model.md`, `docs/adr/README.md`, `docs/PLAN.md`.

---

### Task 1: Schema — `Guide.video` and backup v2

**Files:** `packages/schema/src/entities.ts`, `payloads.ts`, `migrations.ts`, `migrations.test.ts`, `payloads.test.ts`; `packages/prompts/src/track.ts` (+ its test if it asserts the version); `apps/web/src/data/local/local-repositories.test.ts`; `docs/data-model.md`.

**Interfaces — Produces:**

```ts
// entities.ts
const YouTubeId = z.string().regex(/^[A-Za-z0-9_-]{11}$/);

export const VideoMark = z.object({ cornerId: Id, sec: z.number().nonnegative() });
export type VideoMark = z.infer<typeof VideoMark>;

export const VideoFile = z.object({
  name: z.string().min(1),
  sizeBytes: z.number().int().nonnegative(),
  durationSec: z.number().positive(),
});
export type VideoFile = z.infer<typeof VideoFile>;

export const ReferenceVideo = z.discriminatedUnion("source", [
  z.object({ source: z.literal("youtube"), youtubeId: YouTubeId }),
  z.object({ source: z.literal("file"), file: VideoFile }),
]).and(
  z.object({
    /** Time the car crosses the start/finish line at the start of the reference lap. */
    lapStartSec: z.number().nonnegative().nullable(),
    /** Time it crosses the line again at the end of the lap. */
    lapEndSec: z.number().nonnegative().nullable(),
    marks: z.array(VideoMark),
  }),
);
export type ReferenceVideo = z.infer<typeof ReferenceVideo>;

// Guide gains:
  /** Reference onboard lap for this car (ADR-009). Video bytes are never stored. */
  video: ReferenceVideo.nullable().default(null),
```

`CURRENT_SCHEMA_VERSION = 2`. `migrations[1]`: for `kind: "backup"`, set `video: null` on every guide that lacks it; other kinds unchanged.

- [ ] **Step 1: Failing tests.** `migrations.test.ts`: a v1 backup with one guide migrates to v2 with `guides[0].video === null`; v1 track and guide payloads migrate unchanged except `schemaVersion: 2`; `parseImport` of a v1 backup validates against `BackupPayload`. `payloads.test.ts` (or an entities test): `Guide.parse` without `video` gives `null`; a YouTube video with marks parses; an 8-char id, a full URL as `youtubeId`, a negative `sec`, and a file without `durationSec` are rejected. `local-repositories.test.ts`: a guide row written without `video` reads back with `video: null`; `guides.update(id, { video })` round-trips; a backup export → import keeps `video`.
- [ ] **Step 2: Run, see them fail.** `pnpm --filter @track-day/schema test` and `pnpm --filter web test src/data`.
- [ ] **Step 3: Implement** the schema, version bump and migration. Update the track prompt template's `schemaVersion` to use `CURRENT_SCHEMA_VERSION` (not a literal 1) so AI imports keep validating. Update `docs/data-model.md` Guide row with `video` (`{ source: "youtube", youtubeId } | { source: "file", file: { name, sizeBytes, durationSec } }`, `lapStartSec`, `lapEndSec`, `marks[]`), noting "video bytes are never stored".
- [ ] **Step 4: Run all tests** (`pnpm test` from the root) — every package passes, including the JSON-schema export if it has tests.
- [ ] **Step 5: Commit** `feat(schema): reference video on a car's guide, backup format v2`.

---

### Task 2: Timing maths

**Files:** create `apps/web/src/features/video/youtube-id.ts`, `video-sync.ts` and their tests.

**Interfaces — Produces:**

```ts
// youtube-id.ts
/** Accepts youtu.be/ID, youtube.com/watch?v=ID, /shorts/ID, /embed/ID, /live/ID, m. and nocookie hosts, extra params, or a bare 11-char id. */
export function parseYouTubeId(input: string): string | null;
export function youtubeWatchUrl(id: string, atSec?: number): string; // https://www.youtube.com/watch?v=ID&t=Ns

// video-sync.ts
export interface Anchor {
  sec: number;
  fraction: number;
}
/** Start line (fraction 0) if marked, then each mark at its corner's lap fraction (`cornerFraction`), sorted by time. Marks for unknown corners or corners without a fraction are skipped. */
export function videoAnchors(
  video: ReferenceVideo,
  corners: Corner[],
  layout: Pick<Layout, "lengthMeters">,
): Anchor[];
/** Lap fraction (0–1) at `sec`, linearly between neighbouring anchors; fractions are unwrapped so the lap only moves forward; `lapEndSec` closes the lap at start + 1. Null before the first anchor, after the last, or with fewer than 2 anchors. */
export function lapFractionAt(
  sec: number,
  anchors: Anchor[],
  lapEndSec: number | null,
): number | null;
/** The corner whose mark is the latest at or before `sec`; null before the first mark. */
export function cornerAt(sec: number, marks: VideoMark[]): string | null;
/** The next item to mark in lap order: "start", a corner id, "finish", or null when all are marked. */
export function nextToMark(
  video: ReferenceVideo,
  corners: Corner[],
): "start" | "finish" | string | null;
/** Corners (by number) whose mark is earlier than the previous corner's in lap order; empty when valid. */
export function outOfOrder(video: ReferenceVideo, corners: Corner[]): number[];
/** 83.4 → "1:23.4"; 5 → "0:05.0". */
export function formatVideoTime(sec: number): string;
```

- [ ] **Step 1: Failing tests.** `parseYouTubeId`: each URL shape above, `?t=30` and `&list=` ignored, whitespace trimmed, `youtube.com/watch` without `v`, other hosts (`vimeo.com/…`, `evil.com/watch?v=dQw4w9WgXcQ`) and 10/12-char ids → null. `lapFractionAt`: two anchors 0.2 → 0.4 at 10 s → 20 s gives 0.3 at 15 s; a pair crossing the start line (0.9 at 10 s, 0.1 at 20 s) gives 0.0 at 15 s, not 0.5; null before first, after last, with 0 or 1 anchors; `lapEndSec` makes the last segment run to fraction 1 (wraps to 0); never returns NaN for equal anchor times (zero-length segment → the later anchor). `cornerAt`, `nextToMark` (order: start, corners in lap `order`, finish; skips already-marked), `outOfOrder` (T3 at 40 s after T4 at 35 s → `[4]`), `formatVideoTime`.
- [ ] **Step 2: Run, see them fail.**
- [ ] **Step 3: Implement.** Keep every function pure; no React, no DOM.
- [ ] **Step 4: Run, see them pass.**
- [ ] **Step 5: Commit** `feat(web): timing maths for reference videos`.

---

### Task 3: Players

**Files:** create `player.ts`, `youtube-api.ts`, `youtube-player.tsx`, `file-player.tsx`, `use-video-time.ts` and tests.

**Interfaces — Produces:**

```ts
// player.ts
export interface VideoPlayerHandle {
  currentTime(): number;
  seek(sec: number): void;
  play(): void;
  pause(): void;
  isPlaying(): boolean;
}

// youtube-api.ts
/** Injects https://www.youtube.com/iframe_api once and resolves window.YT; rejects after `timeoutMs` (default 10000) or on script error. A later call after a failure retries. */
export function loadYouTubeApi(timeoutMs?: number): Promise<YTNamespace>;

// youtube-player.tsx
export function YouTubePlayer(props: {
  ref?: React.Ref<VideoPlayerHandle>;
  videoId: string;
  title: string;
  onReady?(): void;
}): JSX.Element;

// file-player.tsx
export function FilePlayer(props: {
  ref?: React.Ref<VideoPlayerHandle>;
  file: File;
  title: string;
  onMetadata?(meta: { durationSec: number }): void;
}): JSX.Element;

// use-video-time.ts
/** Current time of `handle`, refreshed every 250 ms while `active`; stops when inactive or unmounted. */
export function useVideoTime(
  handle: React.RefObject<VideoPlayerHandle | null>,
  active: boolean,
): number;
```

- [ ] **Step 1: Failing tests** with a fake `window.YT` (a `Player` class recording calls, triggering `onReady` / `onError`) and a fake `<video>` (jsdom: stub `HTMLMediaElement.prototype.play/pause`, set `currentTime`, dispatch `loadedmetadata`): the handle seeks/plays/pauses; YouTube errors map to messages — `2`/`100` "This video isn't available.", `101`/`150` "The owner doesn't allow this video in other apps." each with a "Watch on YouTube" link (`youtubeWatchUrl`); the loader timing out shows "The video needs an internet connection." with a "Try again" button; `FilePlayer` creates one object URL and revokes it on unmount and on file change; `useVideoTime` stops polling when inactive.
- [ ] **Step 2: Run, see them fail.**
- [ ] **Step 3: Implement.** YouTube player: `new YT.Player(el, { videoId, host: "https://www.youtube-nocookie.com", playerVars: { rel: 0, modestbranding: 1, playsinline: 1 } })`, `title` on the iframe, `destroy()` on unmount. Both players fill a `w-full aspect-video` box with `rounded-xl bg-black`. Native `<video controls playsInline>` for files.
- [ ] **Step 4: Run, see them pass.**
- [ ] **Step 5: Commit** `feat(web): YouTube and local-file video players`.

---

### Task 4: Video panel — attach, pick the file, watch, jump to corners

**Files:** create `use-save-video.ts`, `video-panel.tsx` (+ test); modify `map-toolbar.tsx`, `track-view-page.tsx` (+ tests); create `e2e/fixtures/fake-youtube.ts`, `e2e/video.spec.ts`; modify `e2e/a11y.spec.ts`.

**Interfaces:**

- Consumes: Task 1 schema, Task 2 `parseYouTubeId` / `formatVideoTime` / `cornerAt`, Task 3 players.
- Produces: `useSaveVideo(trackId)` → `({ guideId, video: ReferenceVideo | null }) => guides.update(guideId, { video })`, invalidating `queryKeys.track(trackId)`. `VideoPanel({ guide, label, corners, layout, trackId, playerRef, onPlayingChange, seekRequest })`. `MapToolbarProps.video: { available: boolean; open(): void }` → More menu item "Reference video" (lucide `Clapperboard`), disabled with `title="Add a car first"` without a guide.

Behaviour:

- URL `panel=video` opens a `SidePanel` titled `Video · {car label}`; opening goes through `leaveEdits` and clears `corner`; selecting a corner from the corner list clears `panel` as today.
- **No video yet:** "Paste a YouTube link" (`Input` + "Use this video") with error "That doesn't look like a YouTube link. Paste one like https://youtu.be/…"; or "Choose a video file" (`input type="file" accept="video/*"`, label visible). Saving a file records `{ name, sizeBytes, durationSec }` from the picked `File` and the player's metadata.
- **File video, new session:** shows "This car's video is a file on your device: {name}, {m:ss}. Choose it to play." with the picker. Same name and size → play with the saved marks. Different → notice "That's a different file ({picked name}). Its timing may not match the saved marks." with "Use with these marks" and "Start new marks" (the latter confirms via `useConfirm` when marks exist, then saves the new file with empty marks).
- **Watching:** the player, then the corner list in lap order: each row is a button "T{n} {name} · {m:ss.s}" that seeks; unmarked corners show "Not marked" and are disabled. "Mark corners" button (Task 5 fills it in; here it can be absent). "Remove video" (confirm, saves `video: null`). "Watch on YouTube" link for YouTube sources.
- **Map markers while the panel is open:** clicking a marked corner seeks the video to its mark and highlights the marker instead of opening the corner card; clicking an unmarked one shows a toast "T{n} isn't marked yet." The corner whose mark is current (`cornerAt`) is the selected marker.
- Closing the panel unmounts the player (playback stops, object URL revoked).

- [ ] **Step 1: Failing tests** (component + page): attach YouTube link (valid/invalid), attach file, re-pick same/different file paths, corner list seek calls `handle.seek(sec)`, marker click seeks while panel open, More → Reference video opens the panel and is disabled without a guide.
- [ ] **Step 2: Run, see them fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: e2e** `video.spec.ts` with `page.route("https://www.youtube.com/iframe_api", …)` serving `fake-youtube.ts` (a `YT.Player` whose time is `window.__ytTime`, `seekTo` sets it, fires `onReady`): paste a link → player shows; seek from the list and from a marker updates `__ytTime`; offline: route `iframe_api` to abort → "needs an internet connection" message and the map still works. For files, generate a short WebM in the page with `canvas.captureStream()` + `MediaRecorder` (Chromium) and feed it to `setInputFiles` as a buffer; if that proves unreliable, commit a tiny (< 50 KB) fixture under `e2e/fixtures/`. Add the open video panel to `a11y.spec.ts` (light and dark).
- [ ] **Step 5: Verify, commit** `feat(web): reference video panel with corner jumps`.

---

### Task 5: Marking mode

**Files:** create `mark-corners.tsx` (+ test); modify `video-panel.tsx`, `track-view-page.tsx` (+ tests), `e2e/video.spec.ts`.

**Interfaces — Consumes:** `nextToMark`, `outOfOrder`, `formatVideoTime` (Task 2), the panel's `playerRef`. **Produces:** `MarkCorners({ video, corners, playerRef, onSave(video), onCancel(), onDirtyChange })`.

Behaviour:

- "Mark corners" switches the panel into marking mode with a draft copy of the video's marks.
- One large primary button names the next item: "Mark start line", "Mark T{n} {name}", "Mark finish line", using `playerRef.current.currentTime()`; the `M` key does the same when focus isn't in a text field (reuse the guard from `shortcuts.ts`: skip typing targets and open dialogs/menus; ignore repeats and Ctrl/Cmd).
- The list shows each item's time with "−0.5 s" / "+0.5 s" buttons (named "Earlier T{n}" / "Later T{n}"), "Clear T{n}", and "Undo last mark".
- "Save marks" is disabled while `outOfOrder` is non-empty, with the message "T{n} is marked before the corner ahead of it. Fix the order to save." Saving writes `lapStartSec`, `lapEndSec`, `marks`; "Cancel" discards.
- The draft reports dirtiness as `dirty.video`; the discard dialog says "Your video marks haven't been saved." when that key is dirty.

- [ ] **Step 1: Failing tests:** marking advances through start → corners → finish; `M` key marks, but not while typing or with a menu open; nudge/clear/undo; out-of-order blocks save with the corner named; dirty marks + marker click / close / More item asks first and Keep editing keeps the draft; save persists and leaves marking mode.
- [ ] **Step 2: Run, see them fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: e2e:** with the fake YouTube, set `__ytTime` before each "Mark" click to mark start, all corners and finish, save, reload, open the panel again → times listed.
- [ ] **Step 5: Verify, commit** `feat(web): mark corner times on the reference video`.

---

### Task 6: The dot that follows the car

**Files:** create `video-dot.tsx` (+ test); modify `track-view-page.tsx` (canvas overlay), `e2e/video.spec.ts`.

**Interfaces — Consumes:** `useVideoTime`, `videoAnchors`, `lapFractionAt`, `CanvasContext` from `track-canvas.tsx`. **Produces:** `VideoDot({ ctx, fraction })` rendering nothing when `fraction` is null.

- [ ] **Step 1: Failing tests:** dot positioned at `ctx.toScreen(geometry.pointAt(f))`; hidden for null; `aria-hidden`; motion respects reduced motion (no CSS transition when `prefers-reduced-motion`).
- [ ] **Step 2: Run, see them fail.**
- [ ] **Step 3: Implement.** 16 px dot, `bg-accent`, 3 px `ring-background`, `shadow-md`, above the track and below markers. Rendered only while the video panel is open and the layout has an outline; anchors memoized per video/layout; time from `useVideoTime(playerRef, panelOpen)`.
- [ ] **Step 4: e2e:** with marks saved and `__ytTime` set between two marks, the dot's screen position lies between those two markers; before the first anchor, the dot is absent.
- [ ] **Step 5: Verify, commit** `feat(web): a dot follows the reference lap on the map`.

---

### Task 7: Practice follows the video

**Files:** modify `apps/web/src/features/practice/practice-page.tsx` (+ tests), `e2e/practice.spec.ts`.

Behaviour:

- When the session's guide has a video with at least one mark, the Options popover shows a switch "Follow reference video" (stored with `useStoredToggle("practice:follow-video", false)`).
- When on, the diagram slot shows the player (YouTube, or the file picker then `FilePlayer` for file sources — same name/size check as Task 4, simplified to "Use with these marks" only; marks are read-only here).
- While playing, `cornerAt(time)` drives the card: when it maps to a different practice step (`stepIndexOf`), call the navigator's `goTo`. Manual Next/Prev/tap/swipe/wheel seek the video to that step's first marked corner instead; guard with a "last corner I set" ref so the time poll doesn't immediately pull the card back (no loop).
- Exiting practice or switching the option off unmounts the player.

- [ ] **Step 1: Failing tests:** with a fake handle, advancing time across a mark changes the card; pressing Next seeks to the next corner's mark and the card doesn't bounce back on the next poll; no option when the guide has no marks.
- [ ] **Step 2: Run, see them fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: e2e** with the fake YouTube: enable Follow, set `__ytTime` past T2's mark → card shows T2; press Next → `__ytTime` equals T3's mark.
- [ ] **Step 5: Verify, commit** `feat(web): practice mode follows the reference video`.

---

### Task 8: Decision record and docs

**Files:** create `docs/adr/009-reference-video.md`; modify `docs/adr/README.md`, `docs/PLAN.md` (tick "Onboard video synced to the map" under M6), `docs/ideas/2026-10-08-track-learning.md` (record the two answered decisions).

- [ ] **Step 1: Write ADR-009** (template in `docs/adr/000-template.md`): context (learning from onboard laps; no backend; video hosting is costly and a copyright risk); decision (video per car on `Guide.video`; YouTube via nocookie embed, id only; local files picked each session, recognized by name+size, never stored or uploaded; hand-marked times because AI can't watch video; linear interpolation between anchors; one `VideoPlayerHandle`); consequences (YouTube needs internet; files must be re-picked; marks tolerate small timing errors; a public library would share only ids and marks).
- [ ] **Step 2: Update the other docs**, run `npx prettier --check` on them.
- [ ] **Step 3: Commit** `docs: ADR-009 reference video`.
