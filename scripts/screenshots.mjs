// Captures the UI with preview data in light and dark, for review in CI.
// Usage: node scripts/screenshots.mjs <base-url> <out-dir>
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { readFile } from "node:fs/promises";
import { chromium } from "playwright";
import { auditLayout } from "./layout-audit.mjs";

const [baseUrl = "http://localhost:4173", outDir = "screenshots"] = process.argv.slice(2);
await mkdir(outDir, { recursive: true });

const scenes = [
  { name: "home", query: "" },
  { name: "terminal", query: "", open: ["prod-db", "staging-api", "prod-web-01"], type: ["ls"] },
  {
    name: "split",
    query: "",
    open: ["prod-web-01"],
    panes: ["Control+Shift+D", "Control+Shift+O", "Control+Shift+B"],
    type: ["ls", "df -h"],
  },
  { name: "exited", query: "", open: ["prod-db"], type: ["exit"] },
  { name: "find", query: "", open: ["prod-web-01"], find: "Ubuntu" },
  { name: "local", query: "", local: true, type: ["ls"] },
  { name: "files", query: "", open: ["prod-web-01"], type: ["ls"], files: true },
  { name: "monitor", query: "", open: ["prod-web-01"], type: ["ls"], wait: 13000 },
  { name: "processes", query: "", open: ["prod-web-01"], wait: 4000, clicks: [{ name: "全部进程" }], waitText: "node /srv/app/server.js", wide: true },
  { name: "search", query: "", search: "prod" },
  // The app's own right-click menus (never the web view's), at the narrowest window.
  { name: "menu-terminal", query: "", size: { width: 860, height: 520 }, open: ["prod-web-01"], type: ["ls"], rightClick: { css: ".xterm-screen", at: { x: 0.95, y: 0.7 } } },
  { name: "menu-tab", query: "", size: { width: 860, height: 520 }, open: ["prod-db", "staging-api"], rightClick: { role: "tab", name: "prod-db" } },
  { name: "menu-host", query: "", size: { width: 860, height: 520 }, rightClick: { role: "button", name: "prod-web-01" } },
  { name: "menu-field", query: "lang=en", size: { width: 860, height: 520 }, search: "prod", rightClick: { role: "textbox" } },
  { name: "askpass", query: "askpass=1" },
  { name: "askpass-touch", query: "askpass=touch" },
  { name: "askpass-pin", query: "askpass=pin" },
  { name: "host-editor", query: "", clicks: [{ name: "更多", exact: false }, { name: "编辑主机|保存到主机列表", role: "menuitem", regex: true }] },
  { name: "forwards", query: "", nav: "端口转发" },
  { name: "tunnel-editor", query: "", nav: "端口转发", click: "新建隧道" },
  { name: "palette", query: "", open: ["prod-web-01"], keys: "Control+Shift+K", typeText: "prod" },
  // Settings: one page per section beside the list (`section` picks it).
  { name: "settings", query: "", nav: "设置" },
  { name: "settings-terminal", query: "", nav: "设置", section: "terminal" },
  { name: "settings-files", query: "", nav: "设置", section: "files" },
  { name: "settings-connections", query: "", nav: "设置", section: "connections", scrollEnd: true },
  { name: "settings-security", query: "", nav: "设置", section: "security" },
  { name: "settings-ai", query: "", nav: "设置", section: "ai" },
  { name: "settings-logs", query: "", nav: "设置", section: "logs" },
  { name: "settings-sync", query: "", nav: "设置", section: "sync", scrollEnd: true },
  { name: "settings-privacy", query: "", nav: "设置", section: "privacy" },
  { name: "settings-search", query: "", nav: "设置", settingsSearch: "字" },
  // Over a session (the session keeps running underneath), and with the
  // sidebar hidden: the page header then carries the section picker.
  { name: "settings-session", query: "", open: ["prod-web-01"], wait: 4000, nav: "设置", section: "terminal" },
  { name: "settings-collapsed", query: "", open: ["prod-web-01"], nav: "设置", section: "general", keys: "Control+b" },
  { name: "settings-update", query: "update=found", nav: "设置", waitText: "有新版本" },
  { name: "settings-update-installing", query: "update=installing", nav: "设置", waitText: "正在下载" },
  { name: "settings-update-package", query: "update=package", nav: "设置", waitText: "打开下载页" },
  { name: "settings-update-off", query: "update=off", nav: "设置", waitText: "此版本没有配置更新验证密钥", waitTextEn: "This build has no update" },
  { name: "no-ssh", query: "ssh=missing" },
  { name: "sync-setup", query: "", nav: "设置", click: "开始设置" },
  { name: "snippets", query: "", open: ["prod-web-01"], nav: "命令片段", run: "磁盘用量", runEn: "磁盘用量" },
  { name: "new-host", query: "hosts=empty", click: "新建主机" },
  { name: "first-run", query: "hosts=empty" },
  {
    name: "import",
    query: "",
    clicks: [{ name: "添加主机" }, { name: "^导入主机", role: "menuitem", regex: true }, { name: "从 ~/.ssh/config 导入" }],
    waitText: "legacy-switch",
    waitTextEn: "legacy-switch",
  },
  {
    name: "import-service",
    query: "",
    clicks: [{ name: "添加主机" }, { name: "^导入主机", role: "menuitem", regex: true }, { name: "AnixOps Control" }],
    fills: [{ placeholder: "https://panel.example.com", value: "https://panel.example.com" }, { placeholder: "anixadm_…", value: "anixadm_0123456789abcdefghijklmnopqrstuvwxyzABCDEFG" }],
    waitText: "测试连接",
  },
  {
    name: "import-jumpserver",
    query: "lang=en",
    clicks: [{ name: "Add host" }, { name: "^Import hosts", role: "menuitem", regex: true }, { name: "JumpServer" }],
    fills: [
      { placeholder: "https://panel.example.com", value: "https://jms.example.com" },
      { label: "^Access Key ID", value: "7a1b2c3d-1111-4222-8333-444455556666" },
      { label: "^Access Key Secret$", value: "0f0e0d0c-aaaa-4bbb-8ccc-123456789abc" },
      { label: "^JumpServer user name", value: "alice" },
    ],
    waitText: "Test connection",
  },
  {
    name: "import-jumpserver-preview",
    query: "lang=en",
    clicks: [{ name: "Add host" }, { name: "^Import hosts", role: "menuitem", regex: true }, { name: "JumpServer" }],
    fills: [
      { placeholder: "https://panel.example.com", value: "https://jms.example.com" },
      { label: "^Access Key ID", value: "7a1b2c3d-1111-4222-8333-444455556666" },
      { label: "^Access Key Secret$", value: "0f0e0d0c-aaaa-4bbb-8ccc-123456789abc" },
      { label: "^JumpServer user name", value: "alice" },
    ],
    clicksAfter: [{ name: "Preview" }],
    waitText: "HK-edge-01",
  },
  {
    name: "import-service-preview",
    query: "lang=en",
    clicks: [{ name: "Add host" }, { name: "^Import hosts", role: "menuitem", regex: true }, { name: "AnixOps Control" }],
    fills: [{ placeholder: "https://panel.example.com", value: "https://panel.example.com" }, { placeholder: "anixadm_…", value: "anixadm_0123456789abcdefghijklmnopqrstuvwxyzABCDEFG" }],
    clicksAfter: [{ name: "Preview" }],
    waitText: "old-sg-02",
  },
  { name: "terminal-en", query: "lang=en", open: ["prod-web-01", "home-nas"] },
  // Last: folding the monitor is remembered for the rest of this context.
  { name: "monitor-rail", query: "", open: ["prod-web-01"], wait: 4000, clicks: [{ name: "收起监控" }], wide: true },
];

