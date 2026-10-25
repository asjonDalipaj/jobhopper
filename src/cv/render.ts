/**
 * Deterministic CV renderer: cv.json in, one-page A4 PDF out.
 *
 * The tailoring model never touches this file. It hands over a plan (order,
 * selection, headline, summary) and the layout is fixed, so the same document
 * always produces the same PDF and nothing can be invented at draw time.
 */

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import type { CvDocument, CvExperience, CvProject } from './schema.js';
import { datesOf, normalizeLine } from './schema.js';
import { wrapText } from './text.js';

const A4: [number, number] = [595.276, 841.89];
const M = { left: 50, right: 50, bottom: 36 };
const WIDTH = A4[0] - M.left - M.right;
const BAND_H = 96;
const LABEL_W = 104;

const hex = (h: string) =>
  rgb(parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255);

const C = {
  band: hex('#EDF3F1'),
  ink: hex('#25333B'),
  body: hex('#33424A'),
  muted: hex('#6E7F84'),
  teal: hex('#45787A'),
  coral: hex('#DD9C82'),
  coralSoft: hex('#E7A98F'),
  rule: hex('#CFDEDA'),
};

export interface TailorPlan {
  headline?: string;
  summary?: string;
  /** Skill row labels, most relevant first. Unknown labels are ignored. */
  skillOrder?: string[];
  /** Employer names, most relevant first. Unknown names are ignored. */
  experienceOrder?: string[];
  /** Per employer: bullet texts in the order they should appear. Must exist in cv.json. */
  bulletOrder?: Record<string, string[]>;
  /** Project names to keep, in order. Empty or absent keeps every project. */
  projectNames?: string[];
  /** Words the posting emphasises, for the CLI to print. Never injected into the PDF. */
  keywords?: string[];
}

export interface RenderResult {
  bytes: Uint8Array;
  pages: number;
  /** Bullets the fitter removed to keep one page. */
  dropped: string[];
  /** Exactly the text drawn on the page, used by the fact gate. */
  text: string;
}

interface Selection {
  headline: string;
  summary: string;
  skills: Array<{ label: string; items: string[] }>;
  jobs: Array<CvExperience & { bullets: string[] }>;
  projects: CvProject[];
}

const PAGE_FULL = Symbol('page-full');

class Painter {
  readonly drawn: string[] = [];
  y: number;

  constructor(
    private readonly page: PDFPage,
    private readonly font: PDFFont,
    private readonly bold: PDFFont,
    private readonly italic: PDFFont,
  ) {
    this.y = A4[1] - BAND_H - 2;
  }

  fits(h: number): boolean {
    if (this.y - h < M.bottom) throw PAGE_FULL;
    return true;
  }

  text(s: string, x: number, size: number, opts: { font?: PDFFont; color?: ReturnType<typeof rgb> } = {}): void {
    this.page.drawText(s, { x, y: this.y - size, size, font: opts.font ?? this.font, color: opts.color ?? C.body });
    this.drawn.push(s);
  }

  paragraph(s: string, opts: { size?: number; lh?: number; x?: number; width?: number; font?: PDFFont; color?: ReturnType<typeof rgb> } = {}): void {
    const size = opts.size ?? 9.4;
    const lh = opts.lh ?? 12.4;
    const x = opts.x ?? M.left;
    const width = opts.width ?? WIDTH;
    const font = opts.font ?? this.font;
    const lines = wrapText(s, width, (t) => font.widthOfTextAtSize(t, size));
    for (const line of lines) {
      this.fits(lh);
      this.text(line, x, size, { font, color: opts.color });
      this.y -= lh;
    }
  }

  bullet(s: string): void {
    this.fits(12.4);
    this.page.drawCircle({ x: M.left + 3, y: this.y - 5, size: 1.7, color: C.coral });
    this.paragraph(s, { size: 9.1, lh: 12.2, x: M.left + 10.5, width: WIDTH - 10.5 });
  }

