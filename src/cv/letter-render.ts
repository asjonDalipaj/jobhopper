/**
 * Cover letter renderer. Same typography family as the CV, so the two
 * attachments look like they came from the same person on the same day.
 */

import { PDFDocument, StandardFonts, type PDFFont, type PDFPage } from 'pdf-lib';
import type { CvDocument } from './schema.js';
import { wrapText } from './text.js';
import { PALETTE as C } from './render.js';

const A4: [number, number] = [595.276, 841.89];
const M = { left: 58, right: 58, bottom: 48 };
const WIDTH = A4[0] - M.left - M.right;
const BAND_H = 78;

export interface LetterContent {
  salutation: string;
  paragraphs: string[];
  signoff: string;
}

export interface LetterRenderResult {
  bytes: Uint8Array;
  text: string;
  date: string;
}

export function todayLabel(now = new Date()): string {
  return now.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

export async function renderLetterPdf(
  doc: CvDocument,
  letter: LetterContent,
  options: { date?: string } = {},
): Promise<LetterRenderResult> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`${doc.name} - cover letter`);
  pdf.setAuthor(doc.name);
  pdf.setCreator('jobhopper');

  const page: PDFPage = pdf.addPage(A4);
  const font: PDFFont = await pdf.embedFont(StandardFonts.Helvetica);
  const bold: PDFFont = await pdf.embedFont(StandardFonts.HelveticaBold);

  const drawn: string[] = [];
  const write = (s: string, x: number, y: number, size: number, f: PDFFont, color = C.body) => {
    page.drawText(s, { x, y, size, font: f, color });
    drawn.push(s);
  };

  // header band
  page.drawRectangle({ x: 0, y: A4[1] - BAND_H, width: A4[0], height: BAND_H, color: C.band });
  page.drawRectangle({ x: 0, y: A4[1] - BAND_H, width: A4[0], height: 1.8, color: C.coralSoft });
  write(doc.name, M.left, A4[1] - 34, 19, bold, C.ink);
  const nameW = bold.widthOfTextAtSize(doc.name, 19);
  page.drawRectangle({ x: M.left + 1, y: A4[1] - 41, width: nameW - 2, height: 2, color: C.coral });

  // A letter advertises who you are, not where you would move to: the CV's
  // "open to ..." tail pushes this line past the page edge.
  const place = doc.location.split('·')[0]?.trim();
  const contact = [doc.contact.email, doc.contact.phone, doc.contact.linkedin, place]
    .filter((v): v is string => Boolean(v && v.trim()))
    .join('  ·  ');
  write(contact, M.left, A4[1] - 58, 8.7, font, C.muted);

  const date = options.date ?? todayLabel();
  let y = A4[1] - BAND_H - 46;
  write(date, M.left, y, 9.2, font, C.muted);
  y -= 26;

  const para = (s: string, size: number, lh: number, f: PDFFont, color = C.body) => {
    for (const line of wrapText(s, WIDTH, (t) => f.widthOfTextAtSize(t, size))) {
      if (y - size < M.bottom) throw new Error('cover letter overflows one page; shorten it');
      write(line, M.left, y - size, size, f, color);
      y -= lh;
    }
  };

  para(letter.salutation, 10, 15.4, bold, C.ink);
  y -= 9;

  for (const body of letter.paragraphs) {
    para(body, 10, 15.4, font);
    y -= 9;
  }

  y -= 8;
  para(letter.signoff, 10, 15.4, font);
  y -= 14;
  write(doc.name, M.left, y - 10, 10, bold, C.teal);

  return { bytes: await pdf.save(), text: drawn.join('\n'), date };
}
