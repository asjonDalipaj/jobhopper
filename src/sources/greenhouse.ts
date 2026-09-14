import type { JobSource, SourceJob } from './types.js';
import { guessWorkplace, guessEmployment } from './types.js';
import { stripHtml, fetchWithTimeout } from './html.js';

interface GreenhouseJobResponse {
  id?: number | string;
  title?: string;
  location?: { name?: string };
  absolute_url?: string | null;
  content?: string;
  updated_at?: string;
  created_at?: string;
  workplace_type?: string | null;
  employment_type?: string | null;
  departments?: Array<{ name?: string }>;
}

/**
 * Fetch an employer's postings from Greenhouse's public jobs board API:
 *   https://boards-api.greenhouse.io/v1/boards/{token}/jobs?content=true
 */
export const greenhouse: JobSource = {
  name: 'greenhouse',
  async fetchCompany(company) {
    const url = `https://boards-api.greenhouse.io/v1/boards/${company.token}/jobs?content=true`;
    const res = await fetchWithTimeout(url, {
      headers: { Accept: 'application/json', 'User-Agent': 'jobhopper/0.1' },
    });
    if (!res.ok) {
      throw new Error(`greenhouse(${company.name}): HTTP ${res.status}`);
    }
    const data = (await res.json()) as { jobs?: GreenhouseJobResponse[] };
    const jobs = data.jobs ?? [];
    return jobs.map((j) => {
      const title = j.title ?? 'Untitled';
      const location = j.location?.name ?? '';
      const desc = stripHtml(j.content ?? '');
      return {
        externalId: String(j.id ?? `${company.token}-${title}`),
        source: 'greenhouse',
        company: company.name,
        title,
        location,
        workplaceType: j.workplace_type ?? guessWorkplace(location),
        employmentType: j.employment_type ?? guessEmployment(desc.slice(0, 400)),
        url: j.absolute_url ?? undefined,
        description: desc,
        postedAt: j.updated_at ?? j.created_at ?? null,
      } satisfies SourceJob;
    });
  },
};
