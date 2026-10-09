import { expect, test, type Page } from "@playwright/test";
import {
  followVideo,
  practiceWithMarkedVideo,
  setYtTime,
  ytTime,
} from "./fixtures/reference-video";

async function openPractice(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Load sample tracks" }).click();
  await page.getByRole("link", { name: /Interlagos/ }).click();
  await page.getByRole("link", { name: "Practice" }).click();
  await expect(page.getByTestId("practice-card")).toBeVisible();
}

test("practice card shows the corner's guidance", async ({ page }, testInfo) => {
  await openPractice(page);
  const card = page.getByTestId("practice-card");
  await expect(card).toHaveAttribute("aria-label", "T1, S do Senna, Left");
  await expect(card).toContainText("100 m board");
  await expect(card).toContainText("Heavy");
  await expect(card).toContainText("Estimate · low confidence");
  await expect(card).toContainText("Next");
  await page.screenshot({ path: testInfo.outputPath("practice.png") });

  if (testInfo.project.name === "mobile") {
    await page.setViewportSize({ width: 915, height: 412 }); // phone in landscape
    await page.screenshot({ path: testInfo.outputPath("practice-landscape.png") });
  }
});

test("practice starts at the corner chosen in the track view", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Load sample tracks" }).click();
  await page.getByRole("link", { name: /Interlagos/ }).click();
  await page.getByRole("button", { name: /^Turn 10,/ }).click();
  await page.getByRole("link", { name: "Practice from T10" }).click();
  await expect(page.getByTestId("practice-card")).toHaveAttribute(
    "aria-label",
    "T10, Bico de Pato, Right",
  );
  await expect(page).toHaveURL(/corner=10/);
});

const card = (page: Page) => page.getByTestId("practice-card");

