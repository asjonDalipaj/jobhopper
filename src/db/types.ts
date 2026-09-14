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
  created_at: string;
  tags: string | null;
}

export type Verdict = 'no' | 'weak' | 'fair' | 'strong';

export interface Judgment {
  id: number;
  job_id: number;
  verdict: Verdict;
  reasoning: string;
  model: string;
  quick: boolean;
  judged_at: string;
}

export interface Tab {
  id: number;
  name: string;
  description: string | null;
  created_at: string;
}

export interface JobWithVerdict {
  job: Job;
  verdict: Verdict | null;
  reasoning: string | null;
}

export interface SearchRow extends Job {
  match_rank: number;
  verdict: Verdict | null;
}