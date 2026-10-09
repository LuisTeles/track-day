import { expect, test, type Page } from "@playwright/test";
import { FAKE_YOUTUBE_API } from "./fixtures/fake-youtube";

const IFRAME_API = "https://www.youtube.com/iframe_api";

function fakeYouTube(page: Page) {
  return page.route(IFRAME_API, (route) =>
    route.fulfill({ contentType: "text/javascript", body: FAKE_YOUTUBE_API }),
  );
}

async function openWithCar(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Load sample tracks" }).click();
  await page.getByRole("link", { name: /Interlagos/ }).click();
  await page.getByLabel("Car", { exact: true }).selectOption("__add__");
  await page.getByLabel("Car name", { exact: true }).fill("Mazda MX-5");
  await page.getByRole("button", { name: "Add car", exact: true }).click();
  await expect(page.getByLabel("Car", { exact: true }).locator("option:checked")).toHaveText(
    /Mazda MX-5/,
  );
}

async function openVideoPanel(page: Page) {
  await page.getByRole("button", { name: "More map actions" }).click();
  await page.getByRole("menuitem", { name: "Reference video" }).click();
  const panel = page.getByRole("complementary", { name: /^Video · Mazda MX-5/ });
  await expect(panel).toBeVisible();
  return panel;
}

/** The selected car's guide id (the samples bring other cars too). */
const guideId = (page: Page) => page.getByLabel("Car", { exact: true }).inputValue();

/** The selected car's stored video, read straight from IndexedDB. */
async function storedVideo(page: Page) {
  return page.evaluate(
    (id) =>
      new Promise<unknown>((resolve, reject) => {
        const open = indexedDB.open("track-day");
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const get = open.result.transaction("guides").objectStore("guides").get(id);
          get.onerror = () => reject(get.error);
          get.onsuccess = () => {
            open.result.close();
            resolve(get.result?.video ?? null);
          };
        };
      }),
    await guideId(page),
  );
}

/** Marks corners (by number → seconds) on the car's stored video, as Task 5's marking would. */
async function seedMarks(page: Page, marks: Record<number, number>) {
  return page.evaluate(
    ({ id, marks }) =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open("track-day");
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const tx = db.transaction(["guides", "corners"], "readwrite");
          const guides = tx.objectStore("guides").get(id);
          guides.onsuccess = () => {
            const guide = guides.result;
            const corners = tx.objectStore("corners").index("layoutId").getAll(guide.layoutId);
            corners.onsuccess = () => {
              const byNumber = new Map(
                corners.result.map((c: { id: string; number: number }) => [c.number, c.id]),
              );
              guide.video = {
                ...guide.video,
                lapStartSec: 5,
                marks: Object.entries(marks).map(([n, sec]) => ({
                  cornerId: byNumber.get(Number(n)),
                  sec,
                })),
              };
              tx.objectStore("guides").put(guide);
            };
          };
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
      }),
    { id: await guideId(page), marks },
  );
}

const ytTime = (page: Page) =>
  page.evaluate(() => (window as unknown as { __ytTime: number }).__ytTime);

// With the panel open as a bottom sheet (phones), it can cover a marker; the click
// handler is what's under test, not the map's panning.
const clickMarker = (page: Page, n: number) =>
  page.getByRole("button", { name: new RegExp(`^Turn ${n},`) }).dispatchEvent("click");

test("attach a YouTube link, then jump to corners from the list and the map", async ({ page }) => {
  await fakeYouTube(page);
  await openWithCar(page);
  const panel = await openVideoPanel(page);
  await expect(page).toHaveURL(/[?&]panel=video/);

  await panel.getByLabel("Paste a YouTube link").fill("not a link");
  await panel.getByRole("button", { name: "Use this video" }).click();
  await expect(panel).toContainText("That doesn't look like a YouTube link.");

  await panel.getByLabel("Paste a YouTube link").fill("https://youtu.be/dQw4w9WgXcQ?t=3");
  await panel.getByRole("button", { name: "Use this video" }).click();
  await expect(panel.getByTestId("fake-youtube")).toHaveAttribute("data-video-id", "dQw4w9WgXcQ");
  await expect(panel.getByRole("button", { name: /^T1 .*· Not marked$/ })).toBeDisabled();
  await expect
    .poll(() => storedVideo(page))
    .toMatchObject({ source: "youtube", youtubeId: "dQw4w9WgXcQ", marks: [] });

  await seedMarks(page, { 1: 12.5, 2: 20 });
  await page.reload();
  await expect(panel.getByTestId("fake-youtube")).toBeVisible();

  await panel.getByRole("button", { name: /^T1 .*· 0:12\.5$/ }).click();
  await expect.poll(() => ytTime(page)).toBe(12.5);

  await clickMarker(page, 2);
  await expect.poll(() => ytTime(page)).toBe(20);
  await expect(page).not.toHaveURL(/[?&]corner=/);
  await expect(page.getByRole("button", { name: /^Turn 2,/ })).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  await clickMarker(page, 3);
  await expect(page.getByText("T3 isn't marked yet.")).toBeVisible();
  await expect.poll(() => ytTime(page)).toBe(20);

  // Closing the panel stops the player; markers open the corner card again.
  await page.getByRole("button", { name: "Close panel" }).click();
  await expect(page.getByTestId("fake-youtube")).toHaveCount(0);
  await page.getByRole("button", { name: /^Turn 1,/ }).click();
  await expect(page.getByRole("complementary", { name: "T1 · S do Senna" })).toBeVisible();
});

