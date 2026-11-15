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
  applied_at: string | null;
  /** Last time a board returned this posting; null on rows seeded before 2026-11-13. */
  last_seen: string | null;
  tags: string | null;
  category: string | null;
  normalized_locations: string | null;
  extracted_workplace_type: string | null;
  extraction_model: string | null;
  /** JSON array of normalized skills. */
  skills: string | null;
  experience_min_years: number | null;
  salary_min: number | null;
  salary_max: number | null;
  salary_currency: string | null;
  salary_frequency: string | null;
  /** ISO 639-1 code of the posting's language. */
  language: string | null;
  /** Internal (direct employer) or External (recruiter/staffing agency). */
  employer_type: string | null;
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