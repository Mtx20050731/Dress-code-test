import { readFile } from "node:fs/promises";
import path from "node:path";

async function readEnv(filename) {
  try {
    return Object.fromEntries((await readFile(path.join(process.cwd(), filename), "utf8"))
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#") && line.includes("="))
      .map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1)]));
  } catch { return {}; }
}

const fileEnv = await readEnv(".env.local");
const env = { ...fileEnv, ...process.env };
const failures = [];
const warnings = [];
const imageProvider = env.IMAGE_ANALYSIS_PROVIDER || "mock";
if (imageProvider === "qwen") {
  if (!env.DASHSCOPE_API_KEY) failures.push("Qwen 已启用，但缺少 DASHSCOPE_API_KEY");
  if (!env.QWEN_VISION_MODEL) failures.push("Qwen 已启用，但缺少 QWEN_VISION_MODEL");
}
if (imageProvider === "mock") warnings.push("图片分析仍为 Mock，不能作为正式上线配置");
if ((env.ACCOUNT_PROVIDER || "disabled") === "disabled") warnings.push("账号系统尚未配置");
if ((env.CLOUD_SYNC_PROVIDER || "disabled") === "disabled") warnings.push("云端会话与私有图片存储尚未配置");
if (!env.APP_ORIGIN) warnings.push("未设置 APP_ORIGIN，部署后回调地址无法最终确认");

console.log(`Deployment preflight: ${failures.length ? "FAILED" : "READY FOR BUILD"}`);
failures.forEach((message) => console.log(`FAIL: ${message}`));
warnings.forEach((message) => console.log(`WARN: ${message}`));
if (failures.length) process.exitCode = 1;
