import type { CompanyEntry } from './companies.js';

const BASE_URLS: Record<string, (token: string) => string> = {
  greenhouse: (t) => `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(t)}/jobs`,
  lever: (t) => `https://api.lever.co/v0/postings/${encodeURIComponent(t)}?mode=json`,
  ashby: (t) => `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(t)}`,
};

/** Check whether a company board token resolves to a live, readable feed. */
export async function verifyCompanyBoard(company: CompanyEntry): Promise<boolean> {
  const makeUrl = BASE_URLS[company.ats];
  if (!makeUrl) return false;
  try {
    const res = await fetch(makeUrl(company.token), {
      method: 'HEAD',
      headers: { 'User-Agent': 'jobhopper/0.1' },
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