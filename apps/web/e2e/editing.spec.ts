import { expect, test } from "@playwright/test";

test("edit a car's corner, place its apex, and see it in practice", async ({ page, isMobile }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Load sample tracks" }).click();
  await page.getByRole("link", { name: /Interlagos/ }).click();

  // Add a car.
  await page.getByLabel("Car", { exact: true }).selectOption("__add__");
  await page.getByLabel("Car name", { exact: true }).fill("Mazda MX-5");
  await page.getByLabel("Sim").selectOption("assetto-corsa");
  await page.getByRole("button", { name: "Add car", exact: true }).click();
  await expect(page.getByLabel("Car", { exact: true }).locator("option:checked")).toHaveText(
    /Mazda MX-5/,
  );

  // Edit T1.
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  const t1 = page.getByRole("button", { name: /^Turn 1,/ });
  await t1.click();
  await page.getByLabel("Minimum speed (km/h)").fill("70");
  await page.getByLabel("Gear", { exact: true }).fill("2");
  await page.getByLabel("Car notes", { exact: true }).fill("Brake before the bridge shadow");
  await page.getByRole("button", { name: "Save car values" }).click();
  await expect(page.getByText("Saved")).toBeVisible();

  // Place the apex where the T1 marker is (measured now: selecting it panned the map).
  await page.getByRole("button", { name: "Set apex" }).click();
  // On a phone the bottom sheet covers the lower map: if it overlaps T1, pan T1 up into view.
  const sheet = (await page.getByRole("complementary").boundingBox())!;
  const overlaps = (m: { x: number; y: number; width: number; height: number }) =>
    m.x < sheet.x + sheet.width &&
    m.x + m.width > sheet.x &&
    m.y < sheet.y + sheet.height &&
    m.y + m.height > sheet.y;
  if (overlaps((await t1.boundingBox())!)) {
    // Start the drag on bare map canvas (no marker, control or link), centred above the sheet.
    const start = await page.evaluate(
      ({ cx, top }) => {
        for (let y = top - 20; y > 120; y -= 10) {
          const el = document.elementFromPoint(cx, y);
          if (el && !el.closest("button, a, [role=toolbar], header, aside")) return { x: cx, y };
        }
        return null;
      },
      { cx: page.viewportSize()!.width / 2, top: sheet.y },
    );
    expect(start).not.toBeNull();
    await page.mouse.move(start!.x, start!.y);
    await page.mouse.down();
    await page.mouse.move(start!.x, start!.y - 300, { steps: 10 });
    await page.mouse.up();
  }
  const box = (await t1.boundingBox())!;
  // T1 must be clear of the panel before it is clicked.
  expect(overlaps(box)).toBe(false);
  const [x, y] = [box.x + box.width / 2, box.y + box.height / 2];
  // A touch device taps; with touch emulation a synthetic mouse click yields no click event.
  if (isMobile) await page.touchscreen.tap(x, y);
  else await page.mouse.click(x, y);
  await expect(page.locator("[data-testid=car-line]")).toHaveCount(1);

  // Practice from T1 shows the values, the note and the car's line.
  await page.getByRole("link", { name: "Practice from T1" }).click();
  const card = page.getByTestId("practice-card");
  await expect(card).toContainText("70");
  await expect(page.getByTestId("practice-notes")).toContainText("Brake before the bridge shadow");
  await expect(page.locator("[data-testid=diagram-racing-line]")).toHaveAttribute(
    "data-source",
    "car",
  );

  // Quick note, then find it in the track view.
  await page.getByRole("button", { name: "Note", exact: true }).click();
  await page.getByLabel("Note", { exact: true }).fill("Turn in later");
  await page.getByRole("button", { name: "Save note" }).click();
  await expect(page.getByTestId("practice-notes")).toContainText("Turn in later");
  await page.keyboard.press("Escape");
  await expect(page).toHaveURL(/\/tracks\/view\//);

  // Back in the track view (view mode), T1 shows the car note and the quick note.
  const car = page.getByLabel("Car", { exact: true });
  const mx5 = await car.locator("option", { hasText: "Mazda MX-5" }).getAttribute("value");
  await car.selectOption(mx5!);
  await page.getByRole("button", { name: /^Turn 1,/ }).click();
  const panel = page.getByTestId("side-panel");
  await expect(panel).toContainText("Brake before the bridge shadow");
  await expect(panel).toContainText("Turn in later");
});
