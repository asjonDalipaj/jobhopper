/**
 * Tailoring: ask the model to *select and re-order* facts from cv.json for a
 * specific posting, then hold it to that. Anything it names that the document
 * does not contain is rejected here, before rendering.
 */

import { hasApiKey, loadConfig, resolveApiKey } from '../config/config.js';
import { stripHtml } from '../sources/html.js';
import type { CvDocument } from './schema.js';
import { normalizeLine } from './schema.js';
import type { TailorPlan } from './render.js';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const MAX_JD_CHARS = 9000;

export interface TailorJob {
  company: string;
  title: string;
  location?: string | null;
  description?: string | null;
  url?: string | null;
}

export interface TailorResult {
  plan: TailorPlan;
  rationale: string;
  keywords: string[];
  model: string;
  warnings: string[];
  fixes: string[];
}

const SYSTEM_PROMPT = `You tailor an existing CV to one job posting. You are an editor, not a writer: you may select, re-order and lightly re-word material that already exists.

Return ONLY a JSON object with these keys:
{
  "headline": "a one-line role headline, max 90 characters",
  "summary": "an opening paragraph, max 55 words, plain first-person professional prose",
  "skillOrder": ["skill row labels, most relevant first"],
  "experienceOrder": ["employer names, most relevant first"],
  "bulletOrder": { "Employer name": ["at most 5 bullets for the current role, 3 for older roles, best match first"] },
  "projectNames": ["project names to keep, most relevant first"],
  "keywords": ["the posting's own words that the candidate genuinely matches"],
  "rationale": "one sentence on the angle you chose"
}

Hard rules:
- Every employer, date, technology, number and achievement you use MUST already exist in the CV JSON. Do not invent, infer seniority, or upgrade a claim.
- For bulletOrder, copy each bullet string verbatim from the CV JSON. Do not paraphrase bullets.
- Select, do not dump: return at most 5 bullets for the most recent employer, at most 3 for each older one. Drop bullets that do not speak to this posting.
- headline and summary may be re-worded, but only from facts in the CV. If the posting asks for something the CV lacks, leave it out rather than implying it.
- Never use em dashes or en dashes. Use commas, periods, colons or parentheses.
- Plain verbs. No "leverage", "spearheaded", "passionate", "robust", "seamless", "showcase".
- Reply with only the JSON object. No markdown fences, no commentary.`;

export function buildTailorPrompt(job: TailorJob, doc: CvDocument): string {
  const cv = {
    name: doc.name,
    location: doc.location,
    skills: doc.skills,
    experience: doc.experience.map((j) => ({
      role: j.role,
      org: j.org,
      note: j.note,
      place: j.place,
      period: `${j.start} to ${j.end}`,
      bullets: j.bullets,
    })),
    projects: doc.projects.map((p) => ({ name: p.name, meta: p.meta, bullets: p.bullets })),
    education: doc.education,
    languages: doc.languages,
  };

  const description = stripHtml(job.description ?? '').slice(0, MAX_JD_CHARS);
  const posting = [
    `Company: ${job.company}`,
    `Title: ${job.title}`,
    job.location ? `Location: ${job.location}` : null,
    job.url ? `Link: ${job.url}` : null,
  ]
    .filter(Boolean)
    .join('\n');

  return [
    '=== CV JSON (the only source of truth) ===',
    JSON.stringify(cv, null, 1),
    '=== JOB POSTING ===',
    posting,
    '',
    description,
    '=== TASK ===',
    'Tailor THIS CV for THIS posting. Respond with the JSON object only.',
  ].join('\n\n');
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String).filter((s) => s.trim()) : [];
}

/**
 * Reject references the document cannot back. Returns the cleaned plan plus
 * every discarded reference so the caller can warn loudly.
 */
