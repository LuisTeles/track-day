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