test("keyboard steps through corners and wraps around the lap", async ({ page }) => {
  await openPractice(page);
  for (let i = 0; i < 5; i++) await page.keyboard.press("ArrowRight");
  await expect(page).toHaveURL(/corner=6/);
  await expect(card(page)).toHaveAttribute("aria-label", /^T6, Ferradura/);

  await page.keyboard.press("Home");
  await expect(card(page)).toHaveAttribute("aria-label", /^T1,/);
  await page.keyboard.press("ArrowLeft");
  await expect(card(page)).toHaveAttribute("aria-label", /^T15,/);

  // Reload lands on the same corner.
  await page.reload();
  await expect(card(page)).toHaveAttribute("aria-label", /^T15,/);

  // Escape goes back to the track view.
  await page.keyboard.press("Escape");
  await expect(page).toHaveURL(/\/tracks\/view\//);
});

test("tap zones and buttons navigate", async ({ page }) => {
  await openPractice(page);
  const box = (await page.locator("main").boundingBox())!;
  await page.mouse.click(box.x + box.width * 0.85, box.y + box.height / 2);
  await expect(card(page)).toHaveAttribute("aria-label", /^T2,/);
  await page.mouse.click(box.x + box.width * 0.1, box.y + box.height / 2);
  await expect(card(page)).toHaveAttribute("aria-label", /^T1,/);

  await page.getByRole("button", { name: "Next corner" }).click();
  await expect(card(page)).toHaveAttribute("aria-label", /^T2,/);
  // Space on the focused button presses the button only, not "next" twice.
  await page.keyboard.press(" ");
  await expect(card(page)).toHaveAttribute("aria-label", /^T3,/);
});

test("complex mode drives the Senna S as one step", async ({ page }) => {
  await openPractice(page);
  await page.getByRole("button", { name: "Options" }).click();
  await page.getByRole("button", { name: "Step by complex" }).click();
  await expect(page).toHaveURL(/step=complex/);
  await page.keyboard.press("Escape"); // keys step corners only with the popover closed
  await expect(card(page)).toHaveAttribute("aria-label", "T1–T2, S do Senna, Left → Right");
  await page.keyboard.press("ArrowRight");
  await expect(card(page)).toHaveAttribute("aria-label", /^T3, Curva do Sol/);
  await page.keyboard.press("ArrowRight");
  await expect(card(page)).toHaveAttribute("aria-label", /^T4–T5, Descida do Lago/);
});

test("rig controls: text size, screen status, resume where you left off", async ({ page }) => {
  await openPractice(page);

  await page.getByRole("button", { name: "Options" }).click();
  // Screen wake lock reports a state (support varies by browser/headless mode).
  await expect(page.getByTestId("wake-lock")).toHaveAttribute(
    "data-status",
    /active|released|error|unsupported/,
  );

  const title = page.getByRole("heading", { level: 1 });
  const before = await title.evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  await page.getByRole("radio", { name: "L" }).check({ force: true });
  await expect
    .poll(() => title.evaluate((el) => parseFloat(getComputedStyle(el).fontSize)))
    .toBeGreaterThan(before);
  await page.keyboard.press("Escape");

  // Leave at T5, come back through "Practice" (no corner in the link): resumes at T5.
  for (let i = 0; i < 4; i++) await page.keyboard.press("ArrowRight");
  await expect(card(page)).toHaveAttribute("aria-label", /^T5,/);
  await page.getByRole("link", { name: "Exit" }).click();
  await page.getByRole("link", { name: "Practice" }).click();
  await expect(card(page)).toHaveAttribute("aria-label", /^T5,/);
  await page.getByRole("button", { name: "Options" }).click();
  await expect(page.getByRole("radiogroup", { name: "Text size" })).toBeVisible();
  await expect(page.getByRole("radio", { name: "L" })).toBeChecked();
});

test("corner diagram shows the real corner with brake and apex markers", async ({
  page,
}, testInfo) => {
  await openPractice(page);
  const diagram = page.getByTestId("corner-diagram");
  await expect(diagram).toHaveAttribute("data-schematic", "false");
  await expect(diagram.locator('[data-marker="brake"]')).toContainText("100 m board");
  await expect(diagram.locator('[data-marker="apex"]')).toContainText("T1");
  await expect(page.getByTestId("diagram-racing-line")).toHaveCount(1);
  await page.screenshot({ path: testInfo.outputPath("diagram-t1.png") });

  await page.keyboard.press("End");
  for (let i = 0; i < 9; i++) await page.keyboard.press("ArrowRight");
  await expect(card(page)).toHaveAttribute("aria-label", /^T10,/);
  await page.screenshot({ path: testInfo.outputPath("diagram-t10.png") });

  await page.keyboard.press("Home");
  await page.getByRole("button", { name: "Options" }).click();
  await page.getByRole("button", { name: "Step by complex" }).click();
  await page.keyboard.press("Escape");
  await expect(diagram.locator('[data-marker="apex"]')).toHaveCount(2);
  await page.screenshot({ path: testInfo.outputPath("diagram-senna.png") });
});

test("a bound wheel button advances the corner (simulated gamepad)", async ({ page }) => {
  // Fake wheel: the test flips button states; the app polls getGamepads().
  await page.addInitScript(() => {
    const pad = {
      id: "Test Wheel (Vendor: 0001 Product: 0002)",
      index: 0,
      buttons: Array.from({ length: 12 }, () => ({ pressed: false })),
    };
    (window as unknown as { __pad: typeof pad }).__pad = pad;
    Object.defineProperty(navigator, "getGamepads", { value: () => [pad] });
  });
  const press = async (button: number) => {
    // Let the poller take a baseline frame first (it fires on rising edges).
    await page.waitForTimeout(150);
    await page.evaluate((b) => {
      (window as unknown as { __pad: { buttons: { pressed: boolean }[] } }).__pad.buttons[b] = {
        pressed: true,
      };
    }, button);
    await page.waitForTimeout(100);
    await page.evaluate((b) => {
      (window as unknown as { __pad: { buttons: { pressed: boolean }[] } }).__pad.buttons[b] = {
        pressed: false,
      };
    }, button);
    await page.waitForTimeout(100);
  };

  await openPractice(page);
  await page.getByRole("button", { name: "Options" }).click();
  const settings = page.getByTestId("wheel-buttons");
  await settings.getByRole("button", { name: "Set" }).first().click();
  await expect(settings).toContainText("Press the button for next corner");
  await press(4);
  await expect(settings).toContainText("Next: Test Wheel · button 5");

  await page.getByRole("button", { name: "Options" }).click(); // close the menu
  await press(4);
  await expect(card(page)).toHaveAttribute("aria-label", /^T2,/);
  await press(4);
  await expect(card(page)).toHaveAttribute("aria-label", /^T3,/);
  await press(7); // unbound
  await expect(card(page)).toHaveAttribute("aria-label", /^T3,/);
});

test("controls fit a 360px phone without clipping", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "phone layout");
  await page.setViewportSize({ width: 360, height: 740 });
  await openPractice(page);
  const row = page.locator("[data-no-nav]");
  const { scrollWidth, clientWidth } = await row.evaluate((el) => ({
    scrollWidth: el.scrollWidth,
    clientWidth: el.clientWidth,
  }));
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
  const exit = (await page.getByRole("link", { name: "Exit" }).boundingBox())!;
  expect(exit.x + exit.width).toBeLessThanOrEqual(360);
});

