import { expect, test } from "@playwright/test";

test("build a track by hand: new track, corners, a complex and a second layout", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("link", { name: "New track" }).click();
  await page.getByLabel("Track name").fill("Kartódromo Granja Viana");
  await page.getByLabel("Short name").fill("Granja");
  await page.getByLabel("Lap length (m)").fill("1050");
  await page.getByLabel("Direction").selectOption("clockwise");
  await page.getByRole("button", { name: "Create track" }).click();

  // The new track opens in edit mode with the corner list.
  const panel = page.getByTestId("side-panel");
  await expect(panel.getByText("This layout has no corners yet.")).toBeVisible();
  for (const n of [1, 2]) {
    await panel.getByRole("button", { name: "Add corner" }).click();
    await expect(panel.getByRole("heading", { name: `Turn ${n}` })).toBeVisible();
    const facts = panel.getByRole("form", { name: "Corner details" });
    await facts.getByLabel("Name", { exact: true }).fill(`Curva ${n}`);
    await facts.getByLabel("Direction").selectOption(n === 1 ? "right" : "left");
    await facts.getByRole("button", { name: "Save corner details" }).click();
    await expect(facts.getByText("Saved")).toBeVisible();
    // On a phone the bottom sheet covers the toolbar: close it first.
    await panel.getByRole("button", { name: "Close panel" }).click();
    await page.getByRole("button", { name: "Corners" }).click();
  }
  await expect(panel.getByRole("list", { name: "Corners in lap order" })).toContainText("Curva 2");

  // A complex of both corners.
  await panel.getByRole("button", { name: "Close panel" }).click();
  await page.getByRole("button", { name: "More map actions" }).click();
  await page.getByRole("menuitem", { name: "Complexes & segments" }).click();
  await panel.getByRole("button", { name: "Add complex" }).click();
  const complex = panel.getByRole("form", { name: "New complex" });
  await complex.getByLabel("Name").fill("S da Granja");
  await complex.getByRole("checkbox", { name: "T1" }).check();
  await complex.getByRole("checkbox", { name: "T2" }).check();
  await complex.getByRole("button", { name: "Save new complex" }).click();
  await expect(panel.getByText("T1 + T2")).toBeVisible();

  // A second layout, which becomes the current one.
  await panel.getByRole("button", { name: "Close panel" }).click();
  await page.getByRole("button", { name: "More map actions" }).click();
  await page.getByRole("menuitem", { name: "Track details" }).click();
  await panel.getByRole("button", { name: "Add layout" }).click();
  await panel.getByRole("form", { name: "New layout" }).getByLabel("Layout name").fill("Short");
  await panel
    .getByRole("form", { name: "New layout" })
    .getByRole("button", { name: "Add layout" })
    .click();
  await expect(page.getByRole("combobox", { name: "Layout" }).locator("option:checked")).toHaveText(
    "Short",
  );

  // Back home, the track is listed by its short name.
  await page.getByRole("link", { name: "Back to tracks" }).click();
  await expect(page.getByRole("link", { name: /Granja/ })).toBeVisible();
});