export function validatePlan(raw: unknown, doc: CvDocument): { plan: TailorPlan; errors: string[]; fixes: string[] } {
  const errors: string[] = [];
  const input = (raw ?? {}) as Record<string, unknown>;

  const labels = new Set(doc.skills.map((s) => normalizeLine(s.label)));
  const orgs = new Set(doc.experience.map((j) => normalizeLine(j.org)));
  const projectNames = new Set(doc.projects.map((p) => normalizeLine(p.name)));

  const skillOrder = asStringArray(input.skillOrder).filter((label) => {
    const ok = labels.has(normalizeLine(label));
    if (!ok) errors.push(`skill row not in cv.json: ${label}`);
    return ok;
  });

  const experienceOrder = asStringArray(input.experienceOrder).filter((org) => {
    const ok = orgs.has(normalizeLine(org));
    if (!ok) errors.push(`employer not in cv.json: ${org}`);
    return ok;
  });

  const bulletOrder: Record<string, string[]> = {};
  const rawBullets = input.bulletOrder;
  if (rawBullets && typeof rawBullets === 'object') {
    for (const [orgKey, bullets] of Object.entries(rawBullets as Record<string, unknown>)) {
      const job = doc.experience.find((j) => normalizeLine(j.org) === normalizeLine(orgKey));
      if (!job) {
        errors.push(`bulletOrder references unknown employer: ${orgKey}`);
        continue;
      }
      const pool = new Map(job.bullets.map((b) => [normalizeLine(b), b]));
      const picked: string[] = [];
      for (const wanted of asStringArray(bullets)) {
        const canonical = pool.get(normalizeLine(wanted));
        if (canonical) picked.push(canonical);
        else errors.push(`bullet not in cv.json for ${job.org}: ${wanted.slice(0, 80)}`);
      }
      if (picked.length) bulletOrder[job.org] = picked;
    }
  }

  const keptProjects = asStringArray(input.projectNames).filter((name) => {
    const ok = projectNames.has(normalizeLine(name));
    if (!ok) errors.push(`project not in cv.json: ${name}`);
    return ok;
  });

  const fixes: string[] = [];
  const repairDashes = (value: string, field: string): string => {
    if (!/[—–]/.test(value)) return value;
    fixes.push(`${field}: replaced em/en dashes`);
    // A pair of dashes reads best as a parenthesis; a lone dash as a comma.
    return value
      .replace(/\s*[—–]\s*([^—–]+?)\s*[—–]\s*/g, ' ($1) ')
      .replace(/\s*[—–]\s*/g, ', ')
      .replace(/\s{2,}/g, ' ');
  };
  const headline = repairDashes(String(input.headline ?? '').trim().slice(0, 120), 'headline');
  const summary = repairDashes(String(input.summary ?? '').trim(), 'summary');

  // Cap the selection: 5 for the most recent role, 3 for older ones.
  const order = experienceOrder.length ? experienceOrder : doc.experience.map((j) => j.org);
  for (const [org, bullets] of Object.entries(bulletOrder)) {
    const position = order.findIndex((name) => normalizeLine(name) === normalizeLine(org));
    const cap = position <= 0 ? 5 : 3;
    if (bullets.length > cap) {
      bulletOrder[org] = bullets.slice(0, cap);
      fixes.push(`bulletOrder for ${org}: kept the first ${cap} of ${bullets.length}`);
    }
  }

  return {
    plan: {
      headline: headline || undefined,
      summary: summary || undefined,
      skillOrder,
      experienceOrder,
      bulletOrder,
      projectNames: keptProjects,
      keywords: asStringArray(input.keywords),
    },
    errors,
    fixes,
  };
}

function parseJsonObject(raw: string): unknown {
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error(`could not parse tailoring JSON: ${cleaned.slice(0, 200)}`);
  return JSON.parse(cleaned.slice(start, end + 1));
}

export async function tailorCv(job: TailorJob, doc: CvDocument, options: { model?: string } = {}): Promise<TailorResult> {
  const config = loadConfig();
  if (!hasApiKey(config)) {
    throw new Error('No OpenRouter API key configured. Run `jobhopper config set-openrouter-key`.');
  }
  const model = options.model ?? config.model;
  const key = resolveApiKey(config);

  const res = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
      'HTTP-Referer': 'https://github.com/asjonDalipaj/jobhopper',
      'X-Title': 'jobhopper',
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: buildTailorPrompt(job, doc) },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.2,
    }),
  });

  if (!res.ok) {
    throw new Error(`OpenRouter returned HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    model?: string;
  };
  const content = data.choices?.[0]?.message?.content ?? '';
  const parsed = parseJsonObject(content) as Record<string, unknown>;
  const { plan, errors, fixes } = validatePlan(parsed, doc);

  return {
    plan,
    rationale: String(parsed.rationale ?? '').trim(),
    keywords: plan.keywords ?? [],
    model: data.model ?? model,
    warnings: errors,
    fixes,
  };
}
