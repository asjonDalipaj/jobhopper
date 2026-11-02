/**
 * Lever form filler.
 *
 * Lever's `/apply` page uses stable names for the core fields (`name`, `email`,
 * `phone`, `org`, `urls[...]`, `resume`) and `cards[...]` for custom questions,
 * whose text sits on the outer `.application-question`. Nothing here clicks
 * Submit: Lever serves hCaptcha, so the applicant reviews and submits.
 */

import { chromium, type Page } from 'playwright-core';
import { join } from 'node:path';
import type { ApplyContext, ApplyResult } from './greenhouse.js';
import { briefError } from './greenhouse.js';

interface FieldInfo {
  id: string;
  name: string;
  type: string;
  label: string;
  question: string;
  required: boolean;
  value: string;
}

/** Best-effort answer for a Lever question label. */
export function leverAnswer(label: string, ctx: ApplyContext): string | null {
  const l = label.toLowerCase();
  if (/preferred name/.test(l)) return ctx.doc.name.split(/\s+/)[0] ?? null;
  if (/linkedin/.test(l)) return ctx.doc.contact.linkedin ?? null;
  if (/(website|portfolio|github)/.test(l)) return ctx.doc.contact.github ?? null;
  if (/phone/.test(l)) return ctx.applicant.phoneNational || ctx.doc.contact.phone || null;
  if (/(where.*based|currently.*located|current.*location|location.*city)/.test(l)) {
    return `${ctx.applicant.city ?? ctx.applicant.preferredLocation}, ${ctx.applicant.country}`;
  }
  if (/how did you hear/.test(l)) return ctx.applicant.howDidYouHear;
  for (const question of ctx.applicant.questions ?? []) {
    if (question.match && l.includes(question.match.toLowerCase())) return question.answer;
  }
  return null;
}

function numeric(answer: string): string | null {
  const match = answer.replace(/,/g, '').match(/(\d+(?:\.\d+)?)/);
  if (!match) return null;
  let amount = Number.parseFloat(match[1] as string);
  if (/\.\d{3}$/.test(match[1] as string)) amount = Number.parseFloat((match[1] as string).replace('.', ''));
  if (/k/i.test(answer)) amount *= 1000;
  return Number.isFinite(amount) ? String(Math.round(amount)) : null;
}

function byId(page: Page, id: string) {
  return page.locator(`[id="${id.replace(/"/g, '\\"')}"]`);
}

function byName(page: Page, name: string) {
  return page.locator(`[name="${name.replace(/"/g, '\\"')}"]`).first();
}

async function readFields(page: Page): Promise<FieldInfo[]> {
  const fields = await page.evaluate(() => {
    const doc = (globalThis as unknown as { document: any }).document;
    const css = (globalThis as unknown as { CSS: any }).CSS;
    return [...doc.querySelectorAll('input, textarea, select')]
      .map((el: any) => {
        const id: string = el.id;
        const outer = el.closest('.application-question');
        const labelEl = id ? doc.querySelector(`label[for="${css.escape(id)}"]`) : null;
        const question = (
          outer?.querySelector('.application-label, label, legend, .application-question-label')?.textContent ||
          el.closest('fieldset')?.querySelector('legend')?.textContent ||
          ''
        ).replace(/\s+/g, ' ').trim();
        const label = (
          labelEl?.textContent ||
          el.closest('label')?.textContent ||
          el.getAttribute('aria-label') ||
          ''
        ).replace(/\s+/g, ' ').trim();
        const rect = el.getBoundingClientRect();
        return {
          id,
          name: el.getAttribute('name') ?? '',
          type: (el.getAttribute('type') ?? el.tagName).toLowerCase(),
          label,
          question,
          required: el.hasAttribute('required') || el.getAttribute('aria-required') === 'true',
          value: el.value ?? '',
          visible: rect.width > 0 && rect.height > 0,
        };
      })
      .filter((field: { visible: boolean }) => field.visible)
      .map(({ visible: _visible, ...field }: { visible: boolean }) => field);
  });
  return fields as FieldInfo[];
}

