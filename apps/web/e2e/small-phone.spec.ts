import { expect, test, type Page } from "@playwright/test";
import { FAKE_YOUTUBE_API } from "./fixtures/fake-youtube";

// 360 × 740: the narrowest phone we support.
test.beforeEach(async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile");
  await page.setViewportSize({ width: 360, height: 740 });
});

const pageScrollWidth = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth);

test("no page scrolls sideways at 360px", async ({ page }) => {
  for (const path of ["/", "/backup/", "/tracks/import/"]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
    expect(await pageScrollWidth(page), path).toBeLessThanOrEqual(360);
  }
  // Home with tracks: long subtitles must truncate, not widen the cards.
  await page.goto("/");
  await page.getByRole("button", { name: "Load sample tracks" }).click();
  await expect(page.getByRole("link", { name: /Interlagos/ })).toBeVisible();
  expect(await pageScrollWidth(page), "/ with tracks").toBeLessThanOrEqual(360);
  // The cheat sheet's seven-column table must scroll inside itself, not the page.
  await page.getByRole("link", { name: /Interlagos/ }).click();
  await expect(page.locator("[data-corner]").first()).toBeVisible();
  await page.getByRole("button", { name: "More map actions" }).click();
  await page.getByRole("menuitem", { name: "Cheat sheet" }).click();
  await expect(page.getByTestId("cheat-sheet")).toBeVisible();
  expect(await pageScrollWidth(page), "cheat sheet").toBeLessThanOrEqual(360);
});

test("the video panel fits at 360px", async ({ page }) => {
  await page.route("https://www.youtube.com/iframe_api", (route) =>
    route.fulfill({ contentType: "text/javascript", body: FAKE_YOUTUBE_API }),
  );
  await openInterlagos(page);
  await page.getByLabel("Car", { exact: true }).selectOption("__add__");
  await page.getByLabel("Car name", { exact: true }).fill("Mazda MX-5");
  await page.getByRole("button", { name: "Add car", exact: true }).click();
  await page.getByRole("button", { name: "More map actions" }).click();
  await page.getByRole("menuitem", { name: "Reference video" }).click();
  const panel = page.getByRole("complementary", { name: /^Video · / });
  await expect(panel.getByLabel("Choose a video file")).toBeAttached();
  expect(await pageScrollWidth(page), "video panel").toBeLessThanOrEqual(360);
  await panel.getByLabel("Paste a YouTube link").fill("https://youtu.be/dQw4w9WgXcQ");
  await panel.getByRole("button", { name: "Use this video" }).click();
  await expect(panel.getByTestId("fake-youtube")).toBeVisible();
  expect(await pageScrollWidth(page), "video panel watching").toBeLessThanOrEqual(360);
  // Marking mode, with a marked row (nudge buttons) showing.
  await panel.getByRole("button", { name: "Mark corners" }).click();
  await panel.getByRole("button", { name: "Mark start line" }).click();
  await expect(panel.getByRole("button", { name: "Earlier start line" })).toBeVisible();
  expect(await pageScrollWidth(page), "video panel marking").toBeLessThanOrEqual(360);
  await panel.getByRole("button", { name: "Cancel" }).click();
  const bar = (await page.getByRole("toolbar", { name: "Map controls" }).boundingBox())!;
  expect(bar.x + bar.width).toBeLessThanOrEqual(360);
});

async function openInterlagos(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Load sample tracks" }).click();
  await page.getByRole("link", { name: /Interlagos/ }).click();
  await expect(page.locator("[data-corner]").first()).toBeVisible();
}

const overlaps = (
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

for (const inset of [0, 34]) {
  test(`the OpenStreetMap credit clears the toolbar (bottom inset ${inset}px)`, async ({
    page,
  }) => {
    if (inset) {
      // An iPhone home bar in standalone mode: env(safe-area-inset-bottom) = 34px.
      const cdp = await page.context().newCDPSession(page);
      await cdp.send(
        "Emulation.setSafeAreaInsetsOverride" as never,
        {
          insets: { top: 0, left: 0, right: 0, bottom: inset },
        } as never,
      );
    }
    await openInterlagos(page);
    const credit = page.getByText("Map data ©");
    await expect(credit).toBeVisible();
    const bar = (await page.getByRole("toolbar", { name: "Map controls" }).boundingBox())!;
    const box = (await credit.boundingBox())!;
    expect(overlaps(box, bar), JSON.stringify({ box, bar })).toBe(false);
    expect(box.y + box.height).toBeLessThanOrEqual(740);
  });
}
