import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Next.js automatically loads .env.local, but the standalone evaluation CLI does not.
 * Load only missing values and never print secrets or file contents.
 */
export function loadLocalEnv(path = resolve(process.cwd(), ".env.local")): boolean {
  if (!existsSync(path)) return false;

  for (const rawLine of readFileSync(path, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator <= 0) continue;

    const key = line.slice(0, separator).trim();
    if (!/^[A-Z_][A-Z0-9_]*$/.test(key) || process.env[key] !== undefined) continue;
    let value = line.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
  return true;
}
