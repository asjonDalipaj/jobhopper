/**
 * Cover letter generation. Same discipline as the CV: the model may phrase,
 * but every claim has to survive the fact gate in facts.ts.
 */

import { chatJson } from '../judge/client.js';
import { stripHtml } from '../sources/html.js';
import type { CvDocument } from './schema.js';
import type { TailorPlan } from './render.js';
import type { TailorJob } from './tailor.js';

const MAX_JD_CHARS = 8000;
const MIN_WORDS = 140;
const MAX_WORDS = 300;

export interface LetterResult {
  salutation: string;
  paragraphs: string[];
  signoff: string;
  model: string;
  fixes: string[];
  errors: string[];
}

export function buildLetterPrompt(job: TailorJob, doc: CvDocument, plan: TailorPlan): string {
  const summary = plan.summary || doc.summary;
  const posting = [
    `Company: ${job.company}`,
    `Title: ${job.title}`,
    job.location ? `Location: ${job.location}` : null,
    job.url ? `Link: ${job.url}` : null,
  ]
    .filter(Boolean)
    .join('\n');

  return [
    '=== CANDIDATE CV (facts you may use) ===',
    JSON.stringify(
      {
        name: doc.name,
        location: doc.location,
        experience: doc.experience.map((j) => ({ role: j.role, org: j.org, period: `${j.start} to ${j.end}`, bullets: j.bullets })),
        skills: doc.skills,
        projects: doc.projects.map((p) => ({ name: p.name, meta: p.meta })),
      },
      null,
      1,
    ),
    '=== ANGLE ALREADY CHOSEN FOR THIS APPLICATION ===',
    summary,
    '=== JOB POSTING ===',
    posting,
    '',
    stripHtml(job.description ?? '').slice(0, MAX_JD_CHARS),
    '=== TASK ===',
    `Write the cover letter for this application. JSON only.`,
  ].join('\n\n');
}

const SYSTEM_PROMPT = `You write one cover letter for one job posting, for a candidate whose CV is provided.

Return ONLY a JSON object:
{
  "salutation": "Dear <company> hiring team,",
  "paragraphs": ["four or five short paragraphs"],
  "signoff": "Kind regards,"
}

Rules:
- 140 to 300 words total across the paragraphs. Short sentences. Plain professional English.
- Open with why this specific role, not with "I am writing to apply".
- Use at most two concrete things from the CV that match the posting. No inventory of skills.
- If the posting clearly asks for something the CV lacks, you may give one sentence naming it plainly as something to learn. At most one. Do not apologise or dwell.
- Never invent an employer, project, date, number, technology or achievement.
- Do not invent duration or familiarity ("over the last year", "I have followed X for years"). If the CV does not say how long, do not imply it.
- Copy technology and product names exactly as the posting spells them.
- Never write "sits at the intersection", "at the intersection of", "converged", or any sentence that describes where a role "sits". State what you did and what you would do.
- No em dashes or en dashes. Use commas, periods, colons or parentheses.
- Banned: passionate, leverage, spearheaded, robust, seamless, showcase, dynamic, landscape, "I am excited", "aligns with my", "proven track record".
- Do not restate the CV. Do not mention "this letter".`;

const CLICHES: Array<[RegExp, string]> = [
  [/at the intersection/i, 'marketing construction'],
  [/\bconverged\b/i, 'marketing construction'],
  [/\bpassionate\b/i, 'banned word'],
  [/\bleverage\b/i, 'banned word'],
  [/\bseamless(ly)?\b/i, 'banned word'],
  [/\brobust\b/i, 'banned word'],
  [/\bshowcase\b/i, 'banned word'],
  [/\bdynamic\b/i, 'banned word'],
  [/proven track record/i, 'cliche'],
  [/aligns with/i, 'cliche'],
  [/\bexcited\b/i, 'cliche'],
];

/** Cheap style pass the fact gate cannot do. Warnings only. */
export function lintLetter(text: string): string[] {
  return CLICHES.filter(([pattern]) => pattern.test(text)).map(([, reason]) => reason);
}

function repairDashes(value: string): { text: string; fixed: boolean } {
  if (!/[—–]/.test(value)) return { text: value, fixed: false };
  const text = value
    .replace(/\s*[—–]\s*([^—–]+?)\s*[—–]\s*/g, ' ($1) ')
    .replace(/\s*[—–]\s*/g, ', ')
    .replace(/\s{2,}/g, ' ');
  return { text, fixed: true };
}

/** Structural and style checks the model cannot talk its way out of. */
export function validateLetter(raw: unknown, job: TailorJob): { letter: Omit<LetterResult, 'model' | 'fixes' | 'errors'>; errors: string[]; fixes: string[] } {
  const input = (raw ?? {}) as Record<string, unknown>;
  const errors: string[] = [];
  const fixes: string[] = [];

  const paragraphs = Array.isArray(input.paragraphs) ? input.paragraphs.map(String).filter((p) => p.trim()) : [];
  if (paragraphs.length < 3) errors.push(`letter needs at least 3 paragraphs, got ${paragraphs.length}`);

  const cleaned = paragraphs.map((p) => {
    const { text, fixed } = repairDashes(p);
    if (fixed) fixes.push('paragraph: replaced em/en dashes');
    return text.trim();
  });

  const salutation = String(input.salutation ?? `Dear ${job.company} hiring team,`).trim();
  const signoff = String(input.signoff ?? 'Kind regards,').trim();

  const words = cleaned.join(' ').split(/\s+/).filter(Boolean).length;
  if (words < MIN_WORDS) errors.push(`letter is too short (${words} words, minimum ${MIN_WORDS})`);
  if (words > MAX_WORDS) errors.push(`letter is too long (${words} words, maximum ${MAX_WORDS})`);

  return { letter: { salutation, paragraphs: cleaned, signoff }, errors, fixes };
}

function parseJsonObject(raw: string): unknown {
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error(`could not parse letter JSON: ${cleaned.slice(0, 200)}`);
  return JSON.parse(cleaned.slice(start, end + 1));
}

export async function writeCoverLetter(
  job: TailorJob,
  doc: CvDocument,
  plan: TailorPlan,
  options: { model?: string } = {},
): Promise<LetterResult> {
  const { content, model } = await chatJson({
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: buildLetterPrompt(job, doc, plan) },
    ],
    temperature: 0.3,
    model: options.model,
  });
  const { letter, errors, fixes } = validateLetter(parseJsonObject(content), job);

  return { ...letter, model, fixes, errors };
}
