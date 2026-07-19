import { spawn } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import process from "node:process";

const require = createRequire(import.meta.url);
const projectRoot = process.cwd();
const bundledModules = process.env.CODEX_NODE_MODULES
  ?? path.join(process.env.USERPROFILE ?? "", ".cache", "codex-runtimes", "codex-primary-runtime", "dependencies", "node", "node_modules");

function load(name) {
  try { return require(name); } catch {}
  try { return require(path.join(bundledModules, name)); } catch {}
  const pnpmRoot = path.join(bundledModules, ".pnpm");
  const prefix = `${name.replace("/", "+")}@`;
  const packageDirectory = readdirSync(pnpmRoot).find((entry) => entry.startsWith(prefix));
  if (!packageDirectory) throw new Error(`找不到浏览器测试依赖：${name}`);
  return require(path.join(pnpmRoot, packageDirectory, "node_modules", name));
}

const { chromium } = load("playwright");
const { PNG } = load("pngjs");
const pixelmatch = load("pixelmatch").default ?? load("pixelmatch");
const baseURL = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3100";
const snapshotsDir = path.join(projectRoot, "tests", "browser", "snapshots");
const resultsDir = path.join(projectRoot, "work", "browser-results");
const updateBaselines = process.env.UPDATE_VISUAL_BASELINES === "1" || process.argv.includes("--update");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function waitForServer(url, timeoutMs = 45_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try { if ((await fetch(url)).ok) return; } catch {}
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  throw new Error(`开发服务器未在 ${timeoutMs}ms 内启动`);
}

async function compareScreenshot(name, actualBuffer) {
  await mkdir(snapshotsDir, { recursive: true });
  await mkdir(resultsDir, { recursive: true });
  const baselinePath = path.join(snapshotsDir, name);
  const actualPath = path.join(resultsDir, name);
  await writeFile(actualPath, actualBuffer);
  if (updateBaselines || !existsSync(baselinePath)) {
    if (!updateBaselines) throw new Error(`缺少视觉基线 ${name}；请先运行 UPDATE_VISUAL_BASELINES=1`);
    await writeFile(baselinePath, actualBuffer);
    return;
  }
  const expected = PNG.sync.read(await readFile(baselinePath));
  const actual = PNG.sync.read(actualBuffer);
  assert(expected.width === actual.width && expected.height === actual.height, `${name} 尺寸发生变化`);
  const diff = new PNG({ width: actual.width, height: actual.height });
  const changed = pixelmatch(expected.data, actual.data, diff.data, actual.width, actual.height, { threshold: 0.18 });
  const ratio = changed / (actual.width * actual.height);
  if (ratio > 0.012) {
    await writeFile(path.join(resultsDir, name.replace(/\.png$/, ".diff.png")), PNG.sync.write(diff));
    throw new Error(`${name} 视觉差异 ${(ratio * 100).toFixed(2)}% 超过 1.2%`);
  }
}

function seededSession() {
  const now = "2026-07-19T10:00:00.000Z";
  return {
    version: 3,
    inferenceVersion: "evidence-v1",
    id: "browser-e2e-session",
    status: "collecting",
    activeStep: "archive-decode",
    visualSampling: { status: "completed", responses: [], askedLookIds: [], stableClues: [], rejectedClueAttributeKeys: [], candidateThemeIds: [] },
    archiveDecode: { status: "not-started", images: [], clusters: [], observations: [], correctionImpacts: [], analyses: [] },
    styleLab: { status: "not-started", directions: [], editEvents: [], wearingIntentEvents: [], boundaryTransitions: [] },
    styleSystem: { status: "not-started", output: null, corrections: [] },
    activity: { checkInCount: 0, records: [] },
    flow: {},
    createdAt: now,
    updatedAt: now,
  };
}

const localNext = path.join(projectRoot, "node_modules", "next", "dist", "bin", "next");
let server = null;
if (!process.env.E2E_BASE_URL) {
  server = spawn(process.execPath, [localNext, "dev", "--hostname", "127.0.0.1", "--port", "3100"], {
    cwd: projectRoot,
    env: { ...process.env, IMAGE_ANALYSIS_PROVIDER: "mock", NODE_ENV: "development" },
    stdio: ["ignore", "pipe", "pipe"],
  });
}

let browser;
try {
  await waitForServer(`${baseURL}/explore`);
  browser = await chromium.launch({ executablePath: process.env.E2E_BROWSER_PATH ?? "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe", headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
  await context.route("**/api/image-analysis", async (route) => {
    const request = route.request();
    if (request.method() !== "POST") return route.continue();
    const body = request.postDataJSON();
    return route.continue({ postData: JSON.stringify({ ...body, useMock: true }) });
  });
  await context.addInitScript((session) => localStorage.setItem("undefined-style-session-v3-evidence-v1", JSON.stringify(session)), seededSession());
  const page = await context.newPage();
  await page.goto(`${baseURL}/explore/archive-decode`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  if (await page.getByRole("button", { name: "使用 6 张示例收藏" }).count() === 0) {
    throw new Error(`收藏页未进入预期状态。URL=${page.url()}；页面=${(await page.locator("body").innerText()).slice(0, 500)}`);
  }
  await page.getByRole("button", { name: "使用 6 张示例收藏" }).click();
  await page.getByRole("button", { name: /开始分析收藏/ }).click();
  await page.locator(".observation-list").waitFor({ timeout: 30_000 });
  const pending = page.locator(".observation-list .verdict-actions button", { hasText: "确认" });
  const count = await pending.count();
  assert(count > 0, "收藏分析没有生成待复核观察");
  for (let index = 0; index < count; index += 1) await pending.nth(index).click();
  assert(await page.getByRole("button", { name: /去试几套搭配/ }).isEnabled(), "复核完成后无法进入 Style Lab");
  await compareScreenshot("archive-desktop.png", await page.screenshot({ fullPage: true }));
  await page.getByRole("button", { name: /去试几套搭配/ }).click();
  await page.waitForURL(/\/explore\/style-lab/);
  await page.locator(".lab-direction").first().waitFor();
  assert(await page.locator(".lab-variant-grid article").count() >= 3, "Style Lab 未生成三档造型");
  await compareScreenshot("style-lab-desktop.png", await page.screenshot({ fullPage: true }));

  const mobile = await context.newPage();
  await mobile.setViewportSize({ width: 390, height: 844 });
  await mobile.goto(`${baseURL}/explore`, { waitUntil: "networkidle" });
  const widths = await mobile.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
  assert(widths.scroll <= widths.client + 2, `移动端出现横向溢出：${widths.scroll}/${widths.client}`);
  await compareScreenshot("explore-mobile.png", await mobile.screenshot({ fullPage: true }));
  console.log(`Browser E2E passed: ${count} archive observations reviewed; desktop, mobile and visual checks passed.`);
} finally {
  await browser?.close();
  server?.kill();
}
