import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, existsSync } from 'node:fs';

/** Absolute path to this package's own checkout root (dist/storage -> repo root). */
const PACKAGE_ROOT = resolve(fileURLToPath(import.meta.url), '..', '..', '..');

/**
 * Root directory where jobhopper keeps all its local data.
 * `JOBHOPPER_HOME` always wins. Otherwise prefer this project's committed
 * `.jobhopper/` dir (what CI and local dev use), and fall back to the user
 * config dir only for a globally-installed binary with no project checkout.
 */
export const CONFIG_ROOT =
  process.env['JOBHOPPER_HOME'] ??
  (existsSync(join(PACKAGE_ROOT, '.jobhopper', 'exports'))
    ? join(PACKAGE_ROOT, '.jobhopper')
    : join(homedir(), '.config', 'jobhopper'));

export interface Paths {
  /** Base directory for all jobhopper state. */
  root: string;
  /** SQLite database file. */
  db: string;
  /** Local profile documents (cv.txt, preferences.md, constraints.md, background.md). */
  profileDir: string;
  /** OpenRouter API key + model configuration file. */
  configFile: string;
  /** Curated company registry JSON (ettfetchers/greenhouse/lever/ashby board tokens). */
  companiesFile: string;
  /** Export output dir for the HTML dashboard. */
  exportsDir: string;
}

export function getPaths(): Paths {
  const root = CONFIG_ROOT;
  const profileDir = join(root, 'profile');
  const exportsDir = join(root, 'exports');
  return {
    root,
    db: join(root, 'jobhopper.db'),
    profileDir,
    configFile: join(root, 'config.json'),
    companiesFile: join(root, 'companies.json'),
    exportsDir,
  };
}

/** Ensure every directory jobhopper needs exists on disk. */
export function ensureDirs(): void {
  const p = getPaths();
  for (const dir of [p.root, p.profileDir, p.exportsDir]) {
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  }
}