async function openApplication(page: Page, url: string): Promise<void> {
  if (!/\/apply\/?($|\?)/i.test(page.url())) {
    const apply = page.getByRole('link', { name: /apply/i }).or(page.getByRole('button', { name: /apply/i })).first();
    if (await apply.count().catch(() => 0)) {
      await apply.click({ timeout: 8000 }).catch(() => undefined);
      await page.waitForTimeout(1200);
    }
  }
  try {
    await page.waitForSelector('input[name="name"]', { timeout: 25000 });
  } catch {
    await page.mouse.wheel(0, 3000).catch(() => undefined);
    await page.waitForSelector('input[name="name"]', { timeout: 15000 });
  }
}

async function fillStandard(page: Page, ctx: ApplyContext, filled: string[], missing: string[]): Promise<void> {
  const city = ctx.applicant.city ?? ctx.applicant.preferredLocation;
  const standard: Array<[string, string]> = [
    ['name', ctx.doc.name],
    ['email', ctx.doc.contact.email],
    ['phone', ctx.applicant.phoneNational || ctx.doc.contact.phone],
    ['location', `${city}, ${ctx.applicant.country}`],
    ['org', ctx.doc.experience[0]?.org ?? ''],
    ['urls[LinkedIn]', ctx.doc.contact.linkedin ?? ''],
    ['urls[GitHub]', ctx.doc.contact.github ?? ''],
    ['urls[Portfolio]', ctx.doc.contact.github ?? ''],
    ['urls[Website ]', ctx.doc.contact.github ?? ''],
  ];
  for (const [name, value] of standard) {
    if (!value) continue;
    const locator = byName(page, name);
    if (!(await locator.count())) continue;
    await locator.fill(value).catch(() => undefined);
    filled.push(name);
    if (name === 'location') {
      // Lever's location field is an autocomplete; pick its first suggestion.
      await page.waitForTimeout(600);
      const option = page.locator('.dropdown-location, .location-suggestion, [class*="location"] li').first();
      if (await option.count().catch(() => 0)) await option.click({ timeout: 2000 }).catch(() => undefined);
    }
  }

  const resume = page.locator('input[type=file][name="resume"], #resume-upload-input').first();
  if (await resume.count()) {
    await resume.setInputFiles(ctx.cvPath);
    filled.push('resume');
  } else {
    missing.push('resume');
  }
  if (ctx.letterPath) {
    const cover = page.locator('input[type=file][name*="cover" i], input[type=file][id*="cover" i]').first();
    if (await cover.count()) {
      await cover.setInputFiles(ctx.letterPath);
      filled.push('cover letter');
    }
  }
}

async function fillQuestions(page: Page, ctx: ApplyContext, filled: string[], missing: string[]): Promise<void> {
  const fields = await readFields(page);
  const standard = new Set(['name', 'email', 'phone', 'location', 'org', 'urls[LinkedIn]', 'urls[Twitter]', 'urls[GitHub]', 'urls[Portfolio]', 'urls[Website ]', 'resume', 'coverLetter']);

  for (const field of fields) {
    if (!field.name || standard.has(field.name)) continue;
    if (field.name.startsWith('eeo[')) continue;
    if (field.type === 'file' || field.type === 'hidden' || field.type === 'submit' || field.type === 'button') continue;
    if (field.type === 'radio' || field.type === 'checkbox') continue;

    const answer = leverAnswer(field.question || field.label, ctx);
    if (!answer) continue;
    try {
      if (field.type === 'select') {
        const locator = field.id ? byId(page, field.id) : byName(page, field.name);
        if (!(await locator.count())) continue;
        const options = await locator.locator('option').allTextContents();
        const option = options.find((text) => text.toLowerCase().includes(answer.toLowerCase()));
        if (!option) continue;
        await locator.selectOption({ label: option });
        filled.push(field.question || field.label || field.name);
      } else {
        const value = field.type === 'number' ? numeric(answer) : answer;
        if (!value) continue;
        const locator = field.id ? byId(page, field.id) : byName(page, field.name);
        if (!(await locator.count())) continue;
        await locator.fill(value);
        filled.push(field.question || field.label || field.name);
      }
    } catch {
      // reported through missing/required below
    }
  }

  // Radio groups: answer from the question label, pick the option label.
  const radios = fields.filter((f) => f.type === 'radio' && f.name);
  const groups = new Map<string, FieldInfo[]>();
  for (const radio of radios) groups.set(radio.name, [...(groups.get(radio.name) ?? []), radio]);
  for (const [name, options] of groups) {
    const answer = leverAnswer(options[0]?.question || options[0]?.label || '', ctx);
    if (!answer) continue;
    const pick = options.find((o) => o.label.toLowerCase().includes(answer.toLowerCase()));
    if (!pick) continue;
    try {
      const locator = pick.id ? byId(page, pick.id) : page.getByLabel(pick.label, { exact: true }).first();
      await locator.check({ force: true }).catch(async () => {
        if (pick.label) await page.getByLabel(pick.label, { exact: true }).click({ timeout: 3000 });
      });
      filled.push(`radio: ${pick.label || name}`);
    } catch {
      // leave for the reviewer
    }
  }

  // Consent / acknowledgement checkboxes.
  for (const field of fields.filter((f) => f.type === 'checkbox')) {
    const text = `${field.question} ${field.label}`.toLowerCase();
    if (!/(consent|privacy|agree|acknowledge|retention|terms)/.test(text)) continue;
    if (!ctx.applicant.consentRetention) continue;
    try {
      const locator = field.id ? byId(page, field.id) : page.getByLabel(field.label, { exact: true }).first();
      await locator.check({ force: true }).catch(async () => {
        if (field.label) await page.getByLabel(field.label, { exact: true }).click({ timeout: 3000 });
      });
      filled.push(`consent: ${field.question || field.label}`);
    } catch {
      // leave for the reviewer
    }
  }

  // Required fields still empty are reported, not guessed.
  for (const field of fields) {
    if (!field.required) continue;
    if (['hidden', 'file', 'submit', 'button', 'radio', 'checkbox'].includes(field.type)) continue;
    const locator = field.id ? byId(page, field.id) : byName(page, field.name);
    const value = await locator.inputValue().catch(() => '');
    if (!value) missing.push(field.question || field.label || field.name);
  }
}

