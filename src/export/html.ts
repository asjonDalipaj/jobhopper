import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

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

/** Snapshot row shape — the full set of fields the React UI understands. */
export interface JsonRow {
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
}

/**
 * Merge fresh DB rows into the committed snapshot without losing history.
 * Every existing row is kept, unless a fresh row has the same source+external_id,
 * in which case the fresh row wins. A committed verdict/reasoning is kept when the
 * fresh row has none, so a re-export never erases a judgment.
 */
export function mergeSnapshotRows<T extends { source: string; external_id: string; verdict?: string | null; reasoning?: string | null; applied_at?: string | null; first_seen?: string | null }>(
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
    let merged = row;
    if (keepVerdict) merged = { ...merged, verdict: prev.verdict, reasoning: prev.reasoning ?? row.reasoning };
    if (keepApplied) merged = { ...merged, applied_at: prev.applied_at };
    if (keepFirstSeen) merged = { ...merged, first_seen: prev.first_seen };
    byKey.set(key, merged);
  }
  return Array.from(byKey.values());
}

/** Write full job rows (as returned by the DB, containing verdicts) to JSON. */
export function exportJobsToJsonFile(rows: JsonRow[], outputPath: string): void {
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(rows, null, 2)}\n`, 'utf8');
}