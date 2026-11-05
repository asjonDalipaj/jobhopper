import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(dateStr?: string | null): string {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return String(dateStr).slice(0, 10);
    return d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return String(dateStr).slice(0, 10);
  }
}

/**
 * A row counts as "New" when first seen within the last 3 days
 * (snapshot-driven, scan-to-scan).
 */
const NEW_SINCE_MS = 3 * 24 * 60 * 60 * 1000;
/** Newest posted first; undated rows last. ISO strings compare lexicographically. */
export function sortJobs<T extends { posted_at?: string | null; first_seen?: string | null }>(jobs: T[]): T[] {
  const time = (value?: string | null) => {
    const ms = value ? Date.parse(value) : Number.NaN;
    return Number.isFinite(ms) ? ms : Number.NEGATIVE_INFINITY;
  };
  return [...jobs].sort((a, b) => {
    const at = time(a.posted_at);
    const bt = time(b.posted_at);
    if (at !== bt) return bt - at;
    return (b.first_seen ?? '').localeCompare(a.first_seen ?? '');
  });
}

export function isNewJob(job: { first_seen?: string | null }): boolean {
  if (!job.first_seen) return false;
  const seen = new Date(job.first_seen).getTime();
  return !Number.isNaN(seen) && Date.now() - seen <= NEW_SINCE_MS;
}

/**
 * Day of an ISO timestamp in the viewer's timezone, as YYYY-MM-DD.
 * Must match formatDate() so the date filter compares against the same
 * day the card displays (posted_at offsets vary between sources).
 */
export function toLocalDay(dateStr?: string | null): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr.slice(0, 10);
  // en-CA locale formats dates as YYYY-MM-DD.
  return d.toLocaleDateString('en-CA');
}
