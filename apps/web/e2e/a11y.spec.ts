import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { FAKE_YOUTUBE_API } from "./fixtures/fake-youtube";

type PageKey =
  | "home-empty"
  | "home"
  | "backup"
  | "import"
  | "track"
  | "track-panel"
  | "track-video"
  | "practice"
  | "print";

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
  "track-video": [],
  practice: [],
  print: [],
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

for (const scheme of ["light", "dark"] as const) {
  test(`video panel is accessible (${scheme})`, async ({ page }) => {
    await page.route("https://www.youtube.com/iframe_api", (route) =>
      route.fulfill({ contentType: "text/javascript", body: FAKE_YOUTUBE_API }),
    );
    await page.emulateMedia({ colorScheme: scheme });
    await loadSamples(page);
    await page.getByRole("link", { name: /Interlagos/ }).click();
    await page.getByLabel("Car", { exact: true }).selectOption("__add__");
    await page.getByLabel("Car name", { exact: true }).fill("Mazda MX-5");
    await page.getByRole("button", { name: "Add car", exact: true }).click();
    await page.getByRole("button", { name: "More map actions" }).click();
    await page.getByRole("menuitem", { name: "Reference video" }).click();
    const panel = page.getByRole("complementary", { name: /^Video · / });
    await expect(panel.getByLabel("Paste a YouTube link")).toBeVisible();
    await scan(page, "track-video");
    await panel.getByLabel("Paste a YouTube link").fill("https://youtu.be/dQw4w9WgXcQ");
    await panel.getByRole("button", { name: "Use this video" }).click();
    await expect(panel.getByTestId("fake-youtube")).toBeVisible();
    await scan(page, "track-video");
  });
}

test("practice is accessible", async ({ page }) => {
  await loadSamples(page);
  await page.getByRole("link", { name: /Interlagos/ }).click();
  await page.getByRole("link", { name: "Practice" }).click();
  await expect(page.getByTestId("practice-card")).toBeVisible();
  await scan(page, "practice");
});

for (const scheme of ["light", "dark"] as const) {
  test(`cheat sheet is accessible (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await loadSamples(page);
    await page.getByRole("link", { name: /Interlagos/ }).click();
    await page.getByRole("button", { name: "More map actions" }).click();
    await page.getByRole("menuitem", { name: "Cheat sheet" }).click();
    await expect(page.getByRole("table")).toBeVisible();
    await scan(page, "print");
  });
}
