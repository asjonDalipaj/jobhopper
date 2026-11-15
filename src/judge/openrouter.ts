import type { Verdict } from '../db/types.js';
import { chatJson } from './client.js';
import { gatherProfile } from '../profile/cv.js';
import type { JobMetadata } from '../db/jobs-repo.js';

export interface JudgeResult {
  verdict: Verdict;
  reasoning: string;
  matches: string[];
  gaps: string[];
  model: string;
  raw: string;
}

export interface JudgeTarget {
  company: string;
  title: string;
  location: string;
  workplaceType?: string | null;
  employmentType?: string | null;
  description: string;
  url?: string | null;
}

const EXTRACTION_PROMPT = `Extract structured fields from this job posting. Return only JSON:
{"category":"Software Development|Engineering|Information Technology|Data and Analytics|Music|Other","locations":["city, country"],"workplace_type":"Remote|Onsite|Hybrid|null","skills":["tool or skill"],"experience_min_years":null,"salary":{"min":null,"max":null,"currency":null,"frequency":"Yearly|Monthly|Bi-Weekly|Weekly|Daily|Hourly|null"},"language":"en","employer_type":"Internal|External|null"}

Rules:
- The job description is the source of truth. Use null (or [] for skills) when the posting does not state something. Never invent a number.
- skills: normalized tools, technologies and methods the posting explicitly asks for (1-4 words each, e.g. "Kubernetes", "React", "PostgreSQL"); at most 20.
- experience_min_years: the minimum years the posting explicitly requires; null if it only says "senior" or gives no number.
- salary: numbers exactly as stated, with thousands expanded ("EUR 60-70k" -> min 60000, max 70000, currency "EUR", frequency "Yearly"). Never estimate.
- language: ISO 639-1 code of the text the posting is written in.
- employer_type is required: pick "Internal" unless the posting is clearly from a recruiter/staffing agency ("our client", "for our customer", "on behalf of"), in which case pick "External".
- category: Music for music/audio industry or production roles; a technical category for software/engineering/IT/data; Other otherwise.`;

/** Categories and pay periods the extractor is allowed to return. */
const CATEGORIES = ['Software Development', 'Engineering', 'Information Technology', 'Data and Analytics', 'Music', 'Other'];
const FREQUENCIES = ['Yearly', 'Monthly', 'Bi-Weekly', 'Weekly', 'Daily', 'Hourly'];

/** A non-negative integer, accepting numeric strings the model sometimes emits. */
function wholeNumber(value: unknown, max = 10_000_000): number | null {
  let n: number;
  if (typeof value === 'number') n = value;
  // A string without any digit ("lots", "") is not a number — stripping the
  // non-digits would turn it into 0 and silently invent a value.
  else if (typeof value === 'string' && /\d/.test(value)) n = Number(value.replace(/[^0-9.-]/g, ''));
  else return null;
  if (!Number.isFinite(n) || n < 0 || n > max) return null;
  return Math.round(n);
}

/** Trimmed, non-empty strings, deduped case-insensitively, capped. */
function stringList(value: unknown, cap: number): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of value) {
    if (typeof item !== 'string') continue;
    const trimmed = item.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
    if (out.length >= cap) break;
  }
  return out;
}

/**
 * Validate a raw extraction response into JobMetadata. Pure, so the enum
 * clamping and the "never invent a number" rules are unit-tested without a
 * model call.
 */
export function parseJobMetadata(raw: unknown, model: string): JobMetadata {
  const input = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const workplace = input.workplace_type;
  const salaryInput = (input.salary && typeof input.salary === 'object' ? input.salary : null) as Record<string, unknown> | null;

  let salary: JobMetadata['salary'] = null;
  if (salaryInput) {
    let min = wholeNumber(salaryInput.min);
    let max = wholeNumber(salaryInput.max);
    if (min !== null && max !== null && min > max) [min, max] = [max, min];
    if (min !== null || max !== null) {
      const currency = typeof salaryInput.currency === 'string' && /^[A-Za-z]{3}$/.test(salaryInput.currency.trim())
        ? salaryInput.currency.trim().toUpperCase()
        : null;
      const frequency = typeof salaryInput.frequency === 'string' && FREQUENCIES.includes(salaryInput.frequency)
        ? salaryInput.frequency
        : null;
      salary = { min, max, currency, frequency };
    }
  }

  const years = wholeNumber(input.experience_min_years, 40);
  const language = typeof input.language === 'string' && /^[a-z]{2}$/i.test(input.language.trim())
    ? input.language.trim().toLowerCase()
    : null;

  return {
    category: typeof input.category === 'string' && CATEGORIES.includes(input.category) ? input.category : 'Other',
    locations: stringList(input.locations, 10),
    workplaceType: workplace === 'Remote' || workplace === 'Onsite' || workplace === 'Hybrid' ? workplace : null,
    skills: stringList(input.skills, 20),
    experienceMinYears: years,
    salary,
    language,
    employerType: input.employer_type === 'Internal' || input.employer_type === 'External' ? input.employer_type : null,
    model,
  };
}

