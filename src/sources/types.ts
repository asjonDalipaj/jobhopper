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

export interface JobSource {
  readonly name: string;
  /** Fetch all available postings for the given company board token. */
  fetchCompany(company: { name: string; token: string }): Promise<SourceJob[]>;
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