// The touch UI of the mobile app (components/mobile), forced on with ?mobile=1.
// Sizes: a phone, then a tablet that crosses the md breakpoint (834 px).
const mobileScenes = [
  { name: "mobile-hosts", query: "mobile=1&lang=en", viewport: { width: 390, height: 844 } },
  { name: "mobile-hosts-empty", query: "mobile=1&lang=en&hosts=empty", viewport: { width: 390, height: 844 } },
  { name: "mobile-add-host", query: "mobile=1&lang=en", viewport: { width: 390, height: 844 }, click: "Add host" },
  { name: "mobile-terminal", query: "mobile=1&lang=en", viewport: { width: 390, height: 844 }, open: "prod-web-01", type: ["ls"] },
  { name: "mobile-terminal-monitor", query: "mobile=1&lang=en", viewport: { width: 390, height: 844 }, open: "prod-web-01", taps: ["^Monitor$"], waitText: "Load", wait: 4500 },
  { name: "mobile-terminal-ctrl", query: "mobile=1&lang=en", viewport: { width: 390, height: 844 }, open: "prod-web-01", pressCtrl: true },
  { name: "mobile-bar-editor", query: "mobile=1&lang=en", viewport: { width: 390, height: 844 }, taps: ["^Settings$", "Customise the key bar"] },
  { name: "mobile-terminal-landscape", query: "mobile=1&lang=en", viewport: { width: 844, height: 390 }, open: "prod-web-01", type: ["ls"] },
  { name: "mobile-add-host-login", query: "mobile=1&lang=en", viewport: { width: 390, height: 844 }, click: "Add host", scrollEnd: true },
  { name: "mobile-vault-first-run", query: "mobile=1&lang=en&vault=first-run", viewport: { width: 390, height: 844 } },
  { name: "mobile-vault-locked", query: "mobile=1&lang=en&vault=locked", viewport: { width: 390, height: 844 } },
  { name: "mobile-vault-locked-bio", query: "mobile=1&lang=en&vault=bio", viewport: { width: 390, height: 844 } },
  { name: "mobile-settings", query: "mobile=1&lang=en&vault=bio-off", viewport: { width: 390, height: 844 }, click: "Settings" },
  { name: "mobile-settings-passphrase", query: "mobile=1&lang=en&vault=bio-off", viewport: { width: 390, height: 844 }, click: "Settings", click2: "Change passphrase", scrollEnd: true },
  { name: "mobile-hostkey", query: "mobile=1&lang=en&hostkey=changed", viewport: { width: 390, height: 844 } },
  { name: "mobile-tablet", query: "mobile=1&lang=en", viewport: { width: 1024, height: 768 }, open: "prod-web-01", type: ["ls"] },
  // `steps` are taps in order: a button by name, or another role.
  { name: "mobile-host-menu", query: "mobile=1&lang=en", viewport: { width: 390, height: 844 }, steps: [{ name: "More: prod-web-01" }] },
  { name: "mobile-edit-host", query: "mobile=1&lang=en", viewport: { width: 390, height: 844 }, steps: [{ name: "More: prod-web-01" }, { role: "menuitem", name: "Edit" }] },
  { name: "mobile-files", query: "mobile=1&lang=en", viewport: { width: 390, height: 844 }, steps: [{ name: "More: prod-web-01" }, { role: "menuitem", name: "Files" }], waitText: "deploy.sh" },
  { name: "mobile-files-menu", query: "mobile=1&lang=en", viewport: { width: 390, height: 844 }, steps: [{ name: "More: prod-web-01" }, { role: "menuitem", name: "Files" }, { name: "More: deploy.sh" }], waitText: "deploy.sh" },
  { name: "mobile-files-folder", query: "mobile=1&lang=en", viewport: { width: 390, height: 844 }, steps: [{ name: "More: prod-web-01" }, { role: "menuitem", name: "Files" }, { name: "logs", exact: false }], waitText: "access.log" },
  { name: "mobile-forwards", query: "mobile=1&lang=en", viewport: { width: 390, height: 844 }, steps: [{ name: "Forwards" }] },
  { name: "mobile-forward-form", query: "mobile=1&lang=en", viewport: { width: 390, height: 844 }, steps: [{ name: "Forwards" }, { name: "New tunnel" }] },
  { name: "mobile-sync", query: "mobile=1&lang=en", viewport: { width: 390, height: 844 }, steps: [{ name: "Sync" }] },
  { name: "mobile-sync-in", query: "mobile=1&lang=en&sync=in", viewport: { width: 390, height: 844 }, steps: [{ name: "Sync" }] },
  // The narrowest common phone (360 wide), where long English labels wrap first.
  { name: "mobile-hosts-360", query: "mobile=1&lang=en", viewport: { width: 360, height: 740 } },
  { name: "mobile-settings-360", query: "mobile=1&lang=en&vault=bio-off", viewport: { width: 360, height: 740 }, click: "Settings" },
  { name: "mobile-add-host-360", query: "mobile=1&lang=en", viewport: { width: 360, height: 740 }, click: "Add host", scrollEnd: true },
  { name: "mobile-files-360", query: "mobile=1&lang=en", viewport: { width: 360, height: 740 }, steps: [{ name: "More: prod-web-01" }, { role: "menuitem", name: "Files" }], waitText: "deploy.sh" },
  { name: "mobile-forward-form-360", query: "mobile=1&lang=en", viewport: { width: 360, height: 740 }, steps: [{ name: "Forwards" }, { name: "New tunnel" }] },
  { name: "mobile-terminal-360", query: "mobile=1&lang=en", viewport: { width: 360, height: 740 }, open: "prod-web-01", type: ["ls"] },
];

// Button names in the scenes are Chinese; the English pass looks each one up
// in src/lib/i18n.ts (same key in the zh and en tables).
const i18n = await readFile(new URL("../src/lib/i18n.ts", import.meta.url), "utf8");
const table = (start, stop) => {
  const map = new Map();
  for (const [, key, value] of i18n.slice(start, stop).matchAll(/^\s+(\w+): "((?:[^"\\]|\\.)*)",?$/gm)) map.set(key, value);
  return map;
};
const enStart = i18n.indexOf("const en:");
const zhTable = table(0, enStart);
const enTable = table(enStart, i18n.length);
// One Chinese string can stand for several English ones (文件: "Files", "File").
const toEnglish = new Map();
for (const [key, value] of zhTable) if (enTable.has(key)) toEnglish.set(value, [...new Set([...(toEnglish.get(value) ?? []), enTable.get(key)])]);
const englishName = (name) =>
  name
    .split("|")
    .map((part) => {
      const [, head, body, tail] = part.match(/^(\^?)(.*?)(\$?)$/);
      const english = toEnglish.get(body);
      if (english === undefined) throw new Error(`no English string for "${body}"`);
      return `${head}(?:${english.map((text) => text.replace(/[.*+?()[\]{}|\\]/g, "\\$&")).join("|")})${tail}`;
    })
    .join("|");
