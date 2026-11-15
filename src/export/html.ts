import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

import { isTargetMarket, isRelevantRole } from '../market.js';

export interface HtmlRow {
  company: string;
  title: string;
  location: string;
  url: string | null;
  description: string;
  source?: string | null;
  verdict?: string | null;
  posted_at?: string | null;
}

/** Rows the snapshot may keep: current market+role gate, plus anything applied to. */
export function inSnapshotScope(row: {
  location?: string | null;
  title?: string | null;
  applied_at?: string | null;
}): boolean {
  if (row.applied_at) return true;
  // Malformed legacy locations ("Milan; [object Object]") cannot pass the
  // market gate and render badly; drop them like off-market rows.
  if (!row.location || row.location.includes('[object Object]')) return false;
  return isTargetMarket(row.location) && isRelevantRole(row.title);
}

function esc(s: string | null | undefined): string {
  return (s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Build a self-contained, searchable HTML dashboard from job rows. */
export function buildHtml(rows: HtmlRow[], title = 'JobHopper shortlist'): string {
  const cards = rows
    .map((r) => {
      const url = r.url ? `<a href="${esc(r.url)}" target="_blank" rel="noopener">Apply ↗</a>` : '<span>—</span>';
      const desc = r.description
        ? `<details><summary>Description</summary><p>${esc(r.description.slice(0, 2000))}</p></details>`
        : '';
      const tag = r.verdict ? `<span class="verdict ${esc(r.verdict)}">${esc(r.verdict)}</span>` : '';
      const meta = [
        esc(r.company),
        esc(r.location),
        r.source ? esc(r.source) : null,
        r.posted_at ? esc(String(r.posted_at).slice(0, 10)) : null,
      ]
        .filter(Boolean)
        .join(' · ');
      return `<div class="card">
        <h3>${esc(r.title)}</h3>
        ${tag}
        <div class="meta">${meta}</div>
        ${url}
        ${desc}
      </div>`;
    })
    .join('\n');
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>
body{font-family:system-ui,sans-serif;max-width:920px;margin:40px auto;padding:0 16px;color:#1a1a1a}
h1{font-size:1.6em}.cards{display:grid;gap:12px;margin-top:20px}
.card{border:1px solid #e2e2e2;border-radius:8px;padding:16px;position:relative}
.card h3{margin:0 0 4px;padding-right:70px}
.meta{color:#666;margin-bottom:8px}
a{color:#0b74de;text-decoration:none;font-weight:600}
.verdict{position:absolute;top:14px;right:14px;text-transform:uppercase;font-size:.72em;font-weight:700;padding:2px 8px;border-radius:10px}
.verdict.strong{background:#e6f4ea;color:#137333}.verdict.fair{background:#fef7e0;color:#b06000}
.verdict.weak{background:#fce8e6;color:#c5221f}
details{color:#444;margin-top:8px;font-size:.9em}
.search{width:100%;padding:10px;margin:16px 0;border:1px solid #ccc;border-radius:6px;font-size:1em}
.count{color:#666;font-size:.9em;margin-bottom:8px}
</style></head>
<body><h1>${esc(title)}</h1>
<div class="count" id="count"></div>
<input class="search" id="q" placeholder="Filter by title, company, location…">
<div class="cards" id="cards">${cards}</div>
<script>
const q=document.getElementById('q');const count=document.getElementById('count');
function upd(){const t=q.value.toLowerCase();let n=0;
document.querySelectorAll('.card').forEach(c=>{const show=c.textContent.toLowerCase().includes(t);c.style.display=show?'':'none';if(show)n++;});
count.textContent=n+' shown';}
q.addEventListener('input',upd);upd();
</script>
</body></html>`;
}

/** Write rows out to an HTML file, creating parent dirs as needed. */
export function exportToHtmlFile(rows: HtmlRow[], outputPath: string, title?: string): void {
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, buildHtml(rows, title), 'utf8');
}

/**
 * Structured fields the extraction prompt produces. They live in the snapshot
 * because the CI DB is rebuilt every run — without them, every filter on the
 * hosted board would be empty.
 */
export interface SnapshotMetadata {
  category?: string | null;
  locations?: string[] | null;
  /** Workplace type as extracted from the posting text (the adapter's is workplace_type). */
  extracted_workplace_type?: string | null;
  skills?: string[] | null;
  experience_min_years?: number | null;
  salary_min?: number | null;
  salary_max?: number | null;
  salary_currency?: string | null;
  salary_frequency?: string | null;
  /** ISO 639-1 code of the posting's language. */
  language?: string | null;
  /** Internal (direct employer) or External (recruiter/staffing agency). */
  employer_type?: string | null;
  /** Which model produced the extraction; also marks a row as enriched. */
  extraction_model?: string | null;
}

/** Snapshot row shape — the full set of fields the React UI understands. */
export interface JsonRow extends SnapshotMetadata {
  id: number;
  external_id: string;
  source: string;
  company: string;
  title: string;
  location: string;
  workplace_type: string | null;
  employment_type: string | null;
  url: string;
  description: string;
  posted_at: string | null;
  tags: string | null;
  verdict?: string | null;
  reasoning?: string | null;
  /** Model that produced the verdict; null when it was never recorded. */
  model?: string | null;
  /** Last time a board returned this row (ISO). Cross-run liveness signal. */
  last_seen?: string | null;
}

/** Later of two ISO timestamps; a missing value loses. */
function maxIso(a?: string | null, b?: string | null): string | null {
  if (!a) return b ?? null;
  if (!b) return a;
  return a >= b ? a : b;
}

/** A JSON array column (locations, skills) as a string list; junk becomes []. */
export function listFromJson(value: string | null | undefined): string[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

/** Project the DB's extracted columns onto the snapshot's metadata block. */
export function snapshotMetadata(row: {
  category: string | null;
  normalized_locations: string | null;
  extracted_workplace_type: string | null;
  skills: string | null;
  experience_min_years: number | null;
  salary_min: number | null;
  salary_max: number | null;
  salary_currency: string | null;
  salary_frequency: string | null;
  language: string | null;
  employer_type: string | null;
  extraction_model: string | null;
}): SnapshotMetadata {
  return {
    category: row.category,
    locations: listFromJson(row.normalized_locations),
    extracted_workplace_type: row.extracted_workplace_type,
    skills: listFromJson(row.skills),
    experience_min_years: row.experience_min_years,
    salary_min: row.salary_min,
    salary_max: row.salary_max,
    salary_currency: row.salary_currency,
    salary_frequency: row.salary_frequency,
    language: row.language,
    employer_type: row.employer_type,
    extraction_model: row.extraction_model,
  };
}

/**
 * Merge fresh DB rows into the committed snapshot without losing history.
 * Every existing row is kept, unless a fresh row has the same source+external_id,
 * in which case the fresh row wins. A committed verdict/reasoning is kept when the
 * fresh row has none, so a re-export never erases a judgment.
 */
export function mergeSnapshotRows<T extends { source: string; external_id: string; verdict?: string | null; reasoning?: string | null; model?: string | null; applied_at?: string | null; first_seen?: string | null; last_seen?: string | null } & SnapshotMetadata>(
  existing: T[],
  fresh: T[],
): T[] {
  const byKey = new Map<string, T>();
  for (const row of existing) byKey.set(`${row.source}:${row.external_id}`, row);
  for (const row of fresh) {
    const key = `${row.source}:${row.external_id}`;
    const prev = byKey.get(key);
    const keepVerdict = !row.verdict && prev?.verdict;
    const keepApplied = !row.applied_at && prev?.applied_at;
    const keepFirstSeen = !row.first_seen && prev?.first_seen;
    const keepModel = !row.model && prev?.model;
    // Extracted metadata is written as one block, so it is kept or dropped as a
    // block: a fresh row without an extraction must not erase what we knew.
    const keepMetadata = !row.extraction_model && prev?.extraction_model;
    // A run that does not re-see a row must not rewind its liveness clock.
    const lastSeen = maxIso(row.last_seen, prev?.last_seen);
    let merged = row;
    if (keepVerdict) merged = { ...merged, verdict: prev.verdict, reasoning: prev.reasoning ?? row.reasoning };
    if (keepApplied) merged = { ...merged, applied_at: prev.applied_at };
    if (keepFirstSeen) merged = { ...merged, first_seen: prev.first_seen };
    if (keepModel) merged = { ...merged, model: prev.model };
    if (keepMetadata && prev) {
      merged = {
        ...merged,
        category: prev.category,
        locations: prev.locations,
        skills: prev.skills,
        experience_min_years: prev.experience_min_years,
        salary_min: prev.salary_min,
        salary_max: prev.salary_max,
        salary_currency: prev.salary_currency,
        salary_frequency: prev.salary_frequency,
        language: prev.language,
        employer_type: prev.employer_type,
        extraction_model: prev.extraction_model,
      };
    }
    if (lastSeen !== (row.last_seen ?? null)) merged = { ...merged, last_seen: lastSeen };
    byKey.set(key, merged);
  }
  return Array.from(byKey.values());
}

/**
 * Newest posted first; rows without a date last. ISO strings compare
 * lexicographically. Used on the merged snapshot so "newest first" is true even
 * though the merge keeps the previous snapshot's order.
 */
export function sortRowsByPostedAt<T extends { posted_at?: string | null; first_seen?: string | null }>(rows: T[]): T[] {
  const time = (value?: string | null) => {
    const ms = value ? Date.parse(value) : Number.NaN;
    return Number.isFinite(ms) ? ms : Number.NEGATIVE_INFINITY;
  };
  return [...rows].sort((a, b) => {
    const at = time(a.posted_at);
    const bt = time(b.posted_at);
    if (at !== bt) return bt - at;
    return (b.first_seen ?? '').localeCompare(a.first_seen ?? '');
  });
}

/** Write full job rows (as returned by the DB, containing verdicts) to JSON. */
export function exportJobsToJsonFile(rows: JsonRow[], outputPath: string): void {
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(rows, null, 2)}\n`, 'utf8');
}