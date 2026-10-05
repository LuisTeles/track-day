import { expect, test, type Page } from "@playwright/test";

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
  await page.getByText("Options").click();
  await page.getByRole("button", { name: "By complex" }).click();
  await expect(page).toHaveURL(/step=complex/);
  await expect(card(page)).toHaveAttribute("aria-label", "T1–T2, S do Senna, Left → Right");
  await page.keyboard.press("ArrowRight");
  await expect(card(page)).toHaveAttribute("aria-label", /^T3, Curva do Sol/);
  await page.keyboard.press("ArrowRight");
  await expect(card(page)).toHaveAttribute("aria-label", /^T4–T5, Descida do Lago/);
});

test("rig controls: text size, screen status, resume where you left off", async ({ page }) => {
  await openPractice(page);

  await page.getByText("Options").click();
  // Screen wake lock reports a state (support varies by browser/headless mode).
  await expect(page.getByTestId("wake-lock")).toHaveAttribute(
    "data-status",
    /active|released|error|unsupported/,
  );

  const title = page.getByRole("heading", { level: 1 });
  const before = await title.evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  await page.getByRole("combobox", { name: "Text size" }).selectOption("L");
  await expect
    .poll(() => title.evaluate((el) => parseFloat(getComputedStyle(el).fontSize)))
    .toBeGreaterThan(before);

  // Leave at T5, come back through "Practice" (no corner in the link): resumes at T5.
  for (let i = 0; i < 4; i++) await page.keyboard.press("ArrowRight");
  await expect(card(page)).toHaveAttribute("aria-label", /^T5,/);
  await page.getByRole("link", { name: "Exit" }).click();
  await page.getByRole("link", { name: "Practice" }).click();
  await expect(card(page)).toHaveAttribute("aria-label", /^T5,/);
  await page.getByText("Options").click();
  await expect(page.getByRole("combobox", { name: "Text size" })).toHaveValue("L");
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
  await page.getByText("Options").click();
  await page.getByRole("button", { name: "By complex" }).click();
  await expect(diagram.locator('[data-marker="apex"]')).toHaveCount(2);
  await page.screenshot({ path: testInfo.outputPath("diagram-senna.png") });
});
