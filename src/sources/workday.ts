import { type JobSource, type SourceJob, guessWorkplace } from './types.js';
import { fetchWithTimeout, stripHtml } from './html.js';
import { isTargetMarket } from '../market.js';

/** Workday tokens are `tenant|shard|site`, e.g. `matthey|wd3|Ext_Career_Site`. */
export interface WorkdayToken {
  tenant: string;
  shard: string;
  site: string;
}

const MAX_LISTED = 300;
const MAX_DETAILS = 25;

export function parseWorkdayToken(token: string): WorkdayToken {
  const parts = token.split('|');
  if (parts.length !== 3 || parts.some((p) => !p)) {
    throw new Error(`workday: expected tenant|shard|site, got "${token}"`);
  }
  return { tenant: parts[0], shard: parts[1], site: parts[2] };
}

export function workdayCxs(token: WorkdayToken): string {
  return `https://${token.tenant}.${token.shard}.myworkdayjobs.com/wday/cxs/${token.tenant}/${token.site}`;
}

interface ListPosting {
  title?: string;
  externalPath?: string;
  locationsText?: string;
}

export interface WorkdayListPage {
  total?: number;
  jobPostings?: ListPosting[];
}

export interface WorkdayDetail {
  jobPostingInfo?: {
    title?: string;
    jobDescription?: string;
    startDate?: string;
    postedOn?: string;
    externalUrl?: string;
    location?: string;
    timeType?: string;
  };
}

/**
 * Workday's list feed has no date. Prefer the detail `startDate`; fall back to
 * the relative `postedOn` text ("Posted Today", "Posted 3 Days Ago").
 */
export function workdayPostedAt(info: { startDate?: string; postedOn?: string }): string | null {
  if (info.startDate) return info.startDate;
  const text = info.postedOn ?? '';
  if (/today/i.test(text)) return new Date().toISOString();
  if (/yesterday/i.test(text)) return new Date(Date.now() - 86_400_000).toISOString();
  const days = /(\d+)\+?\s*day/i.exec(text);
  return days ? new Date(Date.now() - Number(days[1]) * 86_400_000).toISOString() : null;
}

/** Map one list posting + its detail payload to a normalized job. */
export function workdayJob(
  company: { name: string; token: string },
  posting: ListPosting,
  detail: WorkdayDetail,
): SourceJob | null {
  if (!posting.externalPath) return null;
  const token = parseWorkdayToken(company.token);
  const info = detail.jobPostingInfo ?? {};
  const location = info.location ?? posting.locationsText ?? '';
  const description = stripHtml(info.jobDescription ?? '');
  return {
    externalId: posting.externalPath,
    source: 'workday',
    company: company.name,
    title: info.title ?? posting.title ?? 'Untitled',
    location,
    workplaceType: guessWorkplace(`${location} ${description.slice(0, 200)}`),
    employmentType: info.timeType ?? null,
    url:
      info.externalUrl ??
      `https://${token.tenant}.${token.shard}.myworkdayjobs.com/${token.site}${posting.externalPath}`,
    description,
    postedAt: workdayPostedAt(info),
  };
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetchWithTimeout(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'User-Agent': 'jobhopper/0.1' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`workday: HTTP ${res.status}`);
  return (await res.json()) as T;
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetchWithTimeout(url, {
    headers: { Accept: 'application/json', 'User-Agent': 'jobhopper/0.1' },
  });
  if (!res.ok) throw new Error(`workday: HTTP ${res.status}`);
  return (await res.json()) as T;
}

/**
 * Public Workday CXS feed. The list is paginated and locale-free; details are
 * fetched only for postings whose location is in the target market, because
 * the list has neither a date nor a description.
 */
export const workday: JobSource = {
  name: 'workday',
  async fetchCompany(company) {
    const token = parseWorkdayToken(company.token);
    const cxs = workdayCxs(token);
    const jobs: SourceJob[] = [];
    let offset = 0;
    let total = Number.POSITIVE_INFINITY;
    let details = 0;
    while (offset < total && offset < MAX_LISTED) {
      const page = await postJson<WorkdayListPage>(`${cxs}/jobs`, {
        appliedFacets: {},
        limit: 20,
        offset,
        searchText: '',
      });
      total = page.total ?? 0;
      const postings = page.jobPostings ?? [];
      if (!postings.length) break;
      for (const posting of postings) {
        if (details >= MAX_DETAILS) break;
        if (!isTargetMarket(posting.locationsText)) continue;
        try {
          const detail = await getJson<WorkdayDetail>(`${cxs}${posting.externalPath}`);
          const job = workdayJob(company, posting, detail);
          if (job) {
            jobs.push(job);
            details += 1;
          }
        } catch {
          // One unreadable detail must not drop the board.
        }
      }
      offset += postings.length;
    }
    return jobs;
  },
};
