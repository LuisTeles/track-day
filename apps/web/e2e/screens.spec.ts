import { expect, test } from "@playwright/test";

// Not an assertion suite: run with SCREENS=1 to capture every surface for a
// human to compare before/after (test-results/ is gitignored).
test.skip(!process.env.SCREENS, "set SCREENS=1 to capture screenshots");

for (const scheme of ["light", "dark"] as const) {
  test(`screens (${scheme})`, async ({ page, isMobile }, testInfo) => {
    await page.emulateMedia({ colorScheme: scheme });
    const shot = (name: string) =>
      page.screenshot({ path: testInfo.outputPath(`${scheme}-${name}.png`), fullPage: true });

    await page.goto("/");
    await shot("home-empty");
    await page.getByRole("button", { name: "Load sample tracks" }).click();
    await expect(page.getByRole("link", { name: /Interlagos/ })).toBeVisible();
    await shot("home");
    await page.goto("/backup/");
    await shot("backup");
    await page.goto("/tracks/import/");
    await shot("import");
    await page.goto("/");
    await page.getByRole("link", { name: /Interlagos/ }).click();
    await expect(page.locator("[data-corner]").first()).toBeVisible();
    await shot("track");
    await page.getByRole("button", { name: /^Turn 1,/ }).click();
    await shot("track-panel");
    // On phones the bottom sheet covers the toolbar, so close it first.
    if (isMobile) await page.getByRole("button", { name: "Close panel" }).click();
    await page.getByRole("button", { name: "Edit" }).click();
    await shot("track-edit");
    await page.goto(page.url().replace("/tracks/view/", "/tracks/practice/"));
    await expect(page.getByTestId("practice-card")).toBeVisible();
    await shot("practice");
  });
}
