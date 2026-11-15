export type Verdict = 'no' | 'weak' | 'fair' | 'strong';

export interface Job {
  id: number;
  external_id: string;
  source: string;
  company: string;
  title: string;
  location: string;
  workplace_type: string | null;
  employment_type: string | null;
  url: string;
  description: string;
  posted_at: string | null;
  created_at?: string;
  tags?: string | null;
  verdict?: Verdict | null;
  reasoning?: string | null;
  /** ISO date the user applied, synced from the local DB snapshot. */
  applied_at?: string | null;
  /** ISO date the row first appeared in a snapshot (cross-run, scan-to-scan). */
  first_seen?: string | null;
  /** ISO date a board last returned this row (liveness; unjudged rows age out after 7 days). */
  last_seen?: string | null;
  /** Extracted fields (absent until the row has been enriched). */
  category?: string | null;
  locations?: string[] | null;
  skills?: string[] | null;
  experience_min_years?: number | null;
  salary_min?: number | null;
  salary_max?: number | null;
  salary_currency?: string | null;
  salary_frequency?: string | null;
  /** ISO 639-1 code of the posting's language. */
  language?: string | null;
  /** Internal (direct employer) or External (recruiter/staffing agency). */
  employer_type?: string | null;
  extraction_model?: string | null;
}

export interface FilterState {
  search: string;
  verdict: 'all' | 'relevant' | 'strong' | 'fair' | 'weak' | 'no' | 'unjudged';
  /** A continent ("Europe") or country ("Netherlands") to filter by. */
  country: string;
  /** YYYY-MM-DD lower bound for the posting date (inclusive). */
  dateFrom: string;
  /** YYYY-MM-DD upper bound for the posting date (inclusive). */
  dateTo: string;
  remoteOnly: boolean;
  /** Show only rows first seen within the last 3 days. */
  newOnly: boolean;
  /** Filter by the user's applied flag (localStorage merged with snapshot). */
  applied: 'all' | 'applied' | 'not';
  /** Only rows whose extracted employer_type is Internal (skips recruiters). */
  directOnly: boolean;
  /** Max stated years of experience ('' = any); unknown years are kept. */
  maxYears: string;
}
