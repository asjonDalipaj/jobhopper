/**
 * Profile consistency checks. Tailoring reads cv.json, the judge reads cv.txt
 * plus preferences/constraints, and auto-fill reads applicant.json; those four
 * can silently drift after manual edits.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseCv, type CvDocument } from '../cv/schema.js';
import { readCvText, readProfileDoc } from './cv.js';
import { getPaths } from '../storage/paths.js';
import { applicantPath, loadApplicant, type Applicant } from '../apply/applicant.js';

export type FindingLevel = 'ok' | 'warn' | 'error';

export interface Finding {
  level: FindingLevel;
  code: string;
  message: string;
  detail?: string;
}

export interface ProfileSnapshot {
  cvDoc: CvDocument | null;
  cvErrors: string[];
  cvText: string | null;
  preferences: string;
  constraints: string;
  background: string;
  applicant: Applicant;
  applicantPresent: boolean;
  applicantErrors: string[];
}

const PLACES: Array<{ label: string; pattern: RegExp }> = [
  { label: 'Netherlands', pattern: /\b(netherlands|nederland|holland|amsterdam|utrecht|rotterdam|the hague|eindhoven)\b/i },
  { label: 'Italy', pattern: /\b(italy|italia|milan|milano|rome|roma|turin|torino)\b/i },
  { label: 'Spain', pattern: /\b(spain|españa|espana|madrid|barcelona|valencia)\b/i },
  { label: 'Germany', pattern: /\b(germany|deutschland|berlin|munich|münchen)\b/i },
  { label: 'UK', pattern: /\b(uk|united kingdom|london)\b/i },
  { label: 'Remote EU', pattern: /\bremote\b/i },
];

function placesIn(text: string): Set<string> {
  return new Set(PLACES.filter((place) => place.pattern.test(text)).map((place) => place.label));
}

function locationLine(cvText: string): string {
  const lines = cvText.split(/\r?\n/).slice(0, 15);
  return (
    lines.find((line) => /open to|based in|relocat/i.test(line)) ??
    lines.find((line) => /utrecht|amsterdam|netherlands/i.test(line)) ??
    ''
  );
}

const squash = (value: string) => value.toLowerCase().replace(/https?:\/\//g, '').replace(/\s+/g, '');
const digits = (value: string) => value.replace(/\D/g, '');

function compareSets(left: Set<string>, right: Set<string>): { onlyLeft: string[]; onlyRight: string[] } {
  return {
    onlyLeft: [...left].filter((item) => !right.has(item)),
    onlyRight: [...right].filter((item) => !left.has(item)),
  };
}

/** Pure analysis; caller supplies parsed/read inputs so tests don't touch disk. */
export function analyzeProfile(input: ProfileSnapshot): Finding[] {
  const findings: Finding[] = [];
  const add = (level: FindingLevel, code: string, message: string, detail?: string) =>
    findings.push({ level, code, message, detail });

  if (input.cvErrors.length) {
    add('error', 'cv-invalid', 'cv.json is missing or invalid', input.cvErrors.join('; '));
  } else if (input.cvDoc) {
    add('ok', 'cv-valid', `cv.json parses (${input.cvDoc.experience.length} roles)`);
  }

  if (!input.cvText) {
    add('error', 'cvtext-missing', 'cv.txt is missing; the judge has no CV text');
  } else {
    add('ok', 'cvtext-present', `cv.txt present (${input.cvText.length} chars)`);
    if (!input.cvDoc) return findings;

    const text = input.cvText;
    const missing: string[] = [];
    if (!squash(text).includes(squash(input.cvDoc.name))) missing.push('name');
    if (!squash(text).includes(squash(input.cvDoc.headline))) missing.push('headline');
    if (!squash(text).includes(squash(input.cvDoc.contact.email))) missing.push('email');
    if (!digits(text).includes(digits(input.cvDoc.contact.phone))) missing.push('phone');
    if (input.cvDoc.contact.linkedin && !squash(text).includes(squash(input.cvDoc.contact.linkedin))) missing.push('LinkedIn');
    if (input.cvDoc.contact.github && !squash(text).includes(squash(input.cvDoc.contact.github))) missing.push('GitHub');
    if (missing.length) {
      add('warn', 'contact-drift', 'cv.txt is missing data from cv.json', `missing: ${missing.join(', ')}; re-import or update cv.txt`);
    } else {
      add('ok', 'contact-match', 'name, headline and contact details match cv.txt');
    }

    const line = locationLine(text);
    const cvPlaces = placesIn(input.cvDoc.location);
    const textPlaces = placesIn(line);
    const preferencePlaces = placesIn(input.preferences);

    if (!line) {
      add('warn', 'location-missing', 'could not find a location line in cv.txt');
    } else {
      const drift = compareSets(cvPlaces, textPlaces);
      if (drift.onlyLeft.length || drift.onlyRight.length) {
        add(
          'warn',
          'location-drift',
          'cv.json and cv.txt disagree on location/openness',
          `cv.json only: ${drift.onlyLeft.join(', ') || 'none'}; cv.txt only: ${drift.onlyRight.join(', ') || 'none'}`,
        );
      } else {
        add('ok', 'location-match', 'cv.json and cv.txt location/openness agree');
      }

      const prefDrift = compareSets(cvPlaces, preferencePlaces);
      if (prefDrift.onlyLeft.length || prefDrift.onlyRight.length) {
        add(
          'warn',
          'preferences-drift',
          'cv.json and preferences.md disagree on location/openness',
          `cv.json only: ${prefDrift.onlyLeft.join(', ') || 'none'}; preferences only: ${prefDrift.onlyRight.join(', ') || 'none'}`,
        );
      } else {
        add('ok', 'preferences-match', 'cv.json and preferences.md location/openness agree');
      }
    }
  }

  for (const [name, text] of [
    ['preferences.md', input.preferences],
    ['constraints.md', input.constraints],
    ['background.md', input.background],
  ] as const) {
    if (!text.trim()) add('warn', 'doc-missing', `${name} is empty`);
  }

  if (!input.applicantPresent) {
    add('warn', 'applicant-missing', 'applicant.json is missing; auto-fill will use defaults');
  }
  if (input.applicantErrors.length) {
    add('error', 'applicant-invalid', 'applicant.json is invalid', input.applicantErrors.join('; '));
  }
  if (input.cvDoc) {
    const cvPlaces = placesIn(input.cvDoc.location);
    const applicantPlaces = placesIn(`${input.applicant.preferredLocation}, ${input.applicant.country}`);
    if (applicantPlaces.size && cvPlaces.size && ![...applicantPlaces].some((place) => cvPlaces.has(place))) {
      add(
        'warn',
        'applicant-location',
        'applicant.json preferred location is not in cv.json location/openness',
        `preferred: ${input.applicant.preferredLocation}, ${input.applicant.country}`,
      );
    }
    const missingSalary = ['NL', 'ES', 'IT'].filter((market) => !input.applicant.salaryByCountry?.[market]);
    if (input.applicant.salaryByCountry && missingSalary.length) {
      add('warn', 'salary-market', 'salary expectations are missing for target markets', `missing: ${missingSalary.join(', ')}`);
    }
  }
  if (input.applicant.consentRetention) {
    add('warn', 'consent', 'auto-fill will tick the retention/marketing consent checkbox');
  }

  return findings;
}

/** Read the local profile and run every consistency check. */
export function inspectProfile(): Finding[] {
  const dir = getPaths().profileDir;
  const cvFile = join(dir, 'cv.json');
  let cvDoc: CvDocument | null = null;
  let cvErrors: string[] = [];
  if (!existsSync(cvFile)) {
    cvErrors = [`${cvFile} is missing`];
  } else {
    const parsed = parseCv(readFileSync(cvFile, 'utf8'));
    cvDoc = parsed.doc;
    cvErrors = parsed.errors;
  }

  const { applicant, errors: applicantErrors } = loadApplicant();
  return analyzeProfile({
    cvDoc,
    cvErrors,
    cvText: existsSync(join(dir, 'cv.txt')) ? readCvText() : null,
    preferences: readProfileDoc('preferences'),
    constraints: readProfileDoc('constraints'),
    background: readProfileDoc('background'),
    applicant,
    applicantPresent: existsSync(applicantPath()),
    applicantErrors,
  });
}
