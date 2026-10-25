/**
 * Pure text helpers for the CV renderer. No pdf-lib here so they stay testable
 * without a PDF document.
 */

/** Greedy word wrap. `measure` returns the rendered width of a string. */
export function wrapText(text: string, maxWidth: number, measure: (s: string) => number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && measure(candidate) > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/** Filesystem-safe stem for a job, derived from the stable identity. */
export function artifactStem(source: string, externalId: string, company: string, title: string): string {
  const slug = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40);
  return [slug(company), slug(title), slug(source), slug(externalId)].filter(Boolean).join('_');
}
