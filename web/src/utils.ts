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
