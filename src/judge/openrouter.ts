import type { Verdict } from '../db/types.js';
import { loadConfig, resolveApiKey, hasApiKey } from '../config/config.js';
import { gatherProfile } from '../profile/cv.js';
import type { JobMetadata } from '../db/jobs-repo.js';

export interface OpenRouterResult {
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

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

const EXTRACTION_PROMPT = `Extract structured fields from this job posting. Return only JSON:
{"category":"Software Development|Engineering|Information Technology|Data and Analytics|Music|Other","locations":["city, country"],"workplace_type":"Remote|Onsite|Hybrid|null"}
Use the job description as source of truth. Normalize locations to city/country where possible. Choose Music for music/audio industry or production roles; choose one of the technical categories for software/engineering/IT/data roles; choose Other for everything else.`;

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

function parseVerdict(raw: string): OpenRouterResult {
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    throw new Error(`could not parse OpenRouter JSON response: ${cleaned.slice(0, 300)}`);
  }
  const json = JSON.parse(cleaned.slice(start, end + 1)) as Partial<OpenRouterResult> & { verdict?: string };
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
 * Judge a single posting against the local profile via OpenRouter.
 * @param options.model override; defaults to configured full model.
 * @param options.quick use the cheaper quick model and tighten the description.
 */
export async function judgePosting(
  target: JudgeTarget,
  options: { model?: string; quick?: boolean } = {},
): Promise<OpenRouterResult> {
  const config = loadConfig();
  if (!hasApiKey(config)) {
    throw new Error(
      'No OpenRouter API key configured. Run `jobhopper config set-openrouter-key` or set OPENROUTER_API_KEY.',
    );
  }
  const model = options.model ?? (options.quick ? config.quickModel : config.model);
  const key = resolveApiKey(config);
  const profile = gatherProfile();
  const userPrompt = buildUserPrompt(target, profile);

  const res = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
      'HTTP-Referer': 'https://github.com/local/jobhopper',
      'X-Title': 'jobhopper',
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.2,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`OpenRouter returned HTTP ${res.status}: ${body.slice(0, 300)}`);
  }
  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    model?: string;
  };
  const content = data.choices?.[0]?.message?.content ?? '';
  const parsed = parseVerdict(content);
  parsed.model = data.model ?? model;
  return parsed;
}

/** Extract searchable job metadata with the configured quick model. */
export async function extractJobMetadata(target: JudgeTarget): Promise<JobMetadata> {
  const config = loadConfig();
  if (!hasApiKey(config)) throw new Error('No OpenRouter API key configured.');
  const model = config.quickModel;
  const key = resolveApiKey(config);
  const res = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}`, 'HTTP-Referer': 'https://github.com/local/jobhopper', 'X-Title': 'jobhopper' },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: EXTRACTION_PROMPT },
        { role: 'user', content: `Title: ${target.title}\nLocation: ${target.location}\nWorkplace: ${target.workplaceType || 'n/a'}\nDescription:\n${(target.description || '').slice(0, 12000)}` },
      ],
      response_format: { type: 'json_object' },
      temperature: 0,
    }),
  });
  if (!res.ok) throw new Error(`OpenRouter returned HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }>; model?: string };
  const raw = data.choices?.[0]?.message?.content ?? '';
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('could not parse metadata JSON');
  const parsed = JSON.parse(raw.slice(start, end + 1)) as { category?: unknown; locations?: unknown; workplace_type?: unknown };
  const categories = ['Software Development', 'Engineering', 'Information Technology', 'Data and Analytics', 'Music', 'Other'];
  const workplace = parsed.workplace_type;
  return {
    category: categories.includes(String(parsed.category)) ? String(parsed.category) : 'Other',
    locations: Array.isArray(parsed.locations) ? parsed.locations.map(String).slice(0, 10) : [],
    workplaceType: workplace === 'Remote' || workplace === 'Onsite' || workplace === 'Hybrid' ? workplace : null,
    model: data.model ?? model,
  };
}