/**
 * Structured CV model. One source of truth for every tailored variant.
 * Everything the renderer and the tailoring model may use lives here; nothing
 * outside this document can appear in a generated PDF (see facts.ts).
 */

export interface CvContact {
  email: string;
  phone: string;
  linkedin?: string;
  github?: string;
}

export interface CvSkillRow {
  label: string;
  items: string[];
}

export interface CvExperience {
  /** Job title. */
  role: string;
  /** Employer, as it will be verified against. */
  org: string;
  /** Optional italic qualifier, e.g. "consultant via Finomnia". */
  note?: string;
  place: string;
  /** MM/YYYY */
  start: string;
  /** MM/YYYY or "Present". */
  end: string;
  /** A pool: tailoring selects and orders a subset, it never adds. */
  bullets: string[];
}

export interface CvProject {
  name: string;
  meta?: string;
  bullets: string[];
}

export interface CvEducation {
  title: string;
  school: string;
  years: string;
}

export interface CvDocument {
  name: string;
  headline: string;
  location: string;
  contact: CvContact;
  summary: string;
  skills: CvSkillRow[];
  experience: CvExperience[];
  projects: CvProject[];
  education: CvEducation[];
  languages: string;
  beyond?: string;
}

/** Parsed document plus the non-fatal problems found in it. */
export interface ParsedCv {
  doc: CvDocument;
  errors: string[];
}

const isString = (v: unknown): v is string => typeof v === 'string';

/** Structural validation. Returns human-readable problems, empty when valid. */
export function validateCv(value: unknown): string[] {
  const errors: string[] = [];
  if (!value || typeof value !== 'object') return ['cv.json must be an object'];
  const cv = value as Partial<CvDocument>;

  if (!isString(cv.name) || !cv.name.trim()) errors.push('name is required');
  if (!isString(cv.headline) || !cv.headline.trim()) errors.push('headline is required');
  if (!isString(cv.summary) || !cv.summary.trim()) errors.push('summary is required');
  if (!cv.contact || !isString(cv.contact.email)) errors.push('contact.email is required');

  if (!Array.isArray(cv.experience) || cv.experience.length === 0) {
    errors.push('experience must be a non-empty array');
  } else {
    cv.experience.forEach((job, i) => {
      const at = `experience[${i}]`;
      if (!isString(job?.role) || !job.role.trim()) errors.push(`${at}.role is required`);
      if (!isString(job?.org) || !job.org.trim()) errors.push(`${at}.org is required`);
      if (!isString(job?.start) || !job.start.trim()) errors.push(`${at}.start is required`);
      if (!isString(job?.end) || !job.end.trim()) errors.push(`${at}.end is required`);
      if (!Array.isArray(job?.bullets) || job.bullets.length === 0) errors.push(`${at}.bullets must be non-empty`);
    });
  }

  if (!Array.isArray(cv.skills) || cv.skills.length === 0) errors.push('skills must be a non-empty array');
  if (!Array.isArray(cv.projects)) errors.push('projects must be an array');
  if (!Array.isArray(cv.education)) errors.push('education must be an array');
  if (!isString(cv.languages) || !cv.languages.trim()) errors.push('languages is required');

  return errors;
}

export function parseCv(raw: string): ParsedCv {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch (err) {
    return { doc: {} as CvDocument, errors: [`cv.json is not valid JSON: ${(err as Error).message}`] };
  }
  const errors = validateCv(value);
  return { doc: value as CvDocument, errors };
}

/** Same-length comparison used by the fact gate and bullet matching. */
export function normalizeLine(s: string): string {
  return s.toLowerCase().replace(/\s+/g, ' ').replace(/[“”]/g, '"').replace(/[‘’]/g, "'").trim();
}

export function datesOf(job: CvExperience): string {
  return `${job.start} - ${job.end}`;
}
