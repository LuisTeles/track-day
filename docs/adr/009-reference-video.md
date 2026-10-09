# 009. Reference video

- Status: Accepted
- Date: 2026-10-09

## Context

A good way to learn a track is to watch an onboard lap while looking at the map. The app has no backend (ADR-001), hosting video would be costly and a copyright risk, and an AI cannot watch video to find where the corners are. The feature has to work with what the user already has: a YouTube link or a file on disk.

## Decision

- **Per car.** The video lives on `Guide.video`. A guide is one car on one layout (ADR-004), so each car can have its own reference lap. `video` is `null` or a `ReferenceVideo`: a source, `lapStartSec`, `lapEndSec` and `marks[]` of `{ cornerId, sec }`. Backups move to schema v2; the migration adds `video: null` to every guide in a backup.
- **Nothing hosted.** The record holds only `{ source: "youtube", youtubeId }` (11 characters, from `parseYouTubeId`, which accepts the usual URL shapes or a bare id) or `{ source: "file", file: { name, sizeBytes, durationSec } }`. Video bytes are never stored, uploaded or backed up.
- **Local files are picked again each session.** The browser can't keep a handle to the file, so the panel asks for it. A file with the saved name and size is accepted straight away. Any other file asks "Use with these marks" or "Start new marks".
- **YouTube** uses the IFrame API, loaded from youtube.com with the player host set to youtube-nocookie.com. The script loads only when a YouTube video is opened or followed, never at app start. Offline, a script timeout, or a blocked or unavailable video shows a message with a "Watch on YouTube" link (and "Try again" when offline). `seek` on an unstarted, cued or ended video is followed by a pause (the state is read before seeking), because seeking one starts it and a jump must never start playback. The player's control methods exist only once it fires `onReady`, so the handle reaches the player only from then on, and the 250 ms clock poll tolerates a read that throws. This can't be verified against the real player in automated tests (the tests use a fake), so it needs a manual check.
- **Marks are made by hand**: the start line, each corner in lap order, then the finish line. `markOrderProblems` blocks saving an order that goes backwards. Between marks, the lap position is linear interpolation by lap fraction (`lapFractionAt`), and `lapEndSec` closes the lap at the start/finish line. The map dot hides while the marks are incomplete (fewer than two anchors) or invalid.
- **One `VideoPlayerHandle`** (`currentTime`, `seek`, `play`, `pause`, `isPlaying`) fronts both sources, so the map, the panel and practice mode don't care which one it is. The 4 Hz clock (`useVideoTime`) lives in small child components (the dot layer, the practice corner clock), so the pages don't re-render on every tick.
- **Practice mode follows the video both ways** (`follow-video.tsx`): the video passing a corner's mark moves the card, and moving the card seeks the video to that step's first marked corner. A short grace period after a manual move stops the video's stale time from pulling the card back (the loop guard). Quick Note stays on the corner it was opened for, and while a note is open the video doesn't move the card; it catches up when the note closes. The options sheet doesn't pause following.

## Consequences

- YouTube needs a connection, and some videos refuse embedding.
- A file must be picked again every session. A renamed or re-encoded file counts as different.
- Marks tolerate small timing errors; the dot is an interpolation, not telemetry.
- The dot follows the saved marks, not an unsaved marking draft.
- A public library could later share only ids and marks, never video.
- AI guide import cannot fill timestamps, so marking stays manual (about five minutes a lap).
- The audio lap and the quiz can reuse the marks for timing.
