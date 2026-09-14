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
  verdict: 'all' | 'strong' | 'fair' | 'weak' | 'unjudged';
  country: string;
  remoteOnly: boolean;
}
