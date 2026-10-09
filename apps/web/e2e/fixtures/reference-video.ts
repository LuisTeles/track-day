import { expect, type Page } from "@playwright/test";
import { FAKE_YOUTUBE_API } from "./fake-youtube";

const IFRAME_API = "https://www.youtube.com/iframe_api";

export const setYtTime = (page: Page, sec: number) =>
  page.evaluate((t) => ((window as unknown as { __ytTime: number }).__ytTime = t), sec);

export const ytTime = (page: Page) =>
  page.evaluate(() => (window as unknown as { __ytTime: number }).__ytTime);

/**
 * Interlagos, its sample car given a YouTube video (the fake player) with the start line at
 * 5 s and T1–T3 marked at 10, 20 and 30 s; then opens practice for that car at T1.
 */
export async function practiceWithMarkedVideo(page: Page) {
  await page.route(IFRAME_API, (route) =>
    route.fulfill({ contentType: "text/javascript", body: FAKE_YOUTUBE_API }),
  );
  await page.goto("/");
  await page.getByRole("button", { name: "Load sample tracks" }).click();
  await page.getByRole("link", { name: /Interlagos/ }).click();

  await page.getByRole("button", { name: "More map actions" }).click();
  await page.getByRole("menuitem", { name: "Reference video" }).click();
  const panel = page.getByRole("complementary", { name: /^Video · / });
  await panel.getByLabel("Paste a YouTube link").fill("https://youtu.be/dQw4w9WgXcQ");
  await panel.getByRole("button", { name: "Use this video" }).click();
  await expect(panel.getByTestId("fake-youtube")).toBeVisible();
  await panel.getByRole("button", { name: "Mark corners" }).click();
  for (const sec of [5, 10, 20, 30]) {
    await setYtTime(page, sec);
    await panel.getByRole("button", { name: /^Mark (start|T\d)/ }).click();
  }
  await panel.getByRole("button", { name: "Save marks" }).click();
  await expect(panel.getByRole("button", { name: "Mark corners" })).toBeVisible();
  await page.getByRole("button", { name: "Close panel" }).click();

  await page.getByRole("link", { name: "Practice" }).click();
  await expect(page.getByTestId("practice-card")).toHaveAttribute("aria-label", /^T1,/);
}

/** Turns on "Follow reference video" in the Options popover and waits for the player. */
export async function followVideo(page: Page) {
  await page.getByRole("button", { name: "Options" }).click();
  await page.getByRole("switch", { name: "Follow reference video" }).click();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("fake-youtube")).toBeVisible();
}
