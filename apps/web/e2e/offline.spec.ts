import { expect, test } from "@playwright/test";

test("practice mode and the track view work offline after the first visit", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Load sample tracks" }).click();
  await page.getByRole("link", { name: /Interlagos/ }).click();
  await page.getByRole("link", { name: "Practice" }).click();
  await expect(page.getByTestId("practice-card")).toBeVisible();

  // Wait until the service worker has precached everything and controls the page.
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) {
      await new Promise((resolve) =>
        navigator.serviceWorker.addEventListener("controllerchange", resolve),
      );
    }
  });

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByTestId("practice-card")).toHaveAttribute("aria-label", /^T1, S do Senna/);
  await page.keyboard.press("ArrowRight");
  await expect(page.getByTestId("practice-card")).toHaveAttribute("aria-label", /^T2,/);

  // Client-side navigation to other pages works offline too.
  await page.getByRole("link", { name: "Exit" }).click();
  await expect(page.locator("[data-corner]")).toHaveCount(15);
  await context.setOffline(false);
});

test("the app is installable: manifest and icons", async ({ request }) => {
  const manifest = await (await request.get("/manifest.webmanifest")).json();
  expect(manifest).toMatchObject({ name: "Track Day", display: "standalone", start_url: "/" });
  for (const icon of manifest.icons as { src: string }[]) {
    expect((await request.get(icon.src)).ok()).toBe(true);
  }
});
