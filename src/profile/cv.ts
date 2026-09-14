import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join, basename } from 'node:path';
import pdf from 'pdf-parse';
import { getPaths, ensureDirs } from '../storage/paths.js';

export const KNOWN_DOCS = ['cv', 'cv.txt', 'preferences', 'constraints', 'background'] as const;
export type ProfileDocName = (typeof KNOWN_DOCS)[number];

export interface ProfileSummary {
  dir: string;
  files: string[];
  cvTextLength: number;
  hasPdf: boolean;
}

/** Extract and cache CV text from a PDF path into profile/cv.txt. */
export async function importCvPdf(pdfPath: string): Promise<{ text: string; charCount: number; pages: number; file: string }> {
  const buf = readFileSync(pdfPath);
  const data = await pdf(buf);
  const text = data.text;
  const wrote = writeCvText(text);
  return { text, charCount: text.length, pages: data.numpages, file: wrote };
}

const PDF_EXT = /\.pdf$/i;

export function writeCvText(text: string): string {
  ensureDirs();
  const { profileDir } = getPaths();
  const target = join(profileDir, 'cv.txt');
  writeFileSync(target, text, 'utf8');
  return target;
}

export function getCvTextPath(): string {
  return join(getPaths().profileDir, 'cv.txt');
}

export function readCvText(): string {
  const p = getCvTextPath();
  return existsSync(p) ? readFileSync(p, 'utf8') : '';
}

export function readProfileDoc(name: string): string {
  const p = docPath(name);
  return existsSync(p) ? readFileSync(p, 'utf8') : '';
}

export function writeProfileDoc(name: string, text: string): void {
  ensureDirs();
  writeFileSync(docPath(name), text, 'utf8');
}

export function docPath(name: string): string {
  const safe = name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const { profileDir } = getPaths();
  if (PDF_EXT.test(safe)) return join(profileDir, 'cv.pdf');
  if (safe === 'cv') return join(profileDir, 'cv.txt');
  return join(profileDir, `${safe}.md`);
}

export function profileFiles(): string[] {
  const { profileDir } = getPaths();
  if (!existsSync(profileDir)) return [];
  return readdirSync(profileDir);
}

/** Collect all text jobhopper sends to a judge: CV + optional prefs/constraints. */
export function gatherProfile(): { cv: string; preferences: string; constraints: string; background: string } {
  return {
    cv: readCvText(),
    preferences: readProfileDoc('preferences'),
    constraints: readProfileDoc('constraints'),
    background: readProfileDoc('background'),
  };
}