import { type JobSource, type SourceJob, guessWorkplace } from './types.js';
import { fetchWithTimeout, stripHtml } from './html.js';

/**
 * SAP SuccessFactors public career feeds. Two shapes:
 *
 * - Recruiting Marketing sites: RSS 2.0 at `https://{host}/sitemal.xml`
 *   (the path is a long-standing typo, not a mistake here).
 * - Legacy Recruiting Management: XML at
 *   `https://{host}/career?company={ID}&career_ns=job_listing_summary&resultType=XML`
 *
 * A registry token is either a feed host (`careers.acme.com`) or a full legacy
 * career URL. No credentials.
 */

const LEGACY_HOST = /successfactors\.(com|eu)$/i;

export function successFactorsFeedUrl(token: string): string {
  const raw = token.trim();
  if (/^https?:\/\//i.test(raw)) {
    const url = new URL(raw);
    if (url.pathname === '/career' && url.searchParams.get('company') && LEGACY_HOST.test(url.hostname)) {
      url.searchParams.set('resultType', 'XML');
      return url.toString();
    }
    const base = `${url.origin}${url.pathname}`.replace(/\/+$/, '');
    return `${base}/sitemal.xml`;
  }
  if (raw.includes('.')) return `https://${raw}/sitemal.xml`;
  return `https://job.${raw}.com/sitemal.xml`;
}

function decodeEntities(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(Number(dec)))
    .replace(/&amp;/g, '&');
}

function cleanText(value: string | undefined): string {
  if (!value) return '';
  const text = value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<[^>]+>/g, ' ');
  return decodeEntities(text).replace(/\s+/g, ' ').trim();
}

function tagText(xml: string, name: string): string {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = xml.match(new RegExp(`<${escaped}(?:\\s[^>]*)?>([\\s\\S]*?)</${escaped}>`, 'i'));
  return cleanText(match?.[1]);
}

function splitTitleLocation(title: string): { title: string; location: string } {
  const match = title.match(/^(.*?)\s*\(([^()]*,[^()]*)\)\s*$/);
  if (!match) return { title, location: '' };
  return { title: match[1].trim(), location: match[2].trim() };
}

function parseDate(value: string): string | null {
  const raw = value.trim();
  if (!raw) return null;
  const dmy = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (dmy) {
    const date = new Date(Date.UTC(Number(dmy[3]), Number(dmy[2]) - 1, Number(dmy[1])));
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function employmentType(value: string): string | null {
  const lower = value.toLowerCase();
  if (!lower) return null;
  if (lower.includes('intern')) return 'Intern';
  if (lower.includes('part')) return 'Part-time';
  if (lower.includes('contract')) return 'Contract';
  if (lower.includes('temp')) return 'Temporary';
  if (lower.includes('full')) return 'Full-time';
  return null;
}

/** Parse a Recruiting Marketing RSS feed. Throws on non-RSS XML. */
export function parseSuccessFactorsFeed(xml: string, fallbackCompany = ''): SourceJob[] {
  if (!/<rss[\s>]/i.test(xml) && !/<channel[\s>]/i.test(xml)) {
    throw new Error('successfactors: not an RSS feed');
  }
  const channel = xml.match(/<channel[\s>][\s\S]*?<\/channel>/i)?.[0] ?? xml;
  const company = tagText(channel, 'title') || fallbackCompany;
  const jobs: SourceJob[] = [];
  for (const match of channel.matchAll(/<item[\s>]([\s\S]*?)<\/item>/gi)) {
    const item = match[1];
    const link = tagText(item, 'link');
    if (!link) continue;
    const rawTitle = tagText(item, 'title') || 'Untitled';
    const split = splitTitleLocation(rawTitle);
    const location = tagText(item, 'g:location') || split.location;
    const description = stripHtml(tagText(item, 'description'));
    const id = tagText(item, 'g:id') || link.replace(/[?#].*$/, '').split('/').filter(Boolean).pop() || link;
    const employer = tagText(item, 'g:employer');
    const posted =
      parseDate(tagText(item, 'pubDate')) ||
      parseDate(tagText(item, 'postDate')) ||
      parseDate(tagText(item, 'publishedDate')) ||
      parseDate(tagText(item, 'date'));
    jobs.push({
      externalId: id,
      source: 'successfactors',
      company: employer || company || fallbackCompany,
      title: split.title,
      location,
      workplaceType: guessWorkplace(`${location} ${description.slice(0, 200)}`),
      employmentType: employmentType(tagText(item, 'g:job_type')),
      url: link,
      description,
      postedAt: posted,
    });
  }
  return jobs;
}

/** Parse a legacy Recruiting Management `Job-Listing` feed. */
export function parseLegacyFeed(xml: string, host: string, companyId: string, fallbackCompany = ''): SourceJob[] {
  if (!/<Job-Listing[\s>]/i.test(xml)) throw new Error('successfactors: not a Job-Listing feed');
  const jobs: SourceJob[] = [];
  for (const match of xml.matchAll(/<Job[\s>]([\s\S]*?)<\/Job>/gi)) {
    const item = match[1];
    const reqId = tagText(item, 'ReqId');
    const title = tagText(item, 'JobTitle');
    if (!reqId || !title) continue;
    const split = splitTitleLocation(title);
    const description = stripHtml(tagText(item, 'Job-Description'));
    const location = tagText(item, 'Location') || split.location;
    const url = `https://${host}/sfcareer/jobreqcareer?${new URLSearchParams({ jobId: reqId, company: companyId })}`;
    jobs.push({
      externalId: reqId,
      source: 'successfactors',
      company: fallbackCompany || companyId,
      title: split.title,
      location,
      workplaceType: guessWorkplace(`${location} ${description.slice(0, 200)}`),
      employmentType: null,
      url,
      description,
      postedAt: parseDate(tagText(item, 'Posted-Date')),
    });
  }
  return jobs;
}

export const successfactors: JobSource = {
  name: 'successfactors',
  async fetchCompany(company) {
    const feedUrl = successFactorsFeedUrl(company.token);
    const res = await fetchWithTimeout(
      feedUrl,
      { headers: { Accept: 'application/rss+xml, application/xml, text/xml, */*' } },
      20_000,
    );
    if (!res.ok) throw new Error(`successfactors(${company.token}): HTTP ${res.status}`);
    const xml = await res.text();
    let jobs: SourceJob[];
    if (/<Job-Listing[\s>]/i.test(xml)) {
      const url = new URL(feedUrl);
      jobs = parseLegacyFeed(xml, url.hostname, url.searchParams.get('company') ?? company.token, company.name);
    } else {
      jobs = parseSuccessFactorsFeed(xml, company.name);
    }
    // Prefix ids: one source name spans every tenant, so raw ids collide.
    return jobs.map((job) => ({ ...job, externalId: `${company.token}|${job.externalId}` }));
  },
};
