/** Parse the watcher interval (minutes) into milliseconds. */
export function parseIntervalMinutes(value: string): number {
  const minutes = Number(value);
  if (!Number.isFinite(minutes) || minutes <= 0) {
    throw new Error('--interval must be a positive number of minutes');
  }
  return Math.round(minutes * 60_000);
}
