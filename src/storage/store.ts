/**
 * Tiny JSON persistence layer.
 *
 * Reads/writes JSON files under the project's `data/` directory. The directory
 * and default files are created on first run. Anchored to the module location
 * (not cwd) so it works no matter where the MCP client launches the server.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
/** Default: <project-root>/data — store.ts lives at <root>/src/storage/. */
const DEFAULT_DATA_DIR = resolve(here, "..", "..", "data");

/**
 * Resolve the data directory, honoring the `PAYMENT_GUARD_DATA_DIR` env var.
 *
 * Resolved lazily (per call, not at import) so it can be configured for
 * containers, alternate hosts, or isolated test runs without a rebuild.
 */
export function dataDir(): string {
  const override = process.env.PAYMENT_GUARD_DATA_DIR;
  return override && override.trim().length > 0 ? resolve(override) : DEFAULT_DATA_DIR;
}

/** Ensure the data directory exists. */
export function ensureDataDir(): void {
  const dir = dataDir();
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

/**
 * Read and parse a JSON file from `data/`.
 *
 * If the file is missing it is seeded with `fallback` and `fallback` is
 * returned. If it exists but is corrupted, defaults are restored (fail closed)
 * rather than crashing the server.
 *
 * @param filename Bare file name, e.g. "policy.json".
 * @param fallback Default value used to seed/recover the file.
 */
export function readJSON<T>(filename: string, fallback: T): T {
  ensureDataDir();
  const path = join(dataDir(), filename);

  if (!existsSync(path)) {
    writeJSON(filename, fallback);
    return fallback;
  }

  try {
    return JSON.parse(readFileSync(path, "utf8")) as T;
  } catch {
    console.error(`[store] ${filename} is corrupted — restoring defaults.`);
    writeJSON(filename, fallback);
    return fallback;
  }
}

/** Serialize and write `data` to `data/<filename>` (pretty-printed). */
export function writeJSON<T>(filename: string, data: T): void {
  ensureDataDir();
  writeFileSync(join(dataDir(), filename), JSON.stringify(data, null, 2), "utf8");
}
