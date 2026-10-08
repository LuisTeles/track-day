import { expect, test, type Page } from "@playwright/test";

async function loadSamples(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Load sample tracks" }).click();
  await expect(page.getByRole("link", { name: /Interlagos/ })).toBeVisible();
}

test("print the Interlagos cheat sheet, black on white even in dark mode", async ({
  page,
}, testInfo) => {
  await loadSamples(page);
  await page.getByRole("link", { name: /Interlagos/ }).click();
  await expect(page.locator("[data-corner]").first()).toBeVisible();
  await page.getByRole("button", { name: "More map actions" }).click();
  await page.getByRole("menuitem", { name: "Cheat sheet" }).click();

  await expect(page).toHaveURL(/\/tracks\/print\/?\?/);
  await expect(page.getByRole("rowheader", { name: "T1", exact: true })).toBeVisible();
  await expect(page.getByRole("img", { name: /^Map of .*Interlagos/ })).toBeVisible();

  await page.emulateMedia({ media: "print", colorScheme: "dark" });
  const sheet = page.getByTestId("cheat-sheet");
  await expect(sheet).toHaveCSS("background-color", "rgb(255, 255, 255)");
  await expect(sheet).toHaveCSS("color", "rgb(23, 23, 23)");
  await expect(page.getByRole("button", { name: "Print" })).toBeHidden();
  await page.screenshot({
    path: testInfo.outputPath(`cheat-sheet-print-${testInfo.project.name}.png`),
    fullPage: true,
  });
});
