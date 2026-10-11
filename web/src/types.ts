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
}

export interface FilterState {
  search: string;
  verdict: 'all' | 'strong' | 'fair' | 'weak' | 'no' | 'unjudged';
  /** A continent ("Europe") or country ("Netherlands") to filter by. */
  country: string;
  /** YYYY-MM-DD lower bound for the posting date (inclusive). */
  dateFrom: string;
  /** YYYY-MM-DD upper bound for the posting date (inclusive). */
  dateTo: string;
  remoteOnly: boolean;
}
