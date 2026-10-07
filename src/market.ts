/**
 * Market focus: Italy, Spain, Netherlands only, with a hard freshness cutoff.
 * Centralized here so scan-time filtering and DB purging use the exact same
 * rules — one place to widen the market or loosen the cutoff later.
 */

/** Countries jobhopper currently targets (substring-matched against location text). */
export const TARGET_COUNTRIES = ['Italy', 'Spain', 'Netherlands'] as const;

const COUNTRY_ALIASES: Record<(typeof TARGET_COUNTRIES)[number], string[]> = {
  Italy: ['italia', 'milano', 'milan', 'roma', 'rome', 'torino', 'turin', 'napoli', 'naples', 'bologna'],
  Spain: ['españa', 'espana', 'madrid', 'barcelona', 'valencia', 'sevilla', 'seville', 'bilbao', 'malaga'],
  Netherlands: ['nederland', 'amsterdam', 'rotterdam', 'utrecht', 'den haag', 'the hague', 'eindhoven', 'groningen'],
};

/** Postings older than this are considered stale and dropped. */
export const MAX_JOB_AGE_DAYS = 30;
export const TARGET_MARKET_MAX_AGE_DAYS = 14;

/** True if `location` mentions at least one target country. */
export function isTargetMarket(location: string | null | undefined): boolean {
  if (!location) return false;
  const lower = location.toLowerCase();
  // Whole-word match: plain substring matching let "manufacturing" hit "turin".
  const terms = TARGET_COUNTRIES.flatMap((c) => [c.toLowerCase(), ...COUNTRY_ALIASES[c]]);
  return terms.some((term) => new RegExp(`(^|[^\\p{L}])${escapeRegExp(term)}($|[^\\p{L}])`, 'u').test(lower));
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * True if `postedAt` is parseable and within MAX_JOB_AGE_DAYS of now.
 * A missing or unparsable date is treated as stale — quality over quantity,
 * we'd rather drop an ambiguous posting than keep a possibly-old one.
 */
export function isFresh(postedAt: string | null | undefined, now: Date = new Date(), targetMarket = false): boolean {
  if (!postedAt) return false;
  const posted = new Date(postedAt);
  if (Number.isNaN(posted.getTime())) return false;
  const ageMs = now.getTime() - posted.getTime();
  const maxDays = targetMarket ? TARGET_MARKET_MAX_AGE_DAYS : MAX_JOB_AGE_DAYS;
  return ageMs <= maxDays * 24 * 60 * 60 * 1000;
}

const ENGINEERING_KEYWORDS = [
  'engineer', 'developer', 'software', 'frontend', 'front-end', 'backend', 'back-end',
  'full-stack', 'fullstack', 'devops', 'sre', 'site reliability', 'data engineer',
  'ml engineer', 'machine learning engineer', 'platform engineer', 'infrastructure engineer',
  'qa engineer', 'test engineer', 'security engineer', 'systems engineer',
];
const MUSIC_KEYWORDS = [
  'music', 'audio', 'a&r', 'sound design', 'sound engineer', 'composer', 'mastering',
  'mixing engineer', 'dj', 'producer', 'music licensing', 'music supervisor',
];

/** True when title is an engineering or music role. */
export function isRelevantRole(title: string | null | undefined): boolean {
  if (!title) return false;
  const lower = title.toLowerCase();
  return ENGINEERING_KEYWORDS.some((keyword) => lower.includes(keyword)) || MUSIC_KEYWORDS.some((keyword) => lower.includes(keyword));
}