test("offline: the panel explains, and the map keeps working", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route(IFRAME_API, (route) => route.abort("internetdisconnected"));
  await openWithCar(page);
  const panel = await openVideoPanel(page);
  await panel.getByLabel("Paste a YouTube link").fill("https://youtu.be/dQw4w9WgXcQ");
  await panel.getByRole("button", { name: "Use this video" }).click();
  await expect(panel.getByText("The video needs an internet connection.")).toBeVisible();
  await expect(panel.getByRole("button", { name: "Try again" })).toBeVisible();
  await expect(panel.getByRole("link", { name: "Watch on YouTube" }).first()).toHaveAttribute(
    "href",
    "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  );

  await page.getByRole("button", { name: "Close panel" }).click();
  await page.getByRole("button", { name: /^Turn 1,/ }).click();
  await expect(page.getByRole("complementary", { name: "T1 · S do Senna" })).toBeVisible();
  expect(errors).toEqual([]);
});

/** A one-second WebM recorded from a canvas in the page (Chromium's MediaRecorder). */
async function recordWebm(page: Page): Promise<Buffer> {
  const base64 = await page.evaluate(async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 36;
    const ctx = canvas.getContext("2d")!;
    const recorder = new MediaRecorder(canvas.captureStream(10), { mimeType: "video/webm" });
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => chunks.push(e.data);
    let frame = 0;
    const paint = setInterval(() => {
      ctx.fillStyle = frame++ % 2 ? "#c00" : "#00c";
      ctx.fillRect(0, 0, 64, 36);
    }, 50);
    recorder.start();
    await new Promise((r) => setTimeout(r, 1000));
    const stopped = new Promise((r) => (recorder.onstop = r));
    recorder.stop();
    await stopped;
    clearInterval(paint);
    const bytes = new Uint8Array(await new Blob(chunks).arrayBuffer());
    let binary = "";
    for (const b of bytes) binary += String.fromCharCode(b);
    return btoa(binary);
  });
  return Buffer.from(base64, "base64");
}

test("a video file is picked each session, and a different file asks first", async ({ page }) => {
  await openWithCar(page);
  const webm = await recordWebm(page);
  const panel = await openVideoPanel(page);
  const picker = panel.getByLabel("Choose a video file");

  await picker.setInputFiles({ name: "lap.webm", mimeType: "video/webm", buffer: webm });
  await expect(panel.locator("video")).toBeVisible();
  await expect
    .poll(() => storedVideo(page))
    .toMatchObject({ source: "file", file: { name: "lap.webm", sizeBytes: webm.length } });

  // A new session: the file has to be picked again; the same one plays straight away.
  await page.reload();
  await expect(panel).toContainText(
    /This car's video is a file on your device: lap\.webm, 0:01\. Choose it to play\./,
  );
  await expect(panel.locator("video")).toHaveCount(0);
  await picker.setInputFiles({ name: "lap.webm", mimeType: "video/webm", buffer: webm });
  await expect(panel.locator("video")).toBeVisible();

  // A different file never reuses the marks silently.
  await page.reload();
  await picker.setInputFiles({ name: "other.webm", mimeType: "video/webm", buffer: webm });
  await expect(panel).toContainText(
    "That's a different file (other.webm). Its timing may not match the saved marks.",
  );
  await expect(panel.locator("video")).toHaveCount(0);
  await panel.getByRole("button", { name: "Use with these marks" }).click();
  await expect(panel.locator("video")).toBeVisible();
  await expect.poll(() => storedVideo(page)).toMatchObject({ file: { name: "other.webm" } });

  await page.getByRole("button", { name: "Close panel" }).click();
  await expect(page.locator("video")).toHaveCount(0);
});
