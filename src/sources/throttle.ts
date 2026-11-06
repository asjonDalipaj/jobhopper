/** Tiny persistent throttle so paid/lifetime aggregator quotas survive restarts. */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { getPaths } from '../storage/paths.js';

type State = Record<string, number>;

function stateFile(): string {
  return join(getPaths().root, 'aggregator-state.json');
}

function readState(): State {
  try {
    const file = stateFile();
    if (!existsSync(file)) return {};
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as unknown;
    return parsed && typeof parsed === 'object' ? (parsed as State) : {};
  } catch {
    return {};
  }
}

/** True when `name` has not run within `minIntervalMs`. */
export function aggregatorDue(name: string, minIntervalMs: number, now = Date.now()): boolean {
  if (minIntervalMs <= 0) return true;
  const last = readState()[name] ?? 0;
  return now - last >= minIntervalMs;
}

/** Record a successful fetch for `name`. */
export function markAggregator(name: string, now = Date.now()): void {
  const state = readState();
  state[name] = now;
  writeFileSync(stateFile(), `${JSON.stringify(state)}\n`, 'utf8');
}
