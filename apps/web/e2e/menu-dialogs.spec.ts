import { expect, test, type Locator, type Page } from "@playwright/test";

// Every "More map actions" item that opens, or can open, a dialog. A modal
// menu closing while a modal dialog opens used to leave `pointer-events: none`
// on <body>: buttons still worked, but text fields, links and the map didn't.

async function openInterlagosWithCar(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Load sample tracks" }).click();
  await page.getByRole("link", { name: /Interlagos/ }).click();
  await page.getByLabel("Car", { exact: true }).selectOption("__add__");
  await page.getByLabel("Car name", { exact: true }).fill("Mazda MX-5");
  await page.getByRole("button", { name: "Add car", exact: true }).click();
  await expect(page.getByLabel("Car", { exact: true }).locator("option:checked")).toHaveText(
    /Mazda MX-5/,
  );
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(page).toHaveURL(/[?&]edit=1/);
  await expect(page.getByRole("button", { name: "Edit", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
}

async function menu(page: Page, item: string) {
  await page.getByRole("button", { name: "More map actions" }).click();
  await page.getByRole("menuitem", { name: item }).click();
}

async function dirtySetup(page: Page): Promise<Locator> {
  await menu(page, "Car setup");
  const notes = page.getByLabel("Setup notes");
  await notes.fill("Soft springs");
  return notes;
}

async function dirtyCorner(page: Page): Promise<Locator> {
  await page.getByRole("button", { name: /^Turn 1,/ }).click();
  const notes = page.getByLabel("Corner notes", { exact: true });
  await notes.fill("Unsaved thought");
  return notes;
}

async function expectBodyTakesPointer(page: Page) {
  await expect
    .poll(() => page.evaluate(() => getComputedStyle(document.body).pointerEvents))
    .not.toBe("none");
}

/** The body takes pointer events again, and a real click on a text field lands. */
async function expectClickable(page: Page, field: Locator, typed: string) {
  await expectBodyTakesPointer(page);
  await field.click({ timeout: 3000 });
  await expect(field).toBeFocused();
  await page.keyboard.press("End");
  await page.keyboard.type(typed);
  await expect(field).toHaveValue(new RegExp(`${typed}$`));
}

function discardDialog(page: Page) {
  return page.getByRole("alertdialog", { name: "Discard unsaved changes?" });
}

async function keepEditing(page: Page) {
  const dialog = discardDialog(page);
  await dialog.getByRole("button", { name: "Keep editing" }).click();
  await expect(dialog).toBeHidden();
}

async function discard(page: Page) {
  const dialog = discardDialog(page);
  await dialog.getByRole("button", { name: "Discard changes" }).click();
  await expect(dialog).toBeHidden();
}

test.describe("dialogs opened from the More menu leave the page clickable", () => {
  test.beforeEach(async ({ page }) => openInterlagosWithCar(page));

  test("Keyboard shortcuts → Close", async ({ page }) => {
    await menu(page, "Keyboard shortcuts");
    const dialog = page.getByRole("alertdialog", { name: "Keyboard shortcuts" });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Close" }).click();
    await expect(dialog).toBeHidden();
    await expectBodyTakesPointer(page);
    // dirtyCorner clicks a map marker, then the notes field.
    const notes = await dirtyCorner(page);
    await expectClickable(page, notes, " more");
  });

  test("the non-modal menus still close on Escape and on an outside click", async ({
    page,
    isMobile,
  }) => {
    const items = page.getByRole("menu");
    for (const name of ["More map actions", "Layers"]) {
      await page.getByRole("button", { name }).click();
      await expect(items).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(items).toBeHidden();

      await page.getByRole("button", { name }).click();
      await expect(items).toBeVisible();
      // An empty spot on the map, well away from the menus and the toolbar.
      // Radix starts listening for outside presses a tick after opening, so
      // a press that lands sooner (a loaded CI box) is retried.
      await expect(async () => {
        if (isMobile) await page.touchscreen.tap(8, 120);
        else await page.mouse.click(8, 120);
        await expect(items).toBeHidden({ timeout: 1000 });
      }).toPass();
    }
  });
});

// A dirty panel is open in these. On a phone its bottom sheet covers the
// toolbar, so the More menu can't be reached there and the paths don't exist.
test.describe("dialogs opened from the More menu over unsaved edits leave the page clickable", () => {
  test.beforeEach(async ({ page, isMobile }) => {
    test.skip(isMobile, "the bottom sheet covers the toolbar while editing");
    await openInterlagosWithCar(page);
  });

  test("Cheat sheet with dirty setup → Keep editing", async ({ page }) => {
    const notes = await dirtySetup(page);
    await menu(page, "Cheat sheet");
    await keepEditing(page);
    await expect(page).toHaveURL(/\/tracks\/view\//);
    await expectClickable(page, notes, " later");
  });

  test("Cheat sheet with dirty setup → Discard changes", async ({ page }) => {
    await dirtySetup(page);
    await menu(page, "Cheat sheet");
    await discard(page);
    await expect(page).toHaveURL(/\/tracks\/print\/?\?/);
    // Client-side navigation keeps the same <body>.
    await expectBodyTakesPointer(page);
    // A trial click runs Playwright's hit test: plain table text must take the pointer.
    await page
      .getByRole("rowheader", { name: "T1", exact: true })
      .click({ trial: true, timeout: 3000 });
  });

  test("Car setup with dirty corner edits → Keep editing", async ({ page }) => {
    const notes = await dirtyCorner(page);
    await menu(page, "Car setup");
    await keepEditing(page);
    await expectClickable(page, notes, " more");
  });

  test("Car setup with dirty corner edits → Discard changes", async ({ page }) => {
    await dirtyCorner(page);
    await menu(page, "Car setup");
    await discard(page);
    await expectClickable(page, page.getByLabel("Setup notes"), "Hard springs");
  });

  test("Redo map with dirty setup → Keep editing", async ({ page }) => {
    const notes = await dirtySetup(page);
    await menu(page, "Redo map");
    await keepEditing(page);
    await expectClickable(page, notes, " later");
  });

  test("Redo map with dirty setup → Discard changes", async ({ page }) => {
    await dirtySetup(page);
    await menu(page, "Redo map");
    await discard(page);
    const redo = page.getByRole("complementary", { name: "Redo map from OpenStreetMap" });
    await expectClickable(page, redo.getByLabel("Circuit"), "Interlagos");
  });
});
