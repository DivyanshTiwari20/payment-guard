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
/** <project-root>/data — store.ts lives at <root>/src/storage/. */
export const DATA_DIR = resolve(here, "..", "..", "data");

/** Ensure the data directory exists. */
export function ensureDataDir(): void {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
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
  const path = join(DATA_DIR, filename);

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
  writeFileSync(join(DATA_DIR, filename), JSON.stringify(data, null, 2), "utf8");
}
