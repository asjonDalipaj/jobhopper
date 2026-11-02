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
}
