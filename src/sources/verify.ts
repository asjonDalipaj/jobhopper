import type { CompanyEntry } from './companies.js';
import { fetchWithTimeout } from './html.js';
import { parseWorkdayToken, workdayCxs } from './workday.js';

const BASE_URLS: Record<string, (token: string) => string> = {
  greenhouse: (t) => `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(t)}/jobs`,
  lever: (t) => `https://api.lever.co/v0/postings/${encodeURIComponent(t)}?mode=json`,
  ashby: (t) => `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(t)}`,
  workable: (t) => `https://apply.workable.com/api/v3/accounts/${encodeURIComponent(t)}/jobs`,
  teamtailor: (t) => `https://${encodeURIComponent(t)}.teamtailor.com/jobs.json`,
  recruitee: (t) => `https://${encodeURIComponent(t)}.recruitee.com/api/offers/`,
  smartrecruiters: (t) => `https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(t)}/postings?limit=1`,
};

/**
 * Check whether a company board token resolves to a live, readable feed.
 *
 * Uses GET (not HEAD) because the ATS JSON endpoints may reject HEAD while
 * serving GET fine, which would falsely prune live boards.
 */
export async function verifyCompanyBoard(company: CompanyEntry): Promise<boolean> {
  if (company.ats === 'workday') {
    // Workday's board check is a POST, not a GET.
    try {
      const res = await fetchWithTimeout(`${workdayCxs(parseWorkdayToken(company.token))}/jobs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'User-Agent': 'jobhopper/0.1' },
        body: JSON.stringify({ appliedFacets: {}, limit: 1, offset: 0, searchText: '' }),
      });
      return res.ok;
    } catch {
      return false;
    }
  }
  const makeUrl = BASE_URLS[company.ats];
  if (!makeUrl) return false;
  try {
    const url = makeUrl(company.token);
    const res = await fetchWithTimeout(url, {
      method: 'GET',
      headers: { 'User-Agent': 'jobhopper/0.1', Accept: 'application/json' },
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Return only the companies whose boards respond OK. Never throws. */
export async function filterLiveCompanies(
  companies: CompanyEntry[],
  concurrency = 6,
): Promise<{ live: CompanyEntry[]; dead: CompanyEntry[] }> {
  const live: CompanyEntry[] = [];
  const dead: CompanyEntry[] = [];
  const queue = [...companies];
  const worker = async () => {
    while (queue.length) {
      const c = queue.shift();
      if (!c) return;
      const ok = await verifyCompanyBoard(c);
      (ok ? live : dead).push(c);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, queue.length) }, worker));
  return { live, dead };
}