  section(title: string, gapBefore = 10): void {
    this.fits(gapBefore + 26);
    this.y -= gapBefore;
    this.page.drawRectangle({ x: M.left, y: this.y - 6.4, width: 5, height: 5, color: C.coral });
    this.page.drawText(title.toUpperCase(), {
      x: M.left + 11,
      y: this.y - 7.4,
      size: 9.2,
      font: this.bold,
      color: C.teal,
    });
    this.drawn.push(title);
    this.y -= 12.5;
    this.page.drawLine({
      start: { x: M.left, y: this.y },
      end: { x: A4[0] - M.right, y: this.y },
      thickness: 0.8,
      color: C.rule,
    });
    this.y -= 7;
  }

  rightAligned(s: string, size: number, color = C.teal): void {
    const w = this.font.widthOfTextAtSize(s, size);
    this.page.drawText(s, { x: A4[0] - M.right - w, y: this.y - size, size, font: this.font, color });
    this.drawn.push(s);
  }
}

function orderBy<T>(items: T[], wanted: string[] | undefined, key: (item: T) => string): T[] {
  if (!wanted?.length) return items;
  const rank = new Map(wanted.map((name, i) => [normalizeLine(name), i]));
  const known = items.filter((item) => rank.has(normalizeLine(key(item))));
  const rest = items.filter((item) => !rank.has(normalizeLine(key(item))));
  known.sort((a, b) => (rank.get(normalizeLine(key(a))) ?? 0) - (rank.get(normalizeLine(key(b))) ?? 0));
  return [...known, ...rest];
}

/** Apply a plan to the document. Unknown references are ignored, never invented. */
export function selectContent(doc: CvDocument, plan: TailorPlan): Selection {
  const skills = orderBy(doc.skills, plan.skillOrder, (row) => row.label);
  const jobs = orderBy(doc.experience, plan.experienceOrder, (job) => job.org).map((job) => {
    const wanted = plan.bulletOrder?.[job.org];
    if (!wanted?.length) return { ...job, bullets: [...job.bullets] };
    const pool = new Map(job.bullets.map((b) => [normalizeLine(b), b]));
    const picked = wanted.map((b) => pool.get(normalizeLine(b))).filter((b): b is string => Boolean(b));
    return { ...job, bullets: picked.length ? picked : [...job.bullets] };
  });
  const projects = plan.projectNames?.length
    ? orderBy(doc.projects, plan.projectNames, (p) => p.name).filter((p) =>
        plan.projectNames!.some((n) => normalizeLine(n) === normalizeLine(p.name)),
      )
    : doc.projects;

  return {
    headline: plan.headline?.trim() || doc.headline,
    summary: plan.summary?.trim() || doc.summary,
    skills,
    jobs,
    projects,
  };
}

