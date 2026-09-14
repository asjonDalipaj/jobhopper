import type { JobSource, SourceJob } from './types.js';
import { guessWorkplace, guessEmployment } from './types.js';
import { stripHtml } from './greenhouse.js';

interface LeverPosting {
  id?: string;
  text?: string;
  hostedUrl?: string;
  location?: string;
  workplaceType?: string;
  createdAt?: number | string;
  descriptionPlain?: string;
  description?: string;
  categories?: {
    commitment?: string;
    location?: string;
    team?: string;
    allLocations?: string;
  };
}

/**
 * Fetch an employer's postings from Lever's public API:
 *   https://api.lever.co/v0/postings/{token}?mode=json&limit=100
 */
export const lever: JobSource = {
  name: 'lever',
  async fetchCompany(company) {
    const url = `https://api.lever.co/v0/postings/${company.token}?mode=json`;
    const res = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': 'jobhopper/0.1' } });
    if (!res.ok) {
      throw new Error(`lever(${company.name}): HTTP ${res.status}`);
    }
    const jobs = (await res.json()) as LeverPosting[];
    return jobs.map((j) => {
      const title = j.text ?? 'Untitled';
      const location = j.location ?? j.categories?.allLocations ?? '';
      const desc = j.descriptionPlain ?? stripHtml(j.description ?? '');
      return {
        externalId: String(j.id ?? `${company.token}-${title}`),
        source: 'lever',
        company: company.name,
        title,
        location,
        workplaceType: j.workplaceType ?? guessWorkplace(location),
        employmentType: j.categories?.commitment ?? guessEmployment(j.categories?.commitment ?? ''),
        url: j.hostedUrl ?? undefined,
        description: desc,
        postedAt: typeof j.createdAt === 'number' ? new Date(j.createdAt).toISOString() : null,
      } satisfies SourceJob;
    });
  },
};