import { homedir } from 'node:os';
import { join } from 'node:path';
import { mkdirSync, existsSync } from 'node:fs';

/** Root directory where jobhopper keeps all its local data. */
export const CONFIG_ROOT = process.env['JOBHOPPER_HOME'] ?? join(homedir(), '.config', 'jobhopper');

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