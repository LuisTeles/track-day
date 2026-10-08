import { expect, test } from "@playwright/test";
import interlagos from "../../../examples/interlagos.track.json";
import interlagosOsm from "../../../packages/osm-track/test/fixtures/interlagos.json";
import monzaOsm from "../../../packages/osm-track/test/fixtures/monza.json";

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

test("adds Monza, whose start line isn't tagged, after the user taps it", async ({ page }) => {
  await page.route("https://nominatim.openstreetmap.org/**", (route) =>
    route.fulfill({
      // Nominatim really returns Monza as a single venue node with an 8 x 11 m box.
      json: [
        {
          osm_type: "node",
          osm_id: 2396618135,
          name: "Autodromo Nazionale di Monza",
          display_name: "Autodromo Nazionale di Monza, 5, Viale Vedano, Monza, Italy",
          boundingbox: ["45.61995", "45.62005", "9.28795", "9.28805"],
        },
      ],
    }),
  );
  await page.route("https://overpass-api.de/**", (route) => route.fulfill({ json: monzaOsm }));

  const monza = {
    schemaVersion: 2,
    kind: "track",
    track: { name: "Autodromo Nazionale di Monza", city: "Monza", country: "IT" },
    layout: { name: "GP", lengthMeters: 5793, direction: "clockwise" },
    corners: [
      {
        number: 1,
        name: "Variante del Rettifilo",
        direction: "right",
        distanceFromStartMeters: 750,
      },
      { number: 3, name: "Curva Biassono", direction: "right", distanceFromStartMeters: 1500 },
      { number: 7, name: "Lesmo 2", direction: "right", distanceFromStartMeters: 2500 },
      { number: 11, name: "Curva Alboreto", direction: "right", distanceFromStartMeters: 5300 },
    ],
  };
  await page.goto("/tracks/import/");
  await page.getByLabel("AI answer").fill(JSON.stringify(monza));
  await page.getByRole("button", { name: "Check JSON" }).click();
  await page.getByRole("button", { name: "Save track" }).click();

  await page.getByRole("button", { name: "Add map from OpenStreetMap" }).click();
  await page.getByRole("button", { name: "Search" }).click();
  await page.getByRole("button", { name: /Autodromo Nazionale di Monza/ }).click();
  await expect(page.getByText(/Start line unknown/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Save map" })).toBeDisabled();

  await page.getByRole("img", { name: /Preview/ }).click({ position: { x: 20, y: 20 } });
  await expect(page.getByText(/Start line set by you/)).toBeVisible();
  // Monza's OSM sections are named; these corners use those names.
  await expect(page.getByText("Position from OpenStreetMap (by name)").first()).toBeVisible();
  await page.getByRole("button", { name: "Save map" }).click();

  await expect(
    page.getByRole("img", { name: /Map of Autodromo Nazionale di Monza/ }),
  ).toBeVisible();
  await expect(page.locator("[data-corner]")).toHaveCount(4);

  // Redo the map: the same flow in a side panel, replacing the saved outline.
  await page.getByRole("button", { name: "More map actions" }).click();
  await page.getByRole("menuitem", { name: "Redo map" }).click();
  const redo = page.getByRole("complementary", { name: "Redo map from OpenStreetMap" });
  await redo.getByRole("button", { name: "Search" }).click();
  await redo.getByRole("button", { name: /Autodromo Nazionale di Monza/ }).click();
  await redo.getByRole("img", { name: /Preview/ }).click({ position: { x: 30, y: 30 } });
  await redo.getByRole("button", { name: "Save map" }).click();
  await expect(redo).toHaveCount(0);
  await expect(page.locator("[data-corner]")).toHaveCount(4);
});
