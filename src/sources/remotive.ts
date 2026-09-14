import type { JobSource, SourceJob } from './types.js';
import { guessWorkplace, guessEmployment } from './types.js';
import { stripHtml, fetchWithTimeout } from './html.js';

interface RemotiveJob {
  id?: number | string;
  url?: string;
  company_name?: string;
  title?: string;
  job_type?: string;
  candidate_required_location?: string;
  publication_date?: string;
  description?: string;
  tags?: string[];
}

/**
 * Whole-market remote job aggregator.
 * Public API: GET https://remotive.com/api/remote-jobs
 * Returns remote jobs across all industries; we keep the software/engineering set
 * (identified by tag) and normalize to SourceJob.
 */
export const remotive: JobSource = {
  name: 'aggregator-remotive',
  aggregator: true,
  async fetchAll() {
    const res = await fetchWithTimeout('https://remotive.com/api/remote-jobs', {
      headers: { 'User-Agent': 'jobhopper/0.1', Accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`remotive: HTTP ${res.status}`);
    const data = (await res.json()) as { jobs?: RemotiveJob[] };
    const jobs = data.jobs ?? [];
    return jobs
      .filter((j) => isSoftware(j))
      .map((j): SourceJob => {
        const title = j.title ?? 'Untitled';
        const desc = stripHtml(j.description ?? '');
        return {
          externalId: String(j.id ?? `${j.company_name}-${title}`),
          source: 'aggregator-remotive',
          company: j.company_name ?? 'Unknown',
          title,
          location: j.candidate_required_location ?? '',
          workplaceType: 'Remote',
          employmentType: guessEmployment(`${j.job_type ?? ''} ${desc.slice(0, 200)}`),
          url: j.url ?? undefined,
          description: desc,
          postedAt: j.publication_date ?? null,
        };
      });
  },
};

function isSoftware(j: RemotiveJob): boolean {
  const tags = (j.tags ?? []).join(' ').toLowerCase();
  const title = (j.title ?? '').toLowerCase();
  return (
    tags.includes('software') ||
    tags.includes('frontend') ||
    tags.includes('backend') ||
    tags.includes('devops') ||
    tags.includes('database') ||
    tags.includes('full-stack') ||
    tags.includes('fullstack') ||
    title.includes('engineer') ||
    title.includes('developer') ||
    title.includes('frontend') ||
    title.includes('backend') ||
    title.includes('full-stack') ||
    title.includes('fullstack')
  );
}