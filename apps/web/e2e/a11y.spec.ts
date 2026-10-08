import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

type PageKey = "home-empty" | "home" | "backup" | "import" | "track" | "track-panel" | "practice";

/**
 * Rule ids that fail today, per page. Each UI task removes the ones it fixes;
 * the last task requires every list to be empty. Never add to this list.
 */
const KNOWN_VIOLATIONS: Record<PageKey, string[]> = {
  "home-empty": [],
  home: [],
  backup: [],
  import: [],
  track: [],
  "track-panel": [],
  practice: [],
};

test("no page has known violations left", () => {
  expect(Object.values(KNOWN_VIOLATIONS).flat()).toEqual([]);
});

async function scan(page: Page, key: PageKey) {
  const { violations } = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  const unexpected = violations.filter((v) => !KNOWN_VIOLATIONS[key].includes(v.id));
  expect(
    unexpected.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`),
  ).toEqual([]);
}

async function loadSamples(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Load sample tracks" }).click();
  await expect(page.getByRole("link", { name: /Interlagos/ })).toBeVisible();
}

test("home (empty) is accessible", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("No tracks yet")).toBeVisible();
  await scan(page, "home-empty");
});

for (const scheme of ["light", "dark"] as const) {
  test(`home (with tracks) is accessible (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await loadSamples(page);
    await scan(page, "home");
  });
}

test("backup is accessible", async ({ page }) => {
  await page.goto("/backup/");
  await scan(page, "backup");
});

test("import is accessible", async ({ page }) => {
  await page.goto("/tracks/import/");
  await scan(page, "import");
});

for (const scheme of ["light", "dark"] as const) {
  test(`track view is accessible (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await loadSamples(page);
    await page.getByRole("link", { name: /Interlagos/ }).click();
    await expect(page.locator("[data-corner]").first()).toBeVisible();
    await scan(page, "track");
    await page.getByRole("button", { name: /^Turn 1,/ }).click();
    await expect(page.getByRole("complementary")).toBeVisible();
    await scan(page, "track-panel");
  });
}

test("practice is accessible", async ({ page }) => {
  await loadSamples(page);
  await page.getByRole("link", { name: /Interlagos/ }).click();
  await page.getByRole("link", { name: "Practice" }).click();
  await expect(page.getByTestId("practice-card")).toBeVisible();
  await scan(page, "practice");
});