const SYSTEM_PROMPT = `You are an expert technical recruiter and career advisor. You evaluate a job posting against a candidate's local profile and return a structured verdict. Read the CV, preferences and constraints the candidate provided, then judge how well THIS job fits THEM.

Return a single JSON object with exactly these keys:
{
  "verdict": "no" | "weak" | "fair" | "strong",
  "reasoning": "a concise paragraph (3-6 sentences) explaining the verdict, naming specific matches and gaps",
  "matches": ["2-5 bullet strings listing what fits the candidate"],
  "gaps": ["2-5 bullet strings listing what the candidate lacks or would stretch to fit"]
}

Rules:
- "strong": clear, close fit with most hard requirements met.
- "fair": a realistic stretch — relevant but with meaningful gaps to address.
- "weak": tangentially relevant; several required skills/experience missing.
- "no": unrelated, mismatched seniority, or violates an explicit constraint (e.g., junior role, US on-site only when candidate wants NL, etc.).
- Be honest and specific. Reference the candidate's actual background. Do not inflate.
- Reply with ONLY the JSON object, no markdown fences, no commentary.`;

function buildUserPrompt(target: JudgeTarget, profile: ReturnType<typeof gatherProfile>): string {
  const sections: string[] = [];
  if (profile.cv.trim()) sections.push(`=== CANDIDATE CV ===\n${profile.cv.trim()}`);
  if (profile.background.trim()) sections.push(`=== CANDIDATE BACKGROUND ===\n${profile.background.trim()}`);
  if (profile.preferences.trim()) sections.push(`=== CANDIDATE PREFERENCES ===\n${profile.preferences.trim()}`);
  if (profile.constraints.trim()) sections.push(`=== CANDIDATE CONSTRAINTS (HARD RULES) ===\n${profile.constraints.trim()}`);

  const jobParts = [
    `Company: ${target.company}`,
    `Title: ${target.title}`,
    `Location: ${target.location || 'n/a'}`,
    `Workplace: ${target.workplaceType || 'n/a'}`,
    `Employment: ${target.employmentType || 'n/a'}`,
    target.url ? `Link: ${target.url}` : null,
  ]
    .filter(Boolean)
    .join('\n');

  sections.push(`=== JOB POSTING ===\n${jobParts}\n\nDescription:\n${(target.description || '').slice(0, 15000)}`);
  sections.push('Determine a verdict for THIS posting against THE CANDIDATE. Respond only with the JSON object.');
  return sections.join('\n\n---\n\n');
}

function parseVerdict(raw: string): JudgeResult {
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    throw new Error(`could not parse judge JSON response: ${cleaned.slice(0, 300)}`);
  }
  const json = JSON.parse(cleaned.slice(start, end + 1)) as Partial<JudgeResult> & { verdict?: string };
  const verdict = normalizeVerdict(json.verdict);
  return {
    verdict,
    reasoning: String(json.reasoning ?? ''),
    matches: Array.isArray(json.matches) ? json.matches.map(String) : [],
    gaps: Array.isArray(json.gaps) ? json.gaps.map(String) : [],
    model: '',
    raw: cleaned,
  };
}

function normalizeVerdict(v: unknown): Verdict {
  const s = String(v ?? '').toLowerCase();
  if (s.includes('strong')) return 'strong';
  if (s.includes('fair')) return 'fair';
  if (s.includes('weak')) return 'weak';
  if (s.includes('no')) return 'no';
  return 'fair';
}

/**
 * Judge a single posting against the local profile via the configured provider.
 * @param options.model override; defaults to configured full model.
 * @param options.quick use the cheaper quick model and tighten the description.
 */
export async function judgePosting(
  target: JudgeTarget,
  options: { model?: string; quick?: boolean } = {},
): Promise<JudgeResult> {
  const profile = gatherProfile();
  const userPrompt = buildUserPrompt(target, profile);

  const { content, model } = await chatJson({
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.2,
    quick: options.quick,
    model: options.model,
  });

  const parsed = parseVerdict(content);
  parsed.model = model;
  return parsed;
}

/** Extract searchable job metadata with the configured quick model. */
export async function extractJobMetadata(target: JudgeTarget): Promise<JobMetadata> {
  const { content, model } = await chatJson({
    messages: [
      { role: 'system', content: EXTRACTION_PROMPT },
      { role: 'user', content: `Title: ${target.title}\nLocation: ${target.location}\nWorkplace: ${target.workplaceType || 'n/a'}\nDescription:\n${(target.description || '').slice(0, 12000)}` },
    ],
    temperature: 0,
    quick: true,
  });

  const start = content.indexOf('{');
  const end = content.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('could not parse metadata JSON');
  let parsed: unknown;
  try {
    parsed = JSON.parse(content.slice(start, end + 1));
  } catch {
    throw new Error('could not parse metadata JSON');
  }
  return parseJobMetadata(parsed, model);
}