const englishStep = (step) => ({ ...step, name: englishName(step.name) });

/** Plays one desktop scene in a fresh page; returns the page. */
async function playScene(context, scene, { en = false } = {}) {
  // In English, a button is found by any of its translations, whole name.
  const name = en ? (value) => new RegExp(`^${englishName(value)}$`) : (value) => value;
  const step = en ? englishStep : (value) => value;
  const page = await context.newPage();
  if (scene.size) await page.setViewportSize(scene.size);
  const query = en && !scene.query.includes("lang=") ? [scene.query, "lang=en"].filter(Boolean).join("&") : scene.query;
  await page.goto(`${baseUrl}/?${query}`);
  await page.waitForLoadState("networkidle");
  for (const host of scene.open ?? []) {
    await page.getByRole("button", { name: new RegExp(host) }).first().click();
    await page.waitForTimeout(300);
  }
  if (scene.local) await page.getByRole("button", { name: name("打开本地终端") }).click();
  if (scene.open || scene.local) await page.locator(".xterm-screen").last().waitFor();
  await page.waitForTimeout(300);
  for (const chord of scene.panes ?? []) {
    await page.keyboard.press(chord);
    await page.waitForTimeout(400);
  }
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
    await page.getByRole("button", { name: name("文件"), exact: true }).click();
    await page.getByText("deploy.sh").waitFor();
    await page.getByText("backup-2026-10-13.tar.gz").dblclick();
    await page.getByRole("button", { name: name("上传"), exact: true }).click();
    await page.waitForTimeout(1200);
  }
  // The monitor samples every 3 s; its charts need a few points.
  if (scene.wait) await page.waitForTimeout(scene.wait);
  if (scene.search) await page.getByRole("textbox").first().fill(scene.search);
  if (scene.nav) await page.getByRole("button", { name: name(scene.nav) }).click();
  if (scene.section) await page.locator(`[data-settings-nav="${scene.section}"]`).click();
  if (scene.settingsSearch) await page.getByRole("textbox").first().fill(scene.settingsSearch);
  if (scene.run) await page.getByRole("button", { name: new RegExp(en ? (scene.runEn ?? englishName(scene.run)) : scene.run) }).first().click();
  if (scene.keys) {
    await page.keyboard.press(scene.keys);
    await page.keyboard.type(scene.typeText ?? "");
  }
  for (const raw of scene.clicks ?? []) {
    const click = scene.query.includes("lang=en") ? raw : step(raw);
    await page.getByRole(click.role ?? "button", { name: click.regex || en ? new RegExp(click.regex ? click.name : `^${click.name}$`) : click.name, exact: click.regex || en ? undefined : (click.exact ?? true) }).first().click();
  }
  for (const field of scene.fills ?? [])
    await (field.label ? page.getByLabel(new RegExp(field.label)) : page.getByPlaceholder(field.placeholder)).first().fill(field.value);
  for (const click of scene.clicksAfter ?? [])
    await page.getByRole(click.role ?? "button", { name: click.regex ? new RegExp(click.name) : click.name, exact: click.regex ? undefined : (click.exact ?? true) }).first().click();
  if (scene.waitText) await page.getByText(scene.query.includes("lang=en") || !en ? scene.waitText : (scene.waitTextEn ?? new RegExp(englishName(scene.waitText)))).first().waitFor();
  if (scene.click) await page.getByRole("button", { name: name(scene.click), exact: true }).first().click();
  if (scene.scrollEnd) await page.evaluate(() => document.querySelectorAll("aside .overflow-y-auto, [data-settings-page]").forEach((element) => (element.scrollTop = element.scrollHeight)));
  if (scene.rightClick) {
    const { css, role, name: target, at } = scene.rightClick;
    const element = css ? page.locator(css).last() : page.getByRole(role, target ? { name: new RegExp(target) } : undefined).first();
    // `at`: where in the target, as fractions of its box (near an edge, to see the menu stay on screen).
    const box = await element.boundingBox();
    const { x, y } = at ?? { x: 0.5, y: 0.5 };
    await page.mouse.click(box.x + box.width * x, box.y + box.height * y, { button: "right" });
    await page.getByRole("menu").waitFor();
  } else await page.mouse.move(0, 0);
  await page.waitForTimeout(500);
  return page;
}

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const errors = [];
const layout = [];
let saved = 0;

