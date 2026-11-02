import { type JobSource, type SourceJob, guessWorkplace } from './types.js';
import { fetchWithTimeout, stripHtml } from './html.js';
import { TARGET_MARKET_MAX_AGE_DAYS } from '../market.js';

/**
 * EURES — the EU public employment services feed. Unauthenticated JSON API
 * behind the portal; no company tokens. Country + "last week" queries only:
 * the API rejects keyword lists (HTTP 500), so the scan's role gate does the
 * software filtering.
 */
const API_URL = 'https://europa.eu/eures/api/jv-searchengine/public/jv-search/search';
const DETAIL_URL = (id: string) => `https://europa.eu/eures/portal/jv-se/jv-details/${encodeURIComponent(id)}?lang=en`;
const COUNTRIES = ['it', 'es', 'nl'] as const;
const COUNTRY_NAMES: Record<string, string> = { IT: 'Italy', ES: 'Spain', NL: 'Netherlands' };
const PAGE_SIZE = 50;
const MAX_PAGES = 10;

export interface EuresItem {
  id?: string;
  title?: string;
  description?: string;
  creationDate?: number;
  lastModificationDate?: number;
  locationMap?: Record<string, string[]>;
  employer?: { name?: string };
  positionOfferingCode?: string;
  translations?: Record<string, { description?: string }>;
}

export interface EuresSearchBody {
  resultsPerPage: number;
  page: number;
  sortSearch: 'MOST_RECENT';
  keywords: string[];
  publicationPeriod: 'LAST_WEEK';
  locationCodes: string[];
  requestLanguage: 'en';
  [key: string]: unknown;
}

/** Search body for one country/page; LAST_WEEK is the narrowest supported period. */
export function euresSearchBody(country: string, page: number): EuresSearchBody {
  return {
    resultsPerPage: PAGE_SIZE,
    page,
    sortSearch: 'MOST_RECENT',
    keywords: [],
    publicationPeriod: 'LAST_WEEK',
    occupationUris: [],
    skillUris: [],
    requiredExperienceCodes: [],
    positionScheduleCodes: [],
    sectorCodes: [],
    educationAndQualificationLevelCodes: [],
    positionOfferingCodes: [],
    locationCodes: [country],
    euresFlagCodes: [],
    otherBenefitsCodes: [],
    requiredLanguages: [],
    minNumberPost: null,
    sessionId: 'jobhopper',
    requestLanguage: 'en',
  };
}

/** "Italy (ITC11)" — the feed has country + NUTS codes, not city names. */
export function euresLocation(locationMap: Record<string, string[]> | undefined): string {
  const country = Object.keys(locationMap ?? {})[0];
  if (!country) return '';
  const name = COUNTRY_NAMES[country.toUpperCase()] ?? country.toUpperCase();
  const regions = (locationMap?.[country] ?? []).filter((r): r is string => typeof r === 'string').slice(0, 3);
  return regions.length ? `${name} (${regions.join(', ')})` : name;
}

/** EURES dates are epoch milliseconds. */
export function euresPostedAt(value: unknown): string | null {
  const ms = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(ms) || ms <= 0) return null;
  const date = new Date(ms);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function euresEmploymentType(code: string | undefined): string | null {
  const value = (code ?? '').toLowerCase();
  if (['permanent', 'directhire', 'regular', 'fulltime'].includes(value)) return 'Full-time';
  if (value === 'parttime') return 'Part-time';
  if (['contract', 'contracttohire', 'selfemployed', 'freelance'].includes(value)) return 'Contract';
  if (['temporary', 'temporarytohire', 'seasonal', 'oncall', 'casual'].includes(value)) return 'Temporary';
  if (['apprenticeship', 'internship'].includes(value)) return 'Internship';
  return null;
}

/** Map one EURES search row to the shared SourceJob shape; null when unusable. */
export function euresJob(item: EuresItem): SourceJob | null {
  const id = (item.id ?? '').trim();
  const title = (item.title ?? '').trim();
  if (!id || !title) return null;
  const description = stripHtml(item.description ?? '') ||
    stripHtml(Object.values(item.translations ?? {})[0]?.description ?? '');
  const location = euresLocation(item.locationMap);
  return {
    externalId: id,
    source: 'eures',
    company: item.employer?.name?.trim() || 'Unknown employer',
    title,
    location,
    workplaceType: guessWorkplace(`${location} ${description.slice(0, 200)}`),
    employmentType: euresEmploymentType(item.positionOfferingCode),
    url: DETAIL_URL(id),
    description,
    postedAt: euresPostedAt(item.creationDate),
  };
}

/**
 * Aggregator: every Italian/Spanish/Dutch vacancy from the last week, newest
 * first, stopping once a page is older than the scan's freshness window.
 */
export const eures: JobSource = {
  name: 'eures',
  aggregator: true,
  async fetchAll() {
    const cutoff = Date.now() - TARGET_MARKET_MAX_AGE_DAYS * 86_400_000;
    const jobs: SourceJob[] = [];
    for (const country of COUNTRIES) {
      for (let page = 1; page <= MAX_PAGES; page += 1) {
        const res = await fetchWithTimeout(
          API_URL,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Accept: 'application/json',
              Origin: 'https://europa.eu',
              Referer: 'https://europa.eu/eures/portal/jv-se/search?lang=en',
              'User-Agent': 'Mozilla/5.0 (compatible; jobhopper/0.1)',
            },
            body: JSON.stringify(euresSearchBody(country, page)),
          },
          15_000,
        );
        if (!res.ok) throw new Error(`eures(${country}): HTTP ${res.status}`);
        const data = (await res.json()) as { jvs?: EuresItem[] };
        const items = data.jvs ?? [];
        if (!items.length) break;
        for (const item of items) {
          const job = euresJob(item);
          if (!job) continue;
          // Keep genuinely new vacancies only: EURES republishes old ones in
          // bulk, so a recent lastModificationDate says nothing about age.
          const posted = job.postedAt ? Date.parse(job.postedAt) : Number.NaN;
          if (Number.isFinite(posted) && posted >= cutoff) jobs.push(job);
        }
        // Pages are sorted by lastModificationDate; once a whole page is older
        // than the cutoff, no later page can contain a newer creation date.
        const modified = items
          .map((item) => Number(item.lastModificationDate))
          .filter((time) => Number.isFinite(time) && time > 0);
        if (!modified.length || Math.max(...modified) < cutoff) break;
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
    }
    return jobs;
  },
};
