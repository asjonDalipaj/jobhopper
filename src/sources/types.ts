/** A normalized job posting as ingested from any source. */
export interface SourceJob {
  externalId: string;
  source: string;
  company: string;
  title: string;
  location: string;
  workplaceType?: string | null;
  employmentType?: string | null;
  url?: string | null;
  description?: string;
  postedAt?: string | null;
}

export interface ScraperStats {
  source: string;
  fetched: number;
  errors: number;
}

/**
 * A job posting source.
 *
 * ATS board sources (Greenhouse/Lever/Ashby) fetch one company at a time via
 * `fetchCompany`. Open aggregator sources (Remotive, RemoteOK) have no company
 * concept — they implement `fetchAll` and are run as whole-market sources.
 */
export interface JobSource {
  readonly name: string;
  /** True for whole-market aggregators that implement `fetchAll`. */
  readonly aggregator?: boolean;
  /** Fetch all postings for a company board (ATS sources only). */
  fetchCompany?(company: { name: string; token: string }): Promise<SourceJob[]>;
  /** Fetch all postings from the whole market (aggregator sources only). */
  fetchAll?(): Promise<SourceJob[]>;
}

/**
 * Join per-posting locations (each a list of parts such as ["Milan", "IT"])
 * into one "; "-separated string. Empty parts and empty locations are dropped.
 */
export function joinLocationParts(locations: Array<Array<string | null | undefined>>): string {
  return locations
    .map((parts) => parts.filter((p): p is string => Boolean(p)).join(', '))
    .filter(Boolean)
    .join('; ');
}

/** Guess a workplace type keyword from location/description text. */
export function guessWorkplace(text: string | undefined): string | null {
  if (!text) return null;
  const upper = text.toUpperCase();
  if (upper.includes('REMOTE')) return 'Remote';
  if (upper.includes('HYBRID')) return 'Hybrid';
  if (upper.includes('ON-SITE') || upper.includes('ONSITE') || upper.includes('ON SITE')) return 'On-site';
  return null;
}

/** Guess an employment type keyword. */
export function guessEmployment(text: string | undefined): string | null {
  if (!text) return null;
  const lower = text.toLowerCase();
  if (lower.includes('contract')) return 'Contract';
  if (lower.includes('full time') || lower.includes('full-time') || lower.includes('fulltime')) return 'Full-time';
  if (lower.includes('part time') || lower.includes('part-time')) return 'Part-time';
  if (lower.includes('intern')) return 'Intern';
  if (lower.includes('temporary') || lower.includes('temp')) return 'Temporary';
  return null;
}