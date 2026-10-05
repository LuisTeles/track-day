import { expect, test, type Page } from "@playwright/test";
import { NARROW_CORNERS, narrowTrackBackup } from "./fixtures/narrow-track";

async function loadSamples(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Load sample tracks" }).click();
  await expect(page.getByRole("link", { name: /Interlagos/ })).toBeVisible();
}

const markers = (page: Page) => page.locator("[data-corner]");

async function expectAllMarkersInViewport(page: Page) {
  const viewport = page.viewportSize()!;
  for (const box of await markers(page).evaluateAll((els) =>
    els.map((el) => el.getBoundingClientRect().toJSON() as DOMRect),
  )) {
    expect(box.left).toBeGreaterThanOrEqual(0);
    expect(box.top).toBeGreaterThanOrEqual(0);
    expect(box.right).toBeLessThanOrEqual(viewport.width);
    expect(box.bottom).toBeLessThanOrEqual(viewport.height);
  }
}

test("open Interlagos, select T1 and read its details", async ({ page }, testInfo) => {
  await loadSamples(page);
  await page.getByRole("link", { name: /Interlagos/ }).click();

  await expect(markers(page)).toHaveCount(15);
  await expectAllMarkersInViewport(page);
  await expect(page.getByRole("complementary")).toHaveCount(0); // closed by default

  await page.getByRole("button", { name: /^Turn 1,/ }).click();
  const panel = page.getByRole("complementary", { name: "T1 · S do Senna" });
  await expect(panel).toBeVisible();
  await expect(panel).toContainText("Part of S do Senna");
  await expect(page).toHaveURL(/corner=/);

  if (testInfo.project.name === "mobile") {
    // Bottom sheet: full width, anchored to the bottom.
    const box = (await panel.boundingBox())!;
    const viewport = page.viewportSize()!;
    expect(box.width).toBeCloseTo(viewport.width, 0);
    expect(box.y + box.height).toBeCloseTo(viewport.height, 0);
  }
  // The selected corner is panned out from under the panel.
  const marker = page.getByRole("button", { name: /^Turn 1,/ });
  await expect
    .poll(async () => {
      const m = (await marker.boundingBox())!;
      const p = (await panel.boundingBox())!;
      return testInfo.project.name === "mobile" ? m.y + m.height <= p.y : m.x + m.width <= p.x;
    })
    .toBe(true);
  await page.screenshot({ path: testInfo.outputPath("interlagos-t1.png") });

  await page.keyboard.press("Escape");
  await expect(page.getByRole("complementary")).toHaveCount(0);
  await expect(page).not.toHaveURL(/corner=/);
});

test("Suzuka (figure-eight) fits the viewport", async ({ page }, testInfo) => {
  await loadSamples(page);
  await page.getByRole("link", { name: /Suzuka/ }).click();
  await expect(markers(page)).toHaveCount(18);
  await expectAllMarkersInViewport(page);
  await page.screenshot({ path: testInfo.outputPath("suzuka.png") });
});

test("a very long, narrow track fits and its labels don't overlap", async ({ page }, testInfo) => {
  await page.goto("/backup/");
  await page.getByLabel("Backup file").setInputFiles({
    name: "narrow.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(narrowTrackBackup)),
  });
  await expect(page.getByText(/imported/)).toBeVisible();
  await page.goto("/");
  await page.getByRole("link", { name: /Narrow Test Circuit/ }).click();

  await expect(markers(page)).toHaveCount(NARROW_CORNERS);
  await expectAllMarkersInViewport(page);
  const boxes = await markers(page).evaluateAll((els) =>
    els.map((el) => el.getBoundingClientRect().toJSON() as DOMRect),
  );
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i]!;
      const b = boxes[j]!;
      const overlap =
        a.left < b.right - 1 &&
        b.left < a.right - 1 &&
        a.top < b.bottom - 1 &&
        b.top < a.bottom - 1;
      expect(overlap, `markers ${i + 1} and ${j + 1} overlap`).toBe(false);
    }
  }
  await page.screenshot({ path: testInfo.outputPath("narrow.png") });
});

test("zooming moves the map and reset view restores it", async ({ page }) => {
  await loadSamples(page);
  await page.getByRole("link", { name: /Interlagos/ }).click();
  const t10 = page.getByRole("button", { name: /^Turn 10,/ });
  const before = (await t10.boundingBox())!;

  await page.getByRole("button", { name: "Zoom in" }).click();
  await expect.poll(async () => (await t10.boundingBox())!.x).not.toBeCloseTo(before.x, 0);

  await page.getByRole("button", { name: "Reset view" }).click();
  await expect
    .poll(async () => Math.round((await t10.boundingBox())!.x))
    .toBe(Math.round(before.x));
  await expect
    .poll(async () => Math.round((await t10.boundingBox())!.y))
    .toBe(Math.round(before.y));
});
