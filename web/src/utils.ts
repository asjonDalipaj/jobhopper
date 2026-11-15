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

const FREQUENCY_LABELS: Record<string, string> = {
  Yearly: 'yr',
  Monthly: 'mo',
  'Bi-Weekly': '2wk',
  Weekly: 'wk',
  Daily: 'day',
  Hourly: 'hr',
};

/**
 * Compact salary range from the extracted fields, or null when the posting
 * stated none. Amounts are shown as the employer wrote them (no FX, no
 * annualisation) — a "Yearly" EUR range and an "Hourly" one are not comparable
 * and pretending otherwise would mislead.
 */
export function formatSalary(job: {
  salary_min?: number | null;
  salary_max?: number | null;
  salary_currency?: string | null;
  salary_frequency?: string | null;
}): string | null {
  const min = job.salary_min ?? null;
  const max = job.salary_max ?? null;
  if (min === null && max === null) return null;
  const money = (value: number) =>
    new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(value);
  const range = min !== null && max !== null && min !== max ? `${money(min)}–${money(max)}` : money((min ?? max)!);
  const currency = job.salary_currency ? ` ${job.salary_currency}` : '';
  const frequency = job.salary_frequency ? `/${FREQUENCY_LABELS[job.salary_frequency] ?? job.salary_frequency.toLowerCase()}` : '';
  return `${range}${currency}${frequency}`;
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
