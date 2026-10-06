import { expect, test } from "@playwright/test";
import interlagos from "../../../examples/interlagos.track.json";
import interlagosOsm from "../../../packages/osm-track/test/fixtures/interlagos.json";

/** Interlagos as an AI import produces it: no geometry, no source. */
function aiAnswer(): string {
  const layout: Record<string, unknown> = { ...interlagos.layout };
  for (const key of ["outlinePath", "outlineSource", "racingLinePath", "rotation"])
    delete layout[key];
  const corners = interlagos.corners.map((c) => {
    const copy: Record<string, unknown> = { ...c };
    delete copy.pathPosition;
    delete copy.labelOffset;
    return copy;
  });
  return JSON.stringify({ ...interlagos, layout, corners });
}

test("adds a map from OpenStreetMap to an imported track", async ({ page }) => {
  // Recorded responses: CI never calls the live OSM services.
  await page.route("https://nominatim.openstreetmap.org/**", (route) =>
    route.fulfill({
      json: [
        {
          osm_type: "way",
          osm_id: 1,
          name: "Autódromo José Carlos Pace",
          display_name: "Autódromo José Carlos Pace, São Paulo, Brasil",
          boundingbox: ["-23.712", "-23.695", "-46.706", "-46.690"],
        },
      ],
    }),
  );
  await page.route("https://overpass-api.de/**", (route) => route.fulfill({ json: interlagosOsm }));

  await page.goto("/tracks/import/");
  await page.getByLabel("AI answer").fill(aiAnswer());
  await page.getByRole("button", { name: "Check JSON" }).click();
  await page.getByRole("button", { name: "Save track" }).click();
  await expect(page.getByText(/no outline yet/)).toBeVisible();

  await page.getByRole("button", { name: "Add map from OpenStreetMap" }).click();
  await page.getByRole("button", { name: "Search" }).click();
  await page.getByRole("button", { name: /Autódromo José Carlos Pace/ }).click();
  await expect(page.getByText("Position from OpenStreetMap").first()).toBeVisible();
  await page.getByRole("button", { name: "Save map" }).click();

  await expect(page.getByRole("img", { name: /Map of Autódromo José Carlos Pace/ })).toBeVisible();
  await expect(page.locator("[data-corner]")).toHaveCount(interlagos.corners.length);
  await expect(page.getByRole("link", { name: "OpenStreetMap contributors" })).toBeVisible();
});

test("shows the OpenStreetMap credit unclipped in practice mode", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Load sample tracks" }).click();
  await page.getByRole("link", { name: /Interlagos/ }).click();
  await page.getByRole("link", { name: "Practice" }).click();

  const credit = page.getByRole("link", { name: "OpenStreetMap contributors" });
  await expect(credit).toBeInViewport();
  // In viewport isn't enough: an overflow-hidden parent can clip it. The
  // topmost element at its centre must be the link itself.
  const onTop = await credit.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    const clip = el
      .closest("[class*='overflow-hidden'], [class*='max-h']")
      ?.getBoundingClientRect();
    const inside = !clip || (r.top >= clip.top - 0.5 && r.bottom <= clip.bottom + 0.5);
    return el.contains(hit) && inside;
  });
  expect(onTop).toBe(true);
});
