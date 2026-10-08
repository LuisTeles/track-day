import { expect, test, type Page } from "@playwright/test";
import { NARROW_CORNERS, narrowTrackBackup } from "./fixtures/narrow-track";

async function loadSamples(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Load sample tracks" }).click();
  await expect(page.getByRole("link", { name: /Interlagos/ })).toBeVisible();
}

const markers = (page: Page) => page.locator("[data-corner]");

/** Below sm (every phone), zoom lives in the More map actions menu. */
async function zoomIn(page: Page) {
  const button = page.getByRole("button", { name: "Zoom in" });
  if (await button.isVisible()) return button.click();
  await page.getByRole("button", { name: "More map actions" }).click();
  await page.getByRole("menuitem", { name: "Zoom in" }).click();
}

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

  await zoomIn(page);
  await expect.poll(async () => (await t10.boundingBox())!.x).not.toBeCloseTo(before.x, 0);

  await page.getByRole("button", { name: "More map actions" }).click();
  await page.getByRole("menuitem", { name: "Reset view" }).click();
  await expect
    .poll(async () => Math.round((await t10.boundingBox())!.x))
    .toBe(Math.round(before.x));
  await expect
    .poll(async () => Math.round((await t10.boundingBox())!.y))
    .toBe(Math.round(before.y));
});

test("speed & gear chips come from the guide and can be hidden", async ({ page }, testInfo) => {
  await loadSamples(page);
  await page.getByRole("link", { name: /Interlagos/ }).click();

  const t10 = page.getByRole("button", { name: /^Turn 10,/ });
  await expect(t10).toContainText("50 km/h · G2 est.");
  await expect(page.getByRole("combobox", { name: "Car" })).toHaveValue(/.+/);
  await page.screenshot({ path: testInfo.outputPath("chips.png") });

  await t10.click();
  const panel = page.getByRole("complementary");
  await expect(panel).toContainText("Road car · any sim");
  await expect(panel).toContainText("AI estimate · low confidence");
  await expect(panel).toContainText("50 km/h");
  await page.keyboard.press("Escape");

  // Escape above closed the panel (on phones it would cover the toolbar).
  await page.getByRole("button", { name: "Layers" }).click();
  const toggle = page.getByRole("menuitemcheckbox", { name: "Speed & gear" });
  await expect(toggle).toHaveAttribute("aria-checked", "true");
  await toggle.click();
  await expect(t10).not.toContainText("km/h");

  // Remembered across reloads (per browser).
  await page.reload();
  await page.getByRole("button", { name: "Layers" }).click();
  await expect(page.getByRole("menuitemcheckbox", { name: "Speed & gear" })).toHaveAttribute(
    "aria-checked",
    "false",
  );
});

test("tracks without a guide have no chips and the toggle is disabled", async ({ page }) => {
  await loadSamples(page);
  await page.getByRole("link", { name: /Suzuka/ }).click();
  await expect(page.locator("[data-corner]")).toHaveCount(18);
  await page.getByRole("button", { name: "Layers" }).click();
  await expect(page.getByRole("menuitemcheckbox", { name: "Speed & gear" })).toBeDisabled();
  await page.keyboard.press("Escape");
  // The car select stays (to add a car) but has no car to pick.
  await expect(page.getByRole("combobox", { name: "Car" }).locator("option:checked")).toHaveText(
    "No car yet",
  );
});

test("racing line layer can be toggled where one exists", async ({ page }, testInfo) => {
  await loadSamples(page);
  await page.getByRole("link", { name: /Interlagos/ }).click();
  const line = page.getByTestId("racing-line");
  await expect(line).toHaveCount(1);

  // Zoom into the Senna S to see the line on the asphalt.
  await page.getByRole("button", { name: "Layers" }).click();
  await page.getByRole("menuitemcheckbox", { name: "Speed & gear" }).click();
  const t3 = page.getByRole("button", { name: /^Turn 3,/ });
  const before = (await t3.boundingBox())!;
  if (testInfo.project.name === "mobile") {
    // Playwright can't emit wheel events under touch emulation; phones pinch.
    for (let i = 0; i < 3; i++) await zoomIn(page);
  } else {
    // Wheel over a marker must zoom the map (events bubble to the canvas).
    const t1 = (await page.getByRole("button", { name: /^Turn 1,/ }).boundingBox())!;
    await page.mouse.move(t1.x + t1.width / 2, t1.y + t1.height / 2);
    for (let i = 0; i < 6; i++) await page.mouse.wheel(0, -300);
  }
  await expect
    .poll(async () => {
      const after = (await t3.boundingBox())!;
      return Math.hypot(after.x - before.x, after.y - before.y);
    })
    .toBeGreaterThan(50);
  await page.screenshot({ path: testInfo.outputPath("racing-line.png") });

  const toggleRacingLine = async () => {
    await page.getByRole("button", { name: "Layers" }).click();
    await page.getByRole("menuitemcheckbox", { name: "Racing line" }).click();
  };
  await toggleRacingLine();
  await expect(line).toHaveCount(0);
  await toggleRacingLine();
  await expect(line).toHaveCount(1);

  await page.goto("/");
  await page.getByRole("link", { name: /Suzuka/ }).click();
  await page.getByRole("button", { name: "Layers" }).click();
  await expect(page.getByRole("menuitemcheckbox", { name: "Racing line" })).toBeDisabled();
  await expect(line).toHaveCount(0);
});

test("the map toolbar stays one row on a small phone", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile");
  await page.setViewportSize({ width: 360, height: 740 });
  await loadSamples(page);
  await page.getByRole("link", { name: /Interlagos/ }).click();
  const bar = page.getByRole("toolbar", { name: "Map controls" });
  const box = (await bar.boundingBox())!;
  expect(box.height).toBeLessThanOrEqual(56);
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(360);
  // The bar scrolls when it overflows, so also require that nothing is scrolled off.
  const { scrollWidth, clientWidth } = await bar.evaluate((el) => ({
    scrollWidth: el.scrollWidth,
    clientWidth: el.clientWidth,
  }));
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
  const more = (await page.getByRole("button", { name: "More map actions" }).boundingBox())!;
  expect(more.x + more.width).toBeLessThanOrEqual(360);
  // The car picker shows its label, not just the chevron.
  const car = page.getByRole("combobox", { name: "Car" });
  expect((await car.boundingBox())!.width).toBeGreaterThanOrEqual(96);
});

test("Escape closes the Layers menu and leaves the side panel open", async ({ page }, testInfo) => {
  // Phones: the bottom sheet covers the toolbar while it is open.
  test.skip(testInfo.project.name === "mobile");
  await loadSamples(page);
  await page.getByRole("link", { name: /Interlagos/ }).click();
  await page.getByRole("button", { name: /^Turn 3,/ }).click();
  const panel = page.getByRole("complementary");
  await expect(panel).toBeVisible();
  await page.getByRole("button", { name: "Layers" }).click();
  await expect(page.getByRole("menuitemcheckbox", { name: "Racing line" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menuitemcheckbox", { name: "Racing line" })).toHaveCount(0);
  await expect(panel).toBeVisible();
});
