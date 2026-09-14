import type { JobSource, SourceJob } from './types.js';
import { guessWorkplace, guessEmployment } from './types.js';
import { stripHtml, fetchWithTimeout } from './html.js';

interface AshbyPosting {
  id?: string;
  title?: string;
  location?: string;
  secondaryLocations?: string[];
  jobUrl?: string;
  employmentType?: { name?: string };
  publishedAt?: string;
  jobDescriptionAsHtml?: string;
}

/**
 * Fetch an employer's postings from Ashby's public job board API:
 *   https://api.ashbyhq.com/posting-api/job-board/{token}
 */
export const ashby: JobSource = {
  name: 'ashby',
  async fetchCompany(company) {
    const url = `https://api.ashbyhq.com/posting-api/job-board/${company.token}`;
    const res = await fetchWithTimeout(url, { headers: { Accept: 'application/json', 'User-Agent': 'jobhopper/0.1' } });
    if (!res.ok) {
      throw new Error(`ashby(${company.name}): HTTP ${res.status}`);
    }
    const data = (await res.json()) as { jobs?: AshbyPosting[] };
    const jobs = data.jobs ?? [];
    return jobs.map((j) => {
      const title = j.title ?? 'Untitled';
      const location = [j.location, ...(j.secondaryLocations ?? [])].filter(Boolean).join('; ');
      const desc = stripHtml(j.jobDescriptionAsHtml ?? '');
      return {
        externalId: String(j.id ?? `${company.token}-${title}`),
        source: 'ashby',
        company: company.name,
        title,
        location,
        workplaceType: guessWorkplace(location),
        employmentType: j.employmentType?.name ?? guessEmployment(desc.slice(0, 300)),
        url: j.jobUrl ?? undefined,
        description: desc,
        postedAt: j.publishedAt ?? null,
      } satisfies SourceJob;
    });
  },
};