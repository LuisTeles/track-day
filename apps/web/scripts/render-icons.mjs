// One-off: renders scripts/icon.svg to the PNG icons the manifest and iOS need.
// Usage: node scripts/render-icons.mjs (needs Playwright's Chromium).
import { chromium } from "@playwright/test";
import { readFileSync } from "node:fs";

const svg = readFileSync(new URL("./icon.svg", import.meta.url), "utf8");
const targets = [
  ["public/icons/icon-192.png", 192, 0],
  ["public/icons/icon-512.png", 512, 0],
  ["public/icons/maskable-512.png", 512, 0.1], // safe-zone padding for maskable icons
  ["src/app/apple-icon.png", 180, 0],
];
const browser = await chromium.launch();
const page = await browser.newPage();
for (const [path, size, pad] of targets) {
  await page.setViewportSize({ width: size, height: size });
  const inner = Math.round(size * (1 - 2 * pad));
  await page.setContent(
    `<body style="margin:0;background:#0b0b0c;display:grid;place-items:center;width:${size}px;height:${size}px">
       <div style="width:${inner}px;height:${inner}px">${svg.replace("<svg ", '<svg width="100%" height="100%" ')}</div>
     </body>`,
  );
  await page.screenshot({ path, omitBackground: false });
  console.log("wrote", path);
}
await browser.close();
