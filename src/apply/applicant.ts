/**
 * Answers that are the same for every application. Kept out of cv.json so the
 * CV stays a CV, and out of the code so they are editable without a rebuild.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getPaths } from '../storage/paths.js';

export interface Applicant {
  /** Country selected in the phone widget. */
  country: string;
  /** National part of the phone number, no dial code. */
  phoneNational: string;
  /** Checkbox label to tick in "preferred location" groups. */
  preferredLocation: string;
  /** Free-text "Location (City)" answer; falls back to preferredLocation. */
  city?: string;
  /** Answer text for "how did you hear about this role". Matched against the options. */
  howDidYouHear: string;
  /** Tick the retention/privacy consent box when a form has one. */
  consentRetention: boolean;
  /**
   * Fixed answers for board-specific questions, matched on the label text.
   * Order matters: the first match wins. "No" is the answer for questions we
   * currently decline (US office days, US sponsorship).
   */
  questions: Array<{ match: string; answer: string }>;
  /**
   * Salary expectation per market, keyed NL/ES/IT with a `default` for the rest
   * of the EU. The same question gets a different answer per posting location.
   */
  salaryByCountry?: Record<string, string>;
}

export const DEFAULT_APPLICANT: Applicant = {
  country: 'Netherlands',
  phoneNational: '',
  preferredLocation: 'Amsterdam',
  howDidYouHear: 'LinkedIn',
  consentRetention: false,
  questions: [],
};

/** Market for a posting, from the free-text location the board gave us. */
export function salaryMarket(location: string | null | undefined): 'NL' | 'ES' | 'IT' | 'default' {
  const value = (location ?? '').toLowerCase();
  if (/netherlands|amsterdam|utrecht|rotterdam|the hague|eindhoven|delft|hague/.test(value)) return 'NL';
  if (/spain|madrid|barcelona|valencia|m[aá]laga|seville|bilbao/.test(value)) return 'ES';
  if (/italy|milan|milano|rome|roma|turin|torino|bologna|florence/.test(value)) return 'IT';
  return 'default';
}

/**
 * Per-posting questions: the fixed profile answers plus the ones that depend on
 * where the job is (currently based, salary expectation).
 */
export function questionsFor(
  applicant: Applicant,
  location: string | null | undefined,
): Array<{ match: string; answer: string }> {
  const questions = [...(applicant.questions ?? [])];
  const has = (pattern: RegExp) => questions.some((q) => pattern.test(q.match));

  if (!has(/currently based/i)) {
    questions.push({
      match: 'where are you currently based',
      answer: `${applicant.city ?? applicant.preferredLocation}, ${applicant.country}`,
    });
  }
  const salary = applicant.salaryByCountry?.[salaryMarket(location)] ?? applicant.salaryByCountry?.['default'];
  if (salary && !has(/salary/i)) {
    questions.push({ match: 'salary expectations', answer: salary });
  }
  return questions;
}

export function applicantPath(): string {
  return join(getPaths().profileDir, 'applicant.json');
}

/** Load profile/applicant.json, falling back to defaults for anything missing. */
export function loadApplicant(): { applicant: Applicant; errors: string[] } {
  const file = applicantPath();
  if (!existsSync(file)) return { applicant: { ...DEFAULT_APPLICANT }, errors: [] };
  try {
    const raw = JSON.parse(readFileSync(file, 'utf8')) as Partial<Applicant>;
    return { applicant: { ...DEFAULT_APPLICANT, ...raw }, errors: [] };
  } catch (err) {
    return { applicant: { ...DEFAULT_APPLICANT }, errors: [`${file} is not valid JSON: ${(err as Error).message}`] };
  }
}

/**
 * Split a display name into the two fields forms ask for. Everything before the
 * last token is the first name, which handles "Asjon Kola Dalipaj" correctly.
 */
export function splitName(fullName: string): { first: string; last: string } {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return { first: parts[0] ?? '', last: '' };
  return { first: parts.slice(0, -1).join(' '), last: parts[parts.length - 1] as string };
}
