/**
 * Where the browser lives. Kept apart from the filler so the CLI and the local
 * web server resolve the same executable with the same precedence.
 */

import { existsSync } from 'node:fs';

export function resolveBrowser(explicit?: string): string {
  const candidates = [
    explicit,
    process.env['JOBHOPPER_BROWSER'],
    '/opt/brave-bin/brave',
    '/usr/bin/brave-browser',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ].filter((value): value is string => Boolean(value));
  const found = candidates.find((candidate) => existsSync(candidate));
  if (!found) {
    throw new Error('No browser found. Pass --browser <path> or set JOBHOPPER_BROWSER.');
  }
  return found;
}
