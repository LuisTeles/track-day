import { expect, test } from "@playwright/test";

test("shows the empty track list", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Tracks" })).toBeVisible();
  await expect(page.getByText("No tracks yet")).toBeVisible();
});

test("restores a backup and lists its tracks after a reload", async ({ page }) => {
  const now = "2026-10-04T00:00:00.000Z";
  const backup = {
    schemaVersion: 2,
    kind: "backup",
    exportedAt: now,
    data: {
      tracks: [
        {
          id: crypto.randomUUID(),
          createdAt: now,
          updatedAt: now,
          deletedAt: null,
          name: "Autódromo José Carlos Pace",
          aliases: ["Interlagos"],
          country: "BR",
          city: "São Paulo",
          sims: [],
        },
      ],
      layouts: [],
      corners: [],
      segments: [],
      complexes: [],
      carClasses: [],
      cars: [],
      guides: [],
      cornerGuides: [],
      assets: [],
    },
  };

  await page.goto("/backup/");
  await page.getByLabel("Backup file").setInputFiles({
    name: "backup.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(backup)),
  });
  await expect(page.getByText(/imported/)).toBeVisible();

  await page.goto("/");
  await page.reload();
  await expect(page.getByText("Autódromo José Carlos Pace")).toBeVisible();
  await expect(page.getByText(/Interlagos/)).toBeVisible();
});
