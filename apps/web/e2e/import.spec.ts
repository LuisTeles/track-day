import { expect, test } from "@playwright/test";
import interlagos from "../../../examples/interlagos.track.json";

/** What an AI chat would send back: no geometry, wrapped in a fence and prose. */
function aiAnswer(): string {
  const layout: Record<string, unknown> = { ...interlagos.layout };
  delete layout.outlinePath;
  delete layout.racingLinePath;
  delete layout.rotation;
  const corners = interlagos.corners.map((c) => {
    const copy: Record<string, unknown> = { ...c };
    delete copy.pathPosition;
    delete copy.labelOffset;
    return copy;
  });
  const json = JSON.stringify({ ...interlagos, layout, corners }, null, 2);
  return `Here is the track:\n\n\`\`\`json\n${json}\n\`\`\`\n\nLet me know if you need anything else.`;
}

test.use({ permissions: ["clipboard-read", "clipboard-write"] });

test("imports a track pasted from an AI chat", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Import with AI" }).click();
  await expect(page.getByRole("heading", { name: "Import a track with AI" })).toBeVisible();

  await page.getByLabel("Lap length (m)").fill("4309");
  await page.getByRole("button", { name: "Copy prompt" }).click();
  await expect(page.getByText("Copied")).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain("Lap length: 4309 m");

  await page.getByLabel("AI answer").fill(aiAnswer());
  await page.getByRole("button", { name: "Check JSON" }).click();
  const preview = page.getByRole("region", { name: "3. Check and save" });
  await expect(preview.getByText("S do Senna").first()).toBeVisible();

  await page.getByRole("button", { name: "Save track" }).click();
  await expect(page).toHaveURL(/\/tracks\/view\/\?track=/);
  await expect(page.getByRole("button", { name: /S do Senna/ }).first()).toBeVisible();
});

test("shows errors by field path for an invalid answer", async ({ page }) => {
  await page.goto("/tracks/import/");
  await page.getByLabel("AI answer").fill(
    JSON.stringify({
      schemaVersion: 1,
      kind: "track",
      track: { name: "Test" },
      layout: { name: "GP", lengthMeters: 1000, direction: "sideways" },
      corners: [],
    }),
  );
  await page.getByRole("button", { name: "Check JSON" }).click();

  // Next.js adds its own (empty) role="alert" route announcer, so narrow to ours.
  const issues = page.getByRole("alert").filter({ hasText: "doesn’t match the track format" });
  await expect(issues).toContainText("layout.direction");
  await expect(page.getByRole("region", { name: "3. Check and save" })).toHaveCount(0);
});
