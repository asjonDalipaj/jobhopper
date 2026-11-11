/**
 * Ashby form filler.
 *
 * Ashby's application page (`/application`) has three stable system fields
 * (`_systemfield_name/email/resume`); every other field has a per-board UUID
 * name but a visible label, so the rest is filled by label. Nothing here clicks
 * Submit: the form carries reCAPTCHA and the applicant reviews it themselves.
 */

import { chromium, type Page } from 'playwright-core';
import { join } from 'node:path';
import type { ApplyContext, ApplyResult } from './greenhouse.js';
import { briefError } from './greenhouse.js';
import { splitName } from './applicant.js';

interface FieldInfo {
  id: string;
  name: string;
  type: string;
  label: string;
  /** Fieldset legend, when the question wraps a radio/checkbox group. */
  group: string;
  required: boolean;
  value: string;
}

/** Best-effort answer for a labelled Ashby field, from the CV + applicant profile. */
export function labelValue(label: string, ctx: ApplyContext): string | null {
  const l = label.toLowerCase();
  if (/preferred name/.test(l)) return splitName(ctx.doc.name).first || null;
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

/** "EUR 80k" -> "80000", "90.000" -> "90000" for Ashby's number inputs. */
export function numericAnswer(answer: string): string | null {
  const match = answer.replace(/,/g, '').match(/(\d+(?:\.\d+)?)/);
  if (!match) return null;
  let amount = Number.parseFloat(match[1] as string);
  if (/\.\d{3}$/.test(match[1] as string)) amount = Number.parseFloat((match[1] as string).replace('.', ''));
  if (/k/i.test(answer)) amount *= 1000;
  return Number.isFinite(amount) ? String(Math.round(amount)) : null;
}

const CONFIRMATION = /thank you for applying|application (has been )?(submitted|received)|thanks for applying/i;
const REVIEW_TIMEOUT_MS = 15 * 60_000;

async function openApplication(page: Page, url: string): Promise<void> {
  if (!/\/application\/?($|\?)/i.test(page.url())) {
    // The Apply button is client-rendered and occasionally not hydrated when
    // clicked, which strands the run on the posting. Ashby's application route
    // is stable, so navigate there directly instead.
    const target = new URL(url);
    target.pathname = `${target.pathname.replace(/\/+$/, '')}/application`;
    await page.goto(target.toString(), { waitUntil: 'load', timeout: 60000 });
  }
  try {
    await page.waitForSelector('#_systemfield_name', { timeout: 25000 });
  } catch {
    // Some boards need a scroll before the form mounts.
    await page.mouse.wheel(0, 3000).catch(() => undefined);
    await page.waitForSelector('#_systemfield_name', { timeout: 15000 });
  }
}

function byId(page: Page, id: string) {
  return page.locator(`[id="${id.replace(/"/g, '\\"')}"]`);
}

async function readFields(page: Page): Promise<FieldInfo[]> {
  // The callback runs in the page; this project compiles without the DOM lib,
  // so use `any` on the browser globals rather than adding DOM to tsconfig.
  const fields = await page.evaluate(() => {
    const doc = (globalThis as unknown as { document: any }).document;
    const css = (globalThis as unknown as { CSS: any }).CSS;
    return [...doc.querySelectorAll('input, textarea, select')]
      .map((el: any) => {
        const id: string = el.id;
        const labelEl = id ? doc.querySelector(`label[for="${css.escape(id)}"]`) : null;
        const label = (labelEl?.textContent || el.closest('label')?.textContent || el.getAttribute('aria-label') || '')
          .replace(/\s+/g, ' ')
          .trim();
        const group = (el.closest('fieldset')?.querySelector('legend')?.textContent || '').replace(/\s+/g, ' ').trim();
        const rect = el.getBoundingClientRect();
        return {
          id,
          name: el.getAttribute('name') ?? '',
          type: (el.getAttribute('type') ?? el.tagName).toLowerCase(),
          label,
          group,
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

async function fillText(page: Page, field: FieldInfo, value: string): Promise<boolean> {
  const locator = field.id ? byId(page, field.id) : page.locator(`[name="${field.name.replace(/"/g, '\\"')}"]`).first();
  if (!(await locator.count())) return false;
  await locator.fill(value);
  return true;
}

async function pickSelect(page: Page, field: FieldInfo, answer: string): Promise<boolean> {
  const locator = field.id ? byId(page, field.id) : page.locator(`select[name="${field.name.replace(/"/g, '\\"')}"]`).first();
  if (!(await locator.count())) return false;
  const options = await locator.locator('option').allTextContents();
  const option = options.find((text) => text.toLowerCase().includes(answer.toLowerCase()));
  if (!option) return false;
  await locator.selectOption({ label: option });
  return true;
}

async function checkControl(page: Page, field: FieldInfo): Promise<boolean> {
  const locator = field.id ? byId(page, field.id) : page.getByLabel(field.label, { exact: true }).first();
  if (!(await locator.count())) return false;
  await locator.check({ force: true }).catch(async () => {
    if (field.label) await page.getByLabel(field.label, { exact: true }).click({ timeout: 3000 });
  });
  return true;
}

async function fillForm(page: Page, ctx: ApplyContext, filled: string[], missing: string[]): Promise<void> {
  // Standard fields.
  if (await page.locator('#_systemfield_name').count()) {
    await page.locator('#_systemfield_name').fill(ctx.doc.name);
    filled.push('name');
  }
  if (await page.locator('#_systemfield_email').count()) {
    await page.locator('#_systemfield_email').fill(ctx.doc.contact.email);
    filled.push('email');
  }
  const resume = page.locator('#_systemfield_resume');
  if (await resume.count()) {
    await resume.setInputFiles(ctx.cvPath);
    filled.push('resume');
  } else if (await page.locator('input[type=file]').count()) {
    await page.locator('input[type=file]').first().setInputFiles(ctx.cvPath);
    filled.push('resume');
  } else {
    missing.push('resume');
  }
  if (ctx.letterPath) {
    const cover = page.locator('input[type=file][id*="cover" i], input[type=file][aria-label*="cover" i]');
    if (await cover.count()) {
      await cover.first().setInputFiles(ctx.letterPath);
      filled.push('cover letter');
    }
  }

  const fields = await readFields(page);
  const system = new Set(['_systemfield_name', '_systemfield_email', '_systemfield_resume']);

  for (const field of fields) {
    if (!field.id && !field.name) continue;
    if (system.has(field.id)) continue;
    if (field.type === 'file' || field.type === 'hidden' || field.type === 'submit' || field.type === 'button') continue;
    if (field.type === 'radio' || field.type === 'checkbox') continue;

    const answer = labelValue(field.label, ctx);
    if (!answer) continue;
    try {
      if (field.type === 'select') {
        if (await pickSelect(page, field, answer)) filled.push(field.label || field.id);
      } else if (field.type === 'number') {
        const numeric = numericAnswer(answer);
        if (numeric && await fillText(page, field, numeric)) filled.push(field.label || field.id);
      } else if (await fillText(page, field, answer)) {
        filled.push(field.label || field.id);
      }
    } catch {
      // Field-level failures are reported through `missing`; one odd widget
      // must not abort the whole form.
    }
  }

  // Radio groups (consent, work authorisation, yes/no questions).
  const radios = fields.filter((f) => f.type === 'radio' && f.name);
  const groups = new Map<string, FieldInfo[]>();
  for (const radio of radios) groups.set(radio.name, [...(groups.get(radio.name) ?? []), radio]);
  for (const [name, options] of groups) {
    const answer = labelValue(options[0]?.group || options[0]?.label || '', ctx) ??
      options.map((o) => labelValue(o.label, ctx)).find(Boolean) ?? null;
    if (!answer) continue;
    const wanted = answer.toLowerCase();
    const pick = options.find((o) => o.label.toLowerCase().includes(wanted));
    if (!pick) continue;
    try {
      if (await checkControl(page, pick)) filled.push(`radio: ${pick.label || name}`);
    } catch {
      // leave for the reviewer
    }
  }

  // Consent / retention checkboxes.
  for (const field of fields.filter((f) => f.type === 'checkbox')) {
    const label = field.label.toLowerCase();
    const isConsent = /(consent|privacy|agree|retention)/.test(label);
    if (!isConsent || !ctx.applicant.consentRetention) continue;
    try {
      if (await checkControl(page, field)) filled.push(`consent: ${field.label}`);
    } catch {
      // leave for the reviewer
    }
  }

  // Required fields still empty are reported, not guessed.
  for (const field of fields) {
    if (!field.required) continue;
    if (['hidden', 'file', 'submit', 'button'].includes(field.type)) continue;
    if (field.type === 'radio' || field.type === 'checkbox') continue;
    const value = field.id
      ? await byId(page, field.id).inputValue().catch(() => '')
      : '';
    if (!value) missing.push(field.label || field.id);
  }
}

export async function applyAshby(ctx: ApplyContext): Promise<ApplyResult> {
  if (ctx.submit) {
    throw new Error('Ashby forms are submitted manually (reCAPTCHA). Use --review and click Submit yourself.');
  }
  const filled: string[] = [];
  const missing: string[] = [];
  const browser = await chromium.launch({
    executablePath: ctx.browserPath,
    headless: ctx.headless,
    args: [
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-search-engine-choice-screen',
      '--disable-blink-features=AutomationControlled',
    ],
  });

  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 1000 }, locale: 'en-GB' });
    page.setDefaultTimeout(20000);
    await page.goto(ctx.url, { waitUntil: 'load', timeout: 60000 });
    await openApplication(page, ctx.url);

    let fillError: string | null = null;
    const screenshot = join(ctx.outDir, 'ashby-form.png');
    try {
      await fillForm(page, ctx, filled, missing);
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
      await page.locator('#_systemfield_name').scrollIntoViewIfNeeded().catch(() => undefined);
      await page.bringToFront().catch(() => undefined);
      ctx.onReviewReady?.();
      const deadline = Date.now() + REVIEW_TIMEOUT_MS;
      while (Date.now() < deadline) {
        if (page.isClosed()) {
          confirmation = 'window closed before a confirmation appeared';
          break;
        }
        const body = await page.locator('body').innerText().catch(() => '');
        if (CONFIRMATION.test(body)) {
          submitted = true;
          confirmation = 'thank you page';
          await page.screenshot({ path: join(ctx.outDir, 'submitted.png'), fullPage: true }).catch(() => undefined);
          break;
        }
        await page.waitForTimeout(2000);
      }
      if (!submitted && !confirmation) confirmation = 'timed out waiting for the reviewer';
    } else {
      confirmation = null;
    }

    return { filled, missing, screenshot, submitted, needsCode: false, confirmation, fillError };
  } finally {
    await browser.close().catch(() => undefined);
  }
}