async function paint(doc: CvDocument, selection: Selection): Promise<{ pdf: PDFDocument; text: string }> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`${doc.name} - CV`);
  pdf.setAuthor(doc.name);
  pdf.setCreator('jobhopper');

  const page = pdf.addPage(A4);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const italic = await pdf.embedFont(StandardFonts.HelveticaOblique);

  page.drawRectangle({ x: 0, y: A4[1] - BAND_H, width: A4[0], height: BAND_H, color: C.band });
  page.drawRectangle({ x: 0, y: A4[1] - BAND_H, width: A4[0], height: 1.8, color: C.coralSoft });

  const nameW = bold.widthOfTextAtSize(doc.name, 23);
  page.drawText(doc.name, { x: M.left, y: A4[1] - 40, size: 23, font: bold, color: C.ink });
  page.drawRectangle({ x: M.left + 1, y: A4[1] - 48.5, width: nameW - 2, height: 2.2, color: C.coral });
  page.drawText(selection.headline, { x: M.left, y: A4[1] - 63, size: 9.6, font: bold, color: C.teal });
  page.drawText(doc.location, { x: M.left, y: A4[1] - 76.5, size: 8.7, font, color: C.muted });

  const contact = [doc.contact.email, doc.contact.phone, doc.contact.linkedin, doc.contact.github]
    .filter((v): v is string => Boolean(v && v.trim()))
    .join('  ·  ');
  page.drawText(contact, { x: M.left, y: A4[1] - 88, size: 8.7, font, color: C.muted });

  const p = new Painter(page, font, bold, italic);
  p.drawn.push(doc.name, selection.headline, doc.location, contact);

  p.section('About', 9);
  p.paragraph(selection.summary, { size: 9.5, lh: 13 });

  p.section('Core Competencies');
  for (const row of selection.skills) {
    p.fits(12.6);
    p.text(row.label, M.left, 9.1, { font: bold, color: C.ink });
    p.paragraph(row.items.join(', '), { size: 9.1, lh: 12.2, x: M.left + LABEL_W, width: WIDTH - LABEL_W });
  }

  p.section('Experience');
  for (const job of selection.jobs) {
    p.fits(30);
    const heading = `${job.role}, ${job.org}`;
    p.text(heading, M.left, 9.5, { font: bold, color: C.ink });
    if (job.note) {
      const w = bold.widthOfTextAtSize(heading, 9.5);
      page.drawText(`  ${job.note}`, {
        x: M.left + w,
        y: p.y - 8.8,
        size: 8.8,
        font: italic,
        color: C.muted,
      });
      p.drawn.push(job.note);
    }
    p.rightAligned(datesOf(job), 8.5);
    p.y -= 12;
    p.text(job.place, M.left, 8.5, { font: italic, color: C.muted });
    p.y -= 12.3;
    for (const bullet of job.bullets) p.bullet(bullet);
    p.y -= 3.5;
  }

  if (selection.projects.length) {
    p.section('Projects');
    for (const project of selection.projects) {
      p.fits(26);
      p.text(project.name, M.left, 9.5, { font: bold, color: C.ink });
      if (project.meta) {
        const w = bold.widthOfTextAtSize(project.name, 9.5);
        page.drawText(`  ${project.meta}`, {
          x: M.left + w,
          y: p.y - 8.5,
          size: 8.5,
          font,
          color: C.muted,
        });
        p.drawn.push(project.meta);
      }
      p.y -= 12.4;
      for (const bullet of project.bullets) p.bullet(bullet);
      p.y -= 3.5;
    }
  }

  if (doc.education.length) {
    p.section('Education');
    for (const item of doc.education) {
      p.fits(24);
      p.text(item.title, M.left, 9.2, { font: bold, color: C.ink });
      p.rightAligned(item.years, 8.5);
      p.y -= 12;
      p.text(item.school, M.left, 8.7, { font, color: C.muted });
      p.y -= 12;
    }
  }

  p.section('Languages and beyond work');
  const tail = doc.beyond ? `${doc.languages} ${doc.beyond}` : doc.languages;
  p.paragraph(tail, { size: 9, lh: 12.1 });

  return { pdf, text: p.drawn.join('\n') };
}

/**
 * Render a one-page CV. If the selected content overflows, the longest bullet
 * list is trimmed and the page is repainted. Trimming is reported, never silent.
 */
export async function renderCvPdf(doc: CvDocument, plan: TailorPlan = {}): Promise<RenderResult> {
  const base = selectContent(doc, plan);
  const dropped: string[] = [];
  const jobs = base.jobs.map((job) => ({ ...job, bullets: [...job.bullets] }));

  for (let attempt = 0; attempt <= 14; attempt += 1) {
    try {
      const { pdf, text } = await paint(doc, { ...base, jobs });
      const bytes = await pdf.save();
      return { bytes, pages: pdf.getPageCount(), dropped, text };
    } catch (err) {
      if (err !== PAGE_FULL) throw err;
      // Keep each role at its floor so trimming never guts a single employer:
      // 3 bullets for the current role, 2 for the rest.
      const floor = (job: CvExperience) => (job === jobs[0] ? 3 : 2);
      const trimmable = jobs.filter((job) => job.bullets.length > floor(job));
      const target = (trimmable.length ? trimmable : jobs).reduce(
        (a, b) => (b.bullets.length > a.bullets.length ? b : a),
        jobs[0],
      );
      if (!target || target.bullets.length <= 1) {
        throw new Error('CV does not fit one page even after trimming every bullet; shorten the summary or drop a role');
      }
      dropped.push(target.bullets.pop() as string);
    }
  }
  throw new Error('CV did not converge to one page');
}
