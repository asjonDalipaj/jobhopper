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
}

export const DEFAULT_APPLICANT: Applicant = {
  country: 'Netherlands',
  phoneNational: '',
  preferredLocation: 'Amsterdam',
  howDidYouHear: 'LinkedIn',
  consentRetention: false,
  questions: [],
};

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