test("practice card fits the viewport without clipping on a phone in both orientations", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "mobile");
  await openPractice(page);
  for (const size of [
    { width: 360, height: 740 },
    { width: 740, height: 360 },
  ]) {
    await page.setViewportSize(size);
    const card = (await page.getByTestId("practice-card").boundingBox())!;
    expect(card.y + card.height).toBeLessThanOrEqual(size.height);
    // The cue is never cut mid-line: its box fits inside the card.
    const cue = (await page.getByTestId("practice-cue").boundingBox())!;
    expect(cue.y + cue.height).toBeLessThanOrEqual(card.y + card.height);
  }
});

test("following the reference video: the video moves the card, Next seeks the video", async ({
  page,
}) => {
  await practiceWithMarkedVideo(page);
  await page.getByRole("button", { name: "Options" }).click();
  await expect(page.getByRole("switch", { name: "Follow reference video" })).toHaveAttribute(
    "aria-checked",
    "false",
  );
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("corner-diagram")).toBeVisible();
  await followVideo(page);
  await expect(page.getByTestId("corner-diagram")).toHaveCount(0);
  // The video starts at the card's corner.
  await expect.poll(() => ytTime(page)).toBe(10);

  await setYtTime(page, 21);
  await expect(card(page)).toHaveAttribute("aria-label", /^T2,/);

  await page.getByRole("button", { name: "Next corner" }).click();
  await expect(card(page)).toHaveAttribute("aria-label", /^T3,/);
  await expect.poll(() => ytTime(page)).toBe(30);
  // No tug of war: the card stays where it was sent.
  await page.waitForTimeout(600);
  await expect(card(page)).toHaveAttribute("aria-label", /^T3,/);

  // T4 isn't marked: the card moves, the video stays.
  await page.keyboard.press("ArrowRight");
  await expect(card(page)).toHaveAttribute("aria-label", /^T4,/);
  await page.waitForTimeout(600);
  expect(await ytTime(page)).toBe(30);
  await expect(card(page)).toHaveAttribute("aria-label", /^T4,/);

  // The choice is remembered; leaving practice stops the player.
  await page.reload();
  await expect(page.getByTestId("fake-youtube")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page).toHaveURL(/\/tracks\/view\//);
  await expect(page.getByTestId("fake-youtube")).toHaveCount(0);
});

test("practice card fits a phone in both orientations while following the video", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "mobile");
  await practiceWithMarkedVideo(page);
  await followVideo(page);
  for (const size of [
    { width: 360, height: 740 },
    { width: 740, height: 360 },
  ]) {
    await page.setViewportSize(size);
    const box = (await card(page).boundingBox())!;
    expect(box.y + box.height).toBeLessThanOrEqual(size.height);
    const player = (await page.getByTestId("fake-youtube").boundingBox())!;
    expect(player.height).toBeGreaterThan(0);
    expect(player.y + player.height).toBeLessThanOrEqual(box.y + box.height);
    expect(player.x + player.width).toBeLessThanOrEqual(size.width);
    // The guidance is still all there.
    const cue = (await page.getByTestId("practice-cue").boundingBox())!;
    expect(cue.y + cue.height).toBeLessThanOrEqual(box.y + box.height);
  }
});
