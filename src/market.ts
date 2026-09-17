/**
 * Market focus: Italy, Spain, Netherlands only, with a hard freshness cutoff.
 * Centralized here so scan-time filtering and DB purging use the exact same
 * rules — one place to widen the market or loosen the cutoff later.
 */

/** Countries jobhopper currently targets (substring-matched against location text). */
export const TARGET_COUNTRIES = ['Italy', 'Spain', 'Netherlands'] as const;

/** Postings older than this are considered stale and dropped. */
export const MAX_JOB_AGE_DAYS = 30;

/** True if `location` mentions at least one target country. */
export function isTargetMarket(location: string | null | undefined): boolean {
  if (!location) return false;
  const lower = location.toLowerCase();
  return TARGET_COUNTRIES.some((c) => lower.includes(c.toLowerCase()));
}

/**
 * True if `postedAt` is parseable and within MAX_JOB_AGE_DAYS of now.
 * A missing or unparsable date is treated as stale — quality over quantity,
 * we'd rather drop an ambiguous posting than keep a possibly-old one.
 */
export function isFresh(postedAt: string | null | undefined, now: Date = new Date()): boolean {
  if (!postedAt) return false;
  const posted = new Date(postedAt);
  if (Number.isNaN(posted.getTime())) return false;
  const ageMs = now.getTime() - posted.getTime();
  return ageMs <= MAX_JOB_AGE_DAYS * 24 * 60 * 60 * 1000;
}
