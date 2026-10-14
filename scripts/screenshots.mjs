// Captures the UI with preview data in light and dark, for review in CI.
// Usage: node scripts/screenshots.mjs <base-url> <out-dir>
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { chromium } from "playwright";

const [baseUrl = "http://localhost:4173", outDir = "screenshots"] = process.argv.slice(2);
await mkdir(outDir, { recursive: true });

const scenes = [
  { name: "home", query: "" },
  { name: "terminal", query: "", open: ["prod-db", "staging-api", "prod-web-01"], type: ["ls"] },
  { name: "exited", query: "", open: ["prod-db"], type: ["exit"] },
  { name: "find", query: "", open: ["prod-web-01"], find: "Ubuntu" },
  { name: "local", query: "", local: true, type: ["ls"] },
  { name: "files", query: "", open: ["prod-web-01"], type: ["ls"], files: true },
  { name: "search", query: "", search: "prod" },
  { name: "askpass", query: "askpass=1" },
  { name: "host-editor", query: "", click: "编辑主机" },
  { name: "snippets", query: "", open: ["prod-web-01"], nav: "命令片段", run: "磁盘用量" },
  { name: "new-host", query: "hosts=empty", click: "新建主机" },
  { name: "first-run", query: "hosts=empty" },
  { name: "terminal-en", query: "lang=en", open: ["prod-web-01", "home-nas"] },
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
      await page.waitForTimeout(300);
    }
    if (scene.local) await page.getByRole("button", { name: "打开本地终端" }).click();
    if (scene.open || scene.local) await page.locator(".xterm-screen").last().waitFor();
    await page.waitForTimeout(300);
    for (const command of scene.type ?? []) {
      await page.keyboard.type(command);
      await page.keyboard.press("Enter");
    }
    if (scene.find) {
      await page.keyboard.press("Control+Shift+F");
      await page.keyboard.type(scene.find);
      await page.keyboard.press("Enter");
    }
    if (scene.files) {
      await page.getByRole("button", { name: "文件", exact: true }).click();
      await page.getByText("deploy.sh").waitFor();
      await page.getByText("backup-2026-10-13.tar.gz").dblclick();
      await page.getByRole("button", { name: "上传", exact: true }).click();
      await page.waitForTimeout(1200);
    }
    if (scene.search) await page.getByRole("textbox").first().fill(scene.search);
    if (scene.nav) await page.getByRole("button", { name: scene.nav }).click();
    if (scene.run) await page.getByRole("button", { name: new RegExp(scene.run) }).first().click();
    if (scene.click) await page.getByRole("button", { name: scene.click, exact: true }).first().click();
    await page.mouse.move(0, 0);
    await page.waitForTimeout(500);
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
