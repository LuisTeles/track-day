import { expect, test } from "@playwright/test";

test("garage, driving with, class fallback, and compare", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Load sample tracks" }).click();
  await expect(page.getByRole("link", { name: /Interlagos/ })).toBeVisible();

  // The samples bring a Road car class guide for Interlagos; add a GT3 car to the garage.
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Cars" }).click();
  await page.getByRole("button", { name: "Add starter classes" }).click();
  await page.getByRole("button", { name: "Add Road car car" }).click();
  const form = page.getByRole("form", { name: "New car" });
  await form.getByLabel("Car name").fill("Mazda MX-5");
  await form.getByLabel("Sim").selectOption("assetto-corsa");
  await form.getByRole("button", { name: "Add car" }).click();
  await expect(page.getByText("Assetto Corsa", { exact: true })).toBeVisible();

  // Drive it: Interlagos opens with the Road car class guide, and says so.
  await page.getByRole("button", { name: "Driving: No car" }).click();
  await page.getByLabel("Driving", { exact: true }).selectOption({ label: "Mazda MX-5" });
  await expect(page.getByRole("button", { name: /^Driving: Mazda MX-5/ })).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("link", { name: "Tracks", exact: true }).click();
  await page.getByRole("link", { name: /Interlagos/ }).click();
  await page.getByRole("button", { name: /^Turn 1,/ }).click();
  await expect(page.getByRole("region", { name: "Class guide" })).toContainText(
    "no Mazda MX-5 guide on this layout yet",
  );

  // Give the MX-5 its own guide from the note, in edit mode. On a phone the
  // bottom sheet covers the toolbar: close it first.
  await page.getByRole("button", { name: "Close panel" }).click();
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByRole("button", { name: /^Turn 1,/ }).click();
  await page.getByRole("button", { name: "Add a guide for Mazda MX-5" }).click();
  const dialog = page.getByRole("alertdialog", { name: "Add a car" });
  await expect(dialog.getByLabel("Which car")).toHaveValue(/.+/);
  await dialog.getByRole("button", { name: "Add car" }).click();
  await expect(page.getByLabel("Car", { exact: true }).locator("option:checked")).toHaveText(
    /Mazda MX-5/,
  );
  await expect(page.getByRole("region", { name: "Class guide" })).toHaveCount(0);

  // Compare the two from the More menu.
  await page.getByRole("button", { name: "Close panel" }).click();
  await page.getByRole("button", { name: "More map actions" }).click();
  await page.getByRole("menuitem", { name: "Compare cars" }).click();
  await expect(page.getByRole("heading", { name: "Compare cars" })).toBeVisible();
  await expect(page.getByRole("table", { name: /^T1 · / })).toBeVisible();
});
