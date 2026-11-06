/**
 * Aggregator quality policy. Aggregators are useful for discovery, but they
 * republish recruiter, staffing and consultancy roles. Direct ATS boards are
 * unaffected; aggregator rows must be fair/strong AND not agency-shaped.
 */

const AGENCY_NAMES = new Set([
  'carusihr',
  'techyon',
  'welyk',
  'fortil',
  'grafton',
  'mc engineering',
  'digital talent agency',
  'second window',
  'social you',
  'grupo digital',
  'panel sistemas',
  'belmont lavan',
  'orisha',
  'accenture',
  'avanade',
]);

const AGENCY_NAME_PATTERN =
  /\b(recruit(?:er|ers|ing|ment)?|staffing|headhunt(?:er|ers|ing)?|talent|interim|agenc(?:y|ies)|consult(?:ing|ancy|ants?)?|outsourc(?:ing|ed)?|human resources)\b/i;

const AGENCY_TEXT_PATTERN =
  /\b(our client|for a client|on behalf of|recruiting for|staffing agency|recruitment agency|consultancy)\b/i;

/** Heuristic: is this company an agency/consultancy rather than a direct employer? */
export function isAgencyCompany(name: string, description = ''): boolean {
  const normalized = name.trim().toLowerCase();
  if (!normalized) return false;
  if ([...AGENCY_NAMES].some((agency) => normalized === agency || normalized.startsWith(`${agency} `))) return true;
  if (AGENCY_NAME_PATTERN.test(normalized)) return true;
  return AGENCY_TEXT_PATTERN.test(description.toLowerCase());
}

/** Drop weak aggregator rows and agency/consultancy aggregator rows. */
export function shouldDropAggregator(job: {
  source: string;
  company: string;
  description?: string | null;
  verdict?: string | null;
}): boolean {
  if (!job.source.startsWith('aggregator-')) return false;
  if (job.verdict === 'weak') return true;
  return isAgencyCompany(job.company, job.description ?? '');
}
