import type { CompanyEntry } from './companies.js';
import { joinLocationParts, type JobSource, type SourceJob } from './types.js';
import { stripHtml, fetchWithTimeout } from './html.js';

export interface RecruiteeOffer {
  id?: number | string;
  slug?: string;
  title?: string;
  status?: string;
  published_at?: string;
  careers_url?: string;
  description?: string;
  locations?: Array<{ city?: string; country?: string; country_code?: string }>;
}

/**
 * Render Recruitee offer locations as "City, Country" parts joined by "; ".
 */
export function recruiteeLocation(locations: RecruiteeOffer['locations']): string {
  return joinLocationParts((locations ?? []).map((l) => [l.city, l.country]));
}

/**
 * Map a Recruitee /api/offers/ body to normalized postings. Pure: no I/O.
 * Only `published` offers are kept, so closed or draft postings never leak in.
 */
export function recruiteeJobsFromResponse(
  company: Pick<CompanyEntry, 'name' | 'token'>,
  body: { offers?: RecruiteeOffer[] },
): SourceJob[] {
  return (body.offers ?? [])
    .filter((o) => o.status === 'published')
    .map((o) => ({
      externalId: String(o.id ?? o.slug ?? `${company.token}-${o.title ?? 'untitled'}`),
      source: 'recruitee',
      company: company.name,
      title: o.title ?? 'Untitled',
      location: recruiteeLocation(o.locations),
      workplaceType: null,
      employmentType: null,
      url: o.careers_url ?? (o.slug ? `https://${company.token}.recruitee.com/o/${o.slug}` : null),
      description: stripHtml(o.description ?? ''),
      postedAt: o.published_at ?? null,
    }));
}

/**
 * Fetch an employer's postings from Recruitee's public offers API:
 *   https://{company}.recruitee.com/api/offers/
 * Verified live: returns { offers: [...] } with structured locations and status.
 */
export const recruitee: JobSource = {
  name: 'recruitee',
  async fetchCompany(company) {
    const url = `https://${encodeURIComponent(company.token)}.recruitee.com/api/offers/`;
    const res = await fetchWithTimeout(url, { headers: { Accept: 'application/json', 'User-Agent': 'jobhopper/0.1' } });
    if (!res.ok) {
      throw new Error(`recruitee(${company.name}): HTTP ${res.status}`);
    }
    return recruiteeJobsFromResponse(company, (await res.json()) as { offers?: RecruiteeOffer[] });
  },
};
