/**
 * Which applicant tracking system is behind a job URL. Detection is on the
 * hostname, with the scan source as a fallback for boards that link out.
 */

export type Ats =
  | 'greenhouse'
  | 'lever'
  | 'ashby'
  | 'workable'
  | 'teamtailor'
  | 'recruitee'
  | 'smartrecruiters';

const HOST_RULES: Array<[Ats, RegExp]> = [
  ['greenhouse', /(^|\.)greenhouse\.io$/i],
  ['lever', /(^|\.)lever\.co$/i],
  ['ashby', /(^|\.)ashbyhq\.com$/i],
  ['workable', /(^|\.)workable\.com$/i],
  ['teamtailor', /(^|\.)teamtailor\.com$/i],
  ['recruitee', /(^|\.)recruitee\.com$/i],
  ['smartrecruiters', /(^|\.)smartrecruiters\.com$/i],
];

/** Adapters that can fill and submit today. Detection knows more than this on purpose. */
export const SUPPORTED: Ats[] = ['greenhouse'];

export function detectAts(url: string | null | undefined): Ats | null {
  if (!url) return null;
  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    return null;
  }
  for (const [ats, pattern] of HOST_RULES) {
    if (pattern.test(host)) return ats;
  }
  return null;
}

/** URL first, then the source recorded at scan time. */
export function resolveAts(url: string | null | undefined, source: string | null | undefined): Ats | null {
  const fromUrl = detectAts(url);
  if (fromUrl) return fromUrl;
  const fromSource = String(source ?? '').toLowerCase();
  return HOST_RULES.some(([ats]) => ats === fromSource) ? (fromSource as Ats) : null;
}
