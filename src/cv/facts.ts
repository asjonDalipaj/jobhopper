/**
 * The fabrication gate.
 *
 * An LLM may reorder and re-word a CV, but it must not add an employer, a date,
 * a percentage or a skill that the structured document does not contain. This
 * module compares the rendered PDF text back against the source document and
 * reports what leaked in. Callers must treat errors as fatal.
 */

import type { CvDocument } from './schema.js';
import { normalizeLine } from './schema.js';

export interface FactCheck {
  ok: boolean;
  errors: string[];
  warnings: string[];
}

const YEAR = /\b(?:19|20)\d{2}\b/g;
const PERCENT = /\b(\d{1,2}(?:\.\d+)?)\s?%/g;
const EM_OR_EN_DASH = /[—–]/;

function yearsIn(text: string): string[] {
  return [...new Set(text.match(YEAR) ?? [])];
}

function percentsIn(text: string): string[] {
  return [...new Set((text.match(PERCENT) ?? []).map((m) => m.replace(/\s/g, '')))];
}

/** Every fact the document authorises, as plain strings to search for. */
export function authorisedYears(doc: CvDocument): Set<string> {
  const blob = JSON.stringify(doc);
  return new Set(yearsIn(blob));
}

export function authorisedPercents(doc: CvDocument): Set<string> {
  return new Set(percentsIn(JSON.stringify(doc)));
}

/**
 * Compare rendered CV text against the document it came from.
 * Errors mean the output claims something the profile does not support.
 */
export function checkFacts(
  rendered: string,
  doc: CvDocument,
  options: { requireEmployers?: boolean } = {},
): FactCheck {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (EM_OR_EN_DASH.test(rendered)) {
    errors.push('rendered CV contains an em dash or en dash; the house style forbids both');
  }

  const allowedYears = authorisedYears(doc);
  const strayYears = yearsIn(rendered).filter((y) => !allowedYears.has(y));
  if (strayYears.length) errors.push(`years not present in cv.json: ${strayYears.join(', ')}`);

  const allowedPercents = authorisedPercents(doc);
  const strayPercents = percentsIn(rendered).filter((p) => !allowedPercents.has(p));
  if (strayPercents.length) errors.push(`figures not present in cv.json: ${strayPercents.join(', ')}`);

  const haystack = normalizeLine(rendered);
  if (!haystack.includes(normalizeLine(doc.name))) errors.push('candidate name is missing from the rendered CV');

  // A cover letter never lists every employer, so those warnings are CV-only.
  if (options.requireEmployers !== false) {
    for (const job of doc.experience) {
      if (!haystack.includes(normalizeLine(job.org))) warnings.push(`employer dropped: ${job.org}`);
    }
    for (const project of doc.projects) {
      if (!haystack.includes(normalizeLine(project.name))) warnings.push(`project dropped: ${project.name}`);
    }
  }

  return { ok: errors.length === 0, errors, warnings };
}
