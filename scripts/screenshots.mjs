// Captures the UI with preview data in light and dark, for review in CI.
// Usage: node scripts/screenshots.mjs <base-url> <out-dir>
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { chromium } from "playwright";

const [baseUrl = "http://localhost:4173", outDir = "screenshots"] = process.argv.slice(2);
await mkdir(outDir, { recursive: true });

const scenes = [
  { name: "home", query: "" },
  { name: "tabs", query: "", open: ["prod-web-01", "prod-db", "staging-api"] },
  { name: "search", query: "", search: "prod" },
  { name: "first-run", query: "hosts=empty" },
  { name: "forwards", query: "", nav: "端口转发" },
  { name: "tabs-en", query: "lang=en", open: ["prod-web-01", "home-nas"] },
];

const browser = await chromium.launch();
const errors = [];
for (const colorScheme of ["light", "dark"]) {
  const context = await browser.newContext({
    viewport: { width: 1200, height: 760 },
    deviceScaleFactor: 2,
    colorScheme,
    locale: "zh-CN",
  });
  for (const scene of scenes) {
    const page = await context.newPage();
    page.on("pageerror", (error) => errors.push(`${scene.name}/${colorScheme}: ${error.message}`));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(`${scene.name}/${colorScheme}: ${message.text()}`);
    });
    await page.goto(`${baseUrl}/?${scene.query}`);
    await page.waitForLoadState("networkidle");
    for (const host of scene.open ?? []) {
      await page.getByRole("button", { name: new RegExp(host) }).first().click();
    }
    if (scene.search) await page.getByRole("textbox").fill(scene.search);
    if (scene.nav) await page.getByRole("button", { name: scene.nav }).click();
    await page.mouse.move(0, 0);
    await page.waitForTimeout(400);
    await page.screenshot({ path: join(outDir, `${scene.name}-${colorScheme}.png`) });
    await page.close();
  }
  await context.close();
}
await browser.close();

if (errors.length > 0) {
  console.error(errors.join("\n"));
  process.exit(1);
}
console.log(`Saved ${scenes.length * 2} screenshots to ${outDir}`);
