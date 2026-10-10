import { type JobSource, type SourceJob } from './types.js';
import { fetchWithTimeout, stripHtml } from './html.js';
import { isTargetMarket, isFresh, isRelevantRole } from '../market.js';

export interface SmartrecruitersPosting {
  id?: string;
  name?: string;
  releasedDate?: string;
  typeOfEmployment?: { label?: string };
  location?: {
    city?: string;
    country?: string;
    fullLocation?: string;
    remote?: boolean;
    hybrid?: boolean;
  };
}

/**
 * Pick the most readable location string: fullLocation, else "city, country",
 * else the bare country code. Empty when the posting has no location.
 */
export function smartrecruitersLocation(loc: SmartrecruitersPosting['location']): string {
  if (!loc) return '';
  if (loc.fullLocation) return loc.fullLocation;
  return [loc.city, loc.country].filter(Boolean).join(', ');
}

/** Map one SmartRecruiters list page to normalized postings. Pure: no I/O. */
export function smartrecruitersJobsFromPage(
  company: { name: string; token: string },
  page: { content?: SmartrecruitersPosting[] },
): SourceJob[] {
  // A posting without an id has no stable externalId and no usable URL — drop it
  // rather than emitting externalId "undefined".
  return (page.content ?? [])
    .filter((p) => p.id !== undefined && p.id !== null && String(p.id) !== '')
    .map((p) => {
    const id = String(p.id);
    const workplaceType = p.location?.remote ? 'Remote' : p.location?.hybrid ? 'Hybrid' : null;
    return {
      externalId: id,
      source: 'smartrecruiters',
      company: company.name,
      title: p.name ?? 'Untitled',
      location: smartrecruitersLocation(p.location),
      workplaceType,
      employmentType: p.typeOfEmployment?.label ?? null,
      url: `https://jobs.smartrecruiters.com/${encodeURIComponent(company.token)}/${encodeURIComponent(id)}`,
      description: '',
      postedAt: p.releasedDate ?? null,
    };
  });
}

export interface SmartrecruitersDetail {
  jobAd?: {
    sections?: {
      jobDescription?: { text?: string };
      qualifications?: { text?: string };
      companyDescription?: { text?: string };
      additionalInformation?: { text?: string };
    };
  };
}

/**
 * Combine a posting's detail sections into one plain-text description.
 * Pure: no I/O. Empty when the detail carries no sections.
 */
export function smartrecruitersDescription(detail: SmartrecruitersDetail): string {
  const sections = detail.jobAd?.sections;
  if (!sections) return '';
  return [
    sections.jobDescription?.text,
    sections.qualifications?.text,
    sections.additionalInformation?.text,
  ]
    .map((html) => stripHtml(html ?? ''))
    .filter(Boolean)
    .join('\n\n');
}

/**
 * Fetch one posting's full description from the detail endpoint.
 * Returns '' on any failure — a missing description must not fail the scan.
 */
export async function fetchSmartrecruitersDescription(token: string, id: string): Promise<string> {
  try {
    const url = `https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(token)}/postings/${encodeURIComponent(id)}`;
    const res = await fetchWithTimeout(url, { headers: { Accept: 'application/json', 'User-Agent': 'jobhopper/0.1' } });
    if (!res.ok) return '';
    return smartrecruitersDescription((await res.json()) as SmartrecruitersDetail);
  } catch {
    return '';
  }
}

const PAGE_SIZE = 100;
const MAX_PAGES = 20;

/**
 * Fetch an employer's postings from SmartRecruiters' public postings API,
 * paging with limit/offset until totalFound is reached (capped at MAX_PAGES).
 * The list endpoint carries no descriptions, so postings that survive the
 * market gate get their full text from the detail endpoint (sequential —
 * survivors are few, politeness over throughput). Failures keep ''.
 */
export const smartrecruiters: JobSource = {
  name: 'smartrecruiters',
  async fetchCompany(company) {
    const jobs: SourceJob[] = [];
    for (let page = 0; page < MAX_PAGES; page++) {
      const url = `https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(company.token)}/postings?limit=${PAGE_SIZE}&offset=${page * PAGE_SIZE}`;
      const res = await fetchWithTimeout(url, { headers: { Accept: 'application/json', 'User-Agent': 'jobhopper/0.1' } });
      if (!res.ok) {
        throw new Error(`smartrecruiters(${company.name}): HTTP ${res.status}`);
      }
      const body = (await res.json()) as { totalFound?: number; content?: SmartrecruitersPosting[] };
      jobs.push(...smartrecruitersJobsFromPage(company, body));
      const fetched = (page + 1) * PAGE_SIZE;
      if (!body.content?.length || fetched >= (body.totalFound ?? 0)) break;
    }
    for (const job of jobs) {
      if (job.description) continue;
      if (!isTargetMarket(job.location)) continue;
      if (!isFresh(job.postedAt, new Date(), true)) continue;
      if (!isRelevantRole(job.title)) continue;
      job.description = await fetchSmartrecruitersDescription(company.token, job.externalId);
    }
    return jobs;
  },
};