const CONFIRMATION = /thank you for applying|application (has been )?(submitted|received)|thanks for applying/i;

export async function applyLever(ctx: ApplyContext): Promise<ApplyResult> {
  if (ctx.submit) {
    throw new Error('Lever forms are submitted manually (hCaptcha). Use --review and click Submit yourself.');
  }
  const filled: string[] = [];
  const missing: string[] = [];
  const browser = await chromium.launch({
    executablePath: ctx.browserPath,
    headless: ctx.headless,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--disable-search-engine-choice-screen', '--disable-blink-features=AutomationControlled'],
  });

  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 1000 }, locale: 'en-GB' });
    page.setDefaultTimeout(20000);
    await page.goto(ctx.url, { waitUntil: 'load', timeout: 60000 });
    await openApplication(page, ctx.url);

    let fillError: string | null = null;
    const screenshot = join(ctx.outDir, 'lever-form.png');
    try {
      await fillStandard(page, ctx, filled, missing);
      await fillQuestions(page, ctx, filled, missing);
      await page.screenshot({ path: screenshot, fullPage: true });
    } catch (err) {
      if (!ctx.review) throw err;
      fillError = briefError(err);
      ctx.onFillError?.(fillError);
      await page.screenshot({ path: screenshot, fullPage: true }).catch(() => undefined);
    }

    let submitted = false;
    let confirmation: string | null = null;
    if (ctx.review) {
      await page.locator('input[name="name"]').scrollIntoViewIfNeeded().catch(() => undefined);
      await page.bringToFront().catch(() => undefined);
      ctx.onReviewReady?.();
      const deadline = Date.now() + 15 * 60_000;
      while (Date.now() < deadline) {
        if (page.isClosed()) {
          confirmation = 'window closed before a confirmation appeared';
          break;
        }
        const body = await page.locator('body').innerText().catch(() => '');
        if (CONFIRMATION.test(body) || /\/thanks\/?/i.test(page.url())) {
          submitted = true;
          confirmation = 'thank you page';
          await page.screenshot({ path: join(ctx.outDir, 'submitted.png'), fullPage: true }).catch(() => undefined);
          break;
        }
        await page.waitForTimeout(2000);
      }
      if (!submitted && !confirmation) confirmation = 'timed out waiting for the reviewer';
    }

    return { filled, missing, screenshot, submitted, needsCode: false, confirmation, fillError };
  } finally {
    await browser.close().catch(() => undefined);
  }
}
