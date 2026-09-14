import type { JobSource, SourceJob } from './types.js';
import { guessWorkplace, guessEmployment } from './types.js';

interface RemoteOkJob {
  id?: string;
  slug?: string;
  company?: string;
  position?: string;
  location?: string;
  url?: string;
  description?: string;
  epoch?: number;
  tags?: string[];
}

/**
 * Whole-market remote developer job aggregator.
 * Public API: GET https://remoteok.com/api
 * Requires an honest User-Agent; returns remote developer jobs, newest first.
 */
export const remoteok: JobSource = {
  name: 'aggregator-remoteok',
  aggregator: true,
  async fetchAll() {
    const res = await fetch('https://remoteok.com/api', {
      headers: { 'User-Agent': 'jobhopper/0.1 (local job search tool; link back to RemoteOK)', Accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`remoteok: HTTP ${res.status}`);
    const data = (await res.json()) as RemoteOkJob[];
    // The first element is metadata (not a job) when the payload starts with {legal:...}.
    const jobs = Array.isArray(data) ? data.filter(isJob) : [];
    return jobs.map((j): SourceJob => {
      const title = j.position ?? 'Untitled';
      return {
        externalId: String(j.id ?? j.slug ?? `${j.company}-${title}`),
        source: 'aggregator-remoteok',
        company: j.company ?? 'Unknown',
        title,
        location: j.location ?? 'Remote',
        workplaceType: 'Remote',
        employmentType: guessEmployment((j.tags ?? []).join(' ')),
        url: j.url ?? undefined,
        description: strip(j.description ?? ''),
        postedAt: j.epoch ? new Date(j.epoch * 1000).toISOString() : null,
      };
    });
  },
};

/** A payload record is a real job if it has a position/company; the first element is metadata. */
function isJob(j: unknown): j is RemoteOkJob {
  return (
    typeof j === 'object' &&
    j !== null &&
    'position' in j &&
    'slug' in j &&
    typeof j.position === 'string'
  );
}

function strip(html: string): string {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
}