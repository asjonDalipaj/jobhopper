/**
 * Applied-job tracking, persisted to localStorage so it works on the static
 * hosted site (phone included). Keyed by `${source}-${external_id}`, which is
 * unique across the snapshot (see web/src/App.tsx job keys).
 */

const STORAGE_KEY = 'jobhopper.applied';

export function appliedKey(job: { source: string; external_id: string }): string {
  return `${job.source}-${job.external_id}`;
}

export function loadApplied(): Record<string, string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function saveApplied(applied: Record<string, string>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(applied));
  } catch {
    // Storage full or unavailable (private mode) — tracking just won't persist.
  }
}