async function checkLayout(page, label) {
  for (const problem of await auditLayout(page)) layout.push(`${label}: ${problem}`);
}

// Light and dark at the default window size, then the smallest window the app
// allows (src-tauri/tauri.conf.json minWidth/minHeight) in Chinese and English,
// where long labels and the monitor squeeze everything else.
const passes = [
  { suffix: "light", colorScheme: "light", viewport: { width: 1200, height: 760 } },
  { suffix: "dark", colorScheme: "dark", viewport: { width: 1200, height: 760 } },
  { suffix: "min", colorScheme: "light", viewport: { width: 860, height: 520 } },
  { suffix: "min-en", colorScheme: "dark", viewport: { width: 860, height: 520 }, en: true },
];
for (const pass of passes) {
  if (process.env.PASSES && !process.env.PASSES.split(",").includes(pass.suffix)) continue;
  const context = await browser.newContext({
    viewport: pass.viewport,
    deviceScaleFactor: Number(process.env.DSF || 2),
    colorScheme: pass.colorScheme,
    locale: pass.en ? "en-US" : "zh-CN",
  });
  for (const scene of scenes) {
    if (process.env.ONLY && !process.env.ONLY.split(",").includes(scene.name)) continue;
    // In the smallest window the monitor is folded for the terminal's sake
    // (workspaceFit.ts), so scenes that use the full monitor run wide only.
    if (scene.wide && pass.viewport.width < 1000) continue;
    const label = `${scene.name}/${pass.suffix}`;
    const pageErrors = [];
    context.on("page", (page) => {
      page.on("pageerror", (error) => pageErrors.push(`${label}: ${error.message}`));
      page.on("console", (message) => message.type() === "error" && pageErrors.push(`${label}: ${message.text()}`));
    });
    let page;
    try {
      page = await playScene(context, scene, { en: pass.en });
    } catch (error) {
      errors.push(`${label}: ${error.message.split("\n").slice(0, 3).join(" ")}`);
      context.removeAllListeners("page");
      continue;
    }
    context.removeAllListeners("page");
    errors.push(...pageErrors);
    await checkLayout(page, label);
    await page.screenshot({ path: join(outDir, `${scene.name}-${pass.suffix}.png`) });
    saved++;
    await page.close();
  }
  await context.close();
}
for (const colorScheme of ["light", "dark"]) {
  for (const scene of mobileScenes) {
    if (process.env.ONLY && !process.env.ONLY.split(",").includes(scene.name)) continue;
    const context = await browser.newContext({
      viewport: scene.viewport,
      deviceScaleFactor: Number(process.env.DSF || 2),
      colorScheme,
      hasTouch: true,
      isMobile: true,
      locale: "en-US",
    });
    const page = await context.newPage();
    page.on("pageerror", (error) => errors.push(`${scene.name}/${colorScheme}: ${error.message}`));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(`${scene.name}/${colorScheme}: ${message.text()}`);
    });
    await page.goto(`${baseUrl}/?${scene.query}`);
    await page.waitForLoadState("networkidle");
    if (scene.click) await page.getByRole("button", { name: scene.click, exact: true }).first().click();
    if (scene.click2) await page.getByRole("button", { name: scene.click2, exact: true }).first().click();
    if (scene.scrollEnd) {
      await page.evaluate(() => {
        for (const element of document.querySelectorAll("form, [role=dialog]"))
          for (const child of element.querySelectorAll("div")) child.scrollTop = child.scrollHeight;
      });
    }
    if (scene.open) {
      await page.getByRole("button", { name: new RegExp(scene.open) }).first().click();
      await page.locator(".xterm-screen").waitFor();
      await page.waitForTimeout(300);
      for (const command of scene.type ?? []) {
        await page.keyboard.type(command);
        await page.keyboard.press("Enter");
      }
    }
    for (const step of scene.steps ?? [])
      await page.getByRole(step.role ?? "button", { name: step.name, exact: step.exact ?? true }).first().click();
    if (scene.waitText) await page.getByText(scene.waitText).first().waitFor();
    if (scene.steps) await page.waitForTimeout(300);
    if (scene.wait) await page.waitForTimeout(scene.wait);
    if (scene.pressCtrl) await page.getByRole("button", { name: /^Ctrl/ }).click();
    for (const name of scene.taps ?? []) await page.getByRole("button", { name: new RegExp(name) }).first().click();
    // Every touch control is at least 44 x 44 px (layout.md); report any that is not.
    const small = await page.evaluate(() =>
      [...document.querySelectorAll("button, input")]
        .filter((element) => element.getClientRects().length > 0)
        .map((element) => ({ label: element.getAttribute("aria-label") || element.textContent?.trim() || element.tagName, box: element.getBoundingClientRect() }))
        .filter(({ box }) => box.height < 43.5 || box.width < 43.5)
        .map(({ label, box }) => `${label} ${Math.round(box.width)}x${Math.round(box.height)}`),
    );
    if (small.length > 0) errors.push(`${scene.name}/${colorScheme}: touch targets under 44 px: ${small.join(", ")}`);
    await checkLayout(page, `${scene.name}/${colorScheme}`);
    await page.mouse.move(0, 0);
    await page.waitForTimeout(500);
    await page.screenshot({ path: join(outDir, `${scene.name}-${colorScheme}.png`) });
    saved++;
    await context.close();
  }
}
await browser.close();

if (layout.length > 0) console.error(`Layout problems (scripts/layout-audit.mjs):\n${layout.join("\n")}`);
if (errors.length > 0) console.error(errors.join("\n"));
console.log(`Saved ${saved} screenshots to ${outDir}`);
if (errors.length > 0 || layout.length > 0) process.exit(1);
