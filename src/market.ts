/**
 * Market focus: Italy, Spain, Netherlands only, with a hard freshness cutoff.
 * Centralized here so scan-time filtering and DB purging use the exact same
 * rules — one place to widen the market or loosen the cutoff later.
 */

/** Countries jobhopper currently targets. */
export const TARGET_COUNTRIES = ['Italy', 'Spain', 'Netherlands'] as const;
export type TargetCountry = (typeof TARGET_COUNTRIES)[number];

/**
 * City/region spellings that boards actually use. The scan gate and the DB
 * country filter both read this list, so "Milano" counts as Italy everywhere.
 */
const COUNTRY_ALIASES: Record<TargetCountry, string[]> = {
  Italy: [
    'italia', 'italy',
    'milano', 'milan', 'roma', 'rome', 'torino', 'turin', 'napoli', 'naples', 'bologna',
    'firenze', 'florence', 'genova', 'genoa', 'venezia', 'venice', 'verona', 'padova', 'padua',
    'bari', 'palermo', 'catania', 'messina', 'cagliari', 'sassari', 'perugia', 'ancona',
    'pescara', 'pesaro', 'urbino', 'lecce', 'taranto', 'reggio calabria', 'reggio emilia', 'modena', 'parma',
    'piacenza', 'brescia', 'bergamo', 'monza', 'varese', 'novara', 'udine', 'trieste',
    'trento', 'bolzano', 'trentino', 'alto adige', 'lombardia', 'piemonte', 'veneto',
    'toscana', 'lazio', 'campania', 'puglia', 'sicilia', 'sardegna', 'liguria', 'friuli',
    'umbria', 'abruzzo', 'molise', 'basilicata', 'calabria', 'emilia romagna',
    'emilia-romagna',
  ],
  Spain: ['españa', 'espana', 'madrid', 'barcelona', 'valencia', 'sevilla', 'seville', 'bilbao', 'malaga'],
  Netherlands: ['nederland', 'amsterdam', 'rotterdam', 'utrecht', 'den haag', 'the hague', 'eindhoven', 'groningen'],
};

/** Postings older than this are considered stale and dropped. */
export const MAX_JOB_AGE_DAYS = 30;
export const TARGET_MARKET_MAX_AGE_DAYS = 3;

const escapeRegExp = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const wholeWord = (term: string) => new RegExp(`(^|[^\\p{L}])${escapeRegExp(term)}($|[^\\p{L}])`, 'u');

/** Precompiled per country: the English name plus every alias. */
const COUNTRY_MATCHERS: Record<TargetCountry, RegExp[]> = Object.fromEntries(
  TARGET_COUNTRIES.map((country) => [
    country,
    [country, ...COUNTRY_ALIASES[country]].map((term) => wholeWord(term.toLowerCase())),
  ]),
) as Record<TargetCountry, RegExp[]>;

/** True when `country` names one of the target markets (case-insensitive). */
export function isTargetCountry(country: string | null | undefined): country is TargetCountry {
  if (!country) return false;
  const lower = country.trim().toLowerCase();
  return TARGET_COUNTRIES.some((c) => c.toLowerCase() === lower);
}

/**
 * True if `location` is in `country`, matching its city/region aliases with
 * whole words ("Manufacturing" is not Turin, "Bolognaise" is not Bologna).
 */
export function matchesCountry(location: string | null | undefined, country: string): boolean {
  if (!location || !country) return false;
  const lower = location.toLowerCase();
  const target = TARGET_COUNTRIES.find((c) => c.toLowerCase() === country.trim().toLowerCase());
  const matchers = target ? COUNTRY_MATCHERS[target] : [wholeWord(country.trim().toLowerCase())];
  return matchers.some((re) => re.test(lower));
}

/** True if `location` mentions at least one target country. */
export function isTargetMarket(location: string | null | undefined): boolean {
  return TARGET_COUNTRIES.some((country) => matchesCountry(location, country));
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

/**
 * Software-engineering titles only. Bare "engineer"/"developer" used to let in
 * sales, consulting, mechanical and fashion roles. Matching is word-boundary
 * based: "ios" must not hit "sanitari-os" and "dj" must not hit "a-dj-unto".
 * The judge is still the quality gate; this only decides what is worth a call.
 */
const ENGINEERING_KEYWORDS = [
  'software', 'frontend', 'front-end', 'backend', 'back-end', 'full-stack', 'fullstack', 'full stack',
  'devops', 'sre', 'site reliability', 'platform engineer', 'infrastructure engineer',
  'data engineer', 'ml engineer', 'machine learning', 'qa', 'sdet', 'test automation', 'test engineer',
  'security engineer', 'cybersecurity', 'systems engineer', 'cloud engineer', 'mobile', 'ios', 'android',
  'embedded', 'firmware', 'ai engineer', 'forward deployed',
  // Italian titles. The gate used to be English-only, so these never reached the
  // judge. Broad on purpose: the judge is the quality gate.
  'sviluppo software', 'ingegnere informatico',
];
/** Stems: the word continues after the stem (sviluppatore, desarrolladora…). */
const ENGINEERING_STEMS = ['sviluppator', 'programmator', 'desarrollador', 'ontwikkelaar', 'programmeur'];
/** Music-industry production roles; "music" alone matched marketing/creator jobs. */
const MUSIC_KEYWORDS = [
  'music producer', 'music licensing', 'music supervisor', 'sound design', 'sound engineer',
  'audio engineer', 'a&r', 'composer', 'mastering', 'mixing engineer', 'dj', 'producer',
];
/** The profile excludes junior/intern roles; drop them before the judge. */
const EXCLUDED_TITLE = /\b(intern|internship|tirocinio|stage|junior|graduate|apprentice)\b/i;

const wordMatcher = (term: string) => new RegExp(`(^|[^\\p{L}])${escapeRegExp(term)}($|[^\\p{L}])`, 'u');
const stemMatcher = (stem: string) => new RegExp(`(^|[^\\p{L}])${escapeRegExp(stem)}`, 'u');
const KEYWORD_MATCHERS = [...ENGINEERING_KEYWORDS, ...MUSIC_KEYWORDS].map(wordMatcher);
const STEM_MATCHERS = ENGINEERING_STEMS.map(stemMatcher);

/** True when title is a software-engineering or music-production role. */
export function isRelevantRole(title: string | null | undefined): boolean {
  if (!title) return false;
  if (EXCLUDED_TITLE.test(title)) return false;
  const lower = title.toLowerCase();
  return KEYWORD_MATCHERS.some((re) => re.test(lower)) || STEM_MATCHERS.some((re) => re.test(lower));
}

/**
 * The full scan-time quality gate in one predicate: target market, fresh
 * (14-day target-market window), relevant role. scan.ts and adapters share
 * this so the gate can't drift between call sites.
 */
export function passesMarketGate(job: { location?: string | null; postedAt?: string | null; title?: string | null }): boolean {
  return isTargetMarket(job.location) && isFresh(job.postedAt, new Date(), true) && isRelevantRole(job.title);
}
