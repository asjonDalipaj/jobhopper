/**
 * Greenhouse form filler.
 *
 * The form is a React app: text inputs have stable ids, but the question ids
 * change per board, so everything except resume/cover letter is found by label.
 * Nothing here clicks Submit unless the caller asked for it.
 */

import { chromium, type Locator, type Page } from 'playwright-core';
import { basename, join } from 'node:path';
import type { CvDocument } from '../cv/schema.js';
import type { Applicant } from './applicant.js';
import { splitName } from './applicant.js';

export interface ApplyContext {
  url: string;
  doc: CvDocument;
  applicant: Applicant;
  cvPath: string;
  letterPath?: string;
  browserPath: string;
  headless: boolean;
  submit: boolean;
  /**
   * Fill, then keep the window open so a person can review and submit it
   * themselves. The tool never clicks Submit in this mode; it only watches for
   * the confirmation page (or the window closing) so the outcome is recorded.
   */
  review?: boolean;
  outDir: string;
  /** Called once the form is filled and the review window is waiting on a human. */
  onReviewReady?: () => void;
  /**
   * Called instead of throwing when a step fails in review mode, so the caller
   * can report what stopped while the human finishes the form.
   */
  onFillError?: (message: string) => void;
  /** Called only when the form demands an emailed verification code. */
  askCode?: () => Promise<string>;
}

export interface ApplyResult {
  filled: string[];
  missing: string[];
  screenshot: string;
  submitted: boolean;
  needsCode: boolean;
  confirmation: string | null;
  /** Set when automation stopped early and a human was handed the form. */
  fillError: string | null;
}

/**
 * Playwright errors carry a multi-kilobyte call log. The first line is the
 * message; the rest is noise a person cannot act on.
 */
export function briefError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  const line = raw.split('\n').map((part) => part.trim()).find(Boolean) ?? raw;
  return line.length > 240 ? `${line.slice(0, 237)}…` : line;
}

const SELECT_CONTROL = '[class*="select__option"]';


/**
 * Custom-hosted Greenhouse boards (jobs.elastic.co, n26.com, datadoghq.com …)
 * keep the real form on job-boards.greenhouse.io/embed/job_app. Find it: on the
 * page, in an embed iframe, or behind the Apply link/button. Ends on the page
 * that holds the standard form; the caller's normal mount wait does the rest.
 */
async function openApplicationForm(page: Page): Promise<void> {
  const embedSrc = async (): Promise<string | null> => {
    const iframe = page.locator('iframe[src*="/embed/job_app"]').first();
    if (!(await iframe.count())) return null;
    const src = await iframe.getAttribute('src');
    return src ? new URL(src, page.url()).toString() : null;
  };

  const attempt = async (): Promise<boolean> => {
    if (await page.locator('#first_name').count()) return true;

    const embed = await embedSrc();
    if (embed) {
      await page.goto(embed, { waitUntil: 'load', timeout: 60000 });
      return true;
    }

    // Prefer an Apply link that points at a form; nav links say "Apply" too.
    const applyLinks = page.locator('a', { hasText: /^apply\b/i });
    const linkCount = await applyLinks.count();
    for (let i = 0; i < linkCount; i += 1) {
      const href = await applyLinks.nth(i).getAttribute('href').catch(() => null);
      if (!href || !/(form|apply|gh_jid|greenhouse)/i.test(href)) continue;
      await page.goto(new URL(href, page.url()).toString(), { waitUntil: 'load', timeout: 60000 });
      if (await page.locator('#first_name').count()) return true;
      const afterLink = await embedSrc();
      if (afterLink) {
        await page.goto(afterLink, { waitUntil: 'load', timeout: 60000 });
        return true;
      }
      return false;
    }

    // Last resort: a JS-driven Apply button (Okta, Stripe …). In-page only.
    const button = page.locator('button', { hasText: /^apply\b/i }).first();
    if (await button.count()) {
      await button.click({ timeout: 5000 }).catch(() => undefined);
      await page.waitForTimeout(2500);
      if (await page.locator('#first_name').count()) return true;
      const afterButton = await embedSrc();
      if (afterButton) {
        await page.goto(afterButton, { waitUntil: 'load', timeout: 60000 });
        return true;
      }
    }
    return false;
  };

  if (await attempt()) return;
  // Client-rendered careers pages mount the Apply link after the first paint.
  await page.waitForTimeout(3000);
  await attempt();
}

async function labelFor(page: Page, pattern: RegExp): Promise<string | null> {
  const labels = page.locator('label').filter({ hasText: pattern });
  const count = await labels.count();
  for (let i = 0; i < count; i += 1) {
    const id = await labels.nth(i).getAttribute('for');
    if (id) return id;
  }
  return null;
}

/** Open a react-select by input id, type, and click the first option matching `wanted`. */
async function pickOption(page: Page, inputId: string, wanted: RegExp, typed?: string): Promise<string | null> {
  await page.click(`[id="${inputId}"]`, { force: true });
  await page.waitForTimeout(300);
  if (typed) {
    await page.keyboard.type(typed, { delay: 30 });
    await page.waitForTimeout(800);
  }
  const options = page.locator(SELECT_CONTROL);
  const texts = await options.allInnerTexts();
  const index = texts.findIndex((text) => wanted.test(text));
  if (index < 0) {
    await page.keyboard.press('Escape');
    return null;
  }
  await options.nth(index).click();
  await page.waitForTimeout(300);
  await page.keyboard.press('Escape');
  return texts[index] ?? null;
}

async function checkByLabel(page: Page, pattern: RegExp): Promise<boolean> {
  const id = await labelFor(page, pattern);
  if (!id) return false;
  const box = page.locator(`[id="${id}"]`);
  if (!(await box.count())) return false;
  // Labels are matched by loose text, so a question that merely mentions the
  // word (e.g. "on-site at our Amsterdam office") must not be ticked as if it
  // were the checkbox it looks like.
  const type = await box.getAttribute('type');
  if (type !== 'checkbox' && type !== 'radio') return false;
  await box.check().catch(() => {});
  return box.isChecked().catch(() => false);
}

const sleep = (page: Page, ms: number) => page.waitForTimeout(ms);

const digits = (value: string) => value.replace(/\D/g, '');

/** Phone widgets reformat as you select a country (and add a trunk 0), so
 * compare digits with that one prefix difference tolerated. */
export function sameValue(id: string, expected: string, actual: string): boolean {
  if (id !== 'phone') return actual.trim() === expected.trim();
  const a = digits(actual);
  const e = digits(expected);
  return a === e || a === `0${e}` || e === `0${a}`;
}

/**
 * Set a controlled input the way a person would (real key events) and read it
 * back. React restores empty state over values set before its next render, so a
 * single fill without readback can lose data silently.
 */
async function setText(page: Page, id: string, value: string): Promise<boolean> {
  const input = page.locator(`[id="${id}"]`);
  if (!(await input.count())) return false;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await input.click({ timeout: 5000 }).catch(() => {});
    await page.keyboard.press('Control+A');
    await page.keyboard.type(value, { delay: 10 });
    await sleep(page, 300);
    if (sameValue(id, value, await input.inputValue())) {
      // Long answers leave the textarea scrolled to its last line; show the
      // reviewer the opening sentence instead.
      await input.evaluate((el) => ((el as unknown as { scrollTop: number }).scrollTop = 0)).catch(() => {});
      return true;
    }
  }
  return false;
}

async function readText(page: Page, id: string): Promise<string | null> {
  const input = page.locator(`[id="${id}"]`);
  return (await input.count()) ? input.inputValue() : null;
}

/**
 * Greenhouse only registers a file through its "Attach" button. Setting the
 * hidden input directly leaves the bytes in the DOM but never uploads them: no
 * chip appears and the submission would carry no file.
 */
async function attachFile(page: Page, kind: 'resume' | 'cover_letter', file: string): Promise<boolean> {
  const name = basename(file);
  const hasChip = async () => (await page.locator('body').innerText()).includes(name);
  if (await hasChip()) return true;

  const button = page
    .locator(`#${kind}`)
    .locator('xpath=ancestor::div[.//button[normalize-space()="Attach"]][1]//button[normalize-space()="Attach"]')
    .first();

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const [chooser] = await Promise.all([
        page.waitForEvent('filechooser', { timeout: 6000 }),
        button.click({ timeout: 5000 }),
      ]);
      await chooser.setFiles(file);
    } catch {
      await page.setInputFiles(`#${kind}`, file).catch(() => {});
    }
    for (let tick = 0; tick < 16; tick += 1) {
      await sleep(page, 500);
      if (await hasChip()) return true;
    }
  }
  return false;
}

/** The country field is a react-select: type the name, click the exact option. */
async function pickCountry(page: Page, country: string): Promise<string | null> {
  const input = page.locator('#country');
  if (!(await input.count())) return null;
  const exact = new RegExp(`^${country}\\b`, 'i');
  const shown = await page.locator('[class*="select__single-value"]').first().innerText().catch(() => '');
  if (exact.test(shown.trim())) return shown.trim();

  await input.click({ force: true });
  await sleep(page, 300);
  await page.keyboard.type(country, { delay: 40 });
  await sleep(page, 800);
  // The phone widget renders 150+ hidden <li role="option"> country rows, so a
  // bare [role="option"] match lands on one of those (iti__country) and the
  // click times out on an invisible element. Only the open react-select menu
  // can hold the option we actually want.
  const options = page.locator('[class*="select__menu"] [role="option"], [class*="select__option"]');
  const count = await options.count();
  let chosen: Locator | null = null;
  let label = '';
  for (let i = 0; i < count; i += 1) {
    const option = options.nth(i);
    const text = (await option.innerText().catch(() => '')).trim();
    if (!exact.test(text)) continue;
    if (!(await option.isVisible().catch(() => false))) continue;
    chosen = option;
    label = text;
    break;
  }
  if (!chosen) {
    await page.keyboard.press('Escape');
    return null;
  }
  await chosen.click({ timeout: 5000 }).catch(() => undefined);
  await page.keyboard.press('Escape');
  await sleep(page, 300);
  return label;
}

/** The label a react-select actually stores, as opposed to its search input. */
async function selectValue(page: Page, id: string): Promise<string> {
  const value = page
    .locator(`[id="${id}"]`)
    .locator('xpath=ancestor::div[.//div[contains(@class,"select__single-value")]][1]//div[contains(@class,"select__single-value")]')
    .first();
  return (await value.count()) ? (await value.innerText().catch(() => '')).trim() : '';
}

/**
 * "Location (City)" is a react-select address autocomplete: typing only filters,
 * the picked suggestion is what the form stores, and blurring without a pick
 * drops the text. The committed label lives in the select's single-value node.
 */
async function cityCommitted(page: Page, city: string): Promise<boolean> {
  const text = (await selectValue(page, 'candidate-location')).toLowerCase();
  return text.startsWith(city.toLowerCase());
}

async function fillCity(page: Page, city: string): Promise<boolean> {
  const input = page.locator('#candidate-location');
  if (!(await input.count())) return false;
  if (await cityCommitted(page, city)) return true;

  await input.click({ timeout: 5000 }).catch(() => {});
  await page.keyboard.type(city, { delay: 30 });
  await sleep(page, 1200);

  const options = page.locator('[role="listbox"]:not([id*="iti"]) [role="option"]');
  const texts = await options.allInnerTexts().catch(() => []);
  const index = texts.findIndex((text) => text.trim().toLowerCase().startsWith(city.toLowerCase()));
  if (index < 0) return false;
  await options.nth(index).click();
  await sleep(page, 600);
  return cityCommitted(page, city);
}

/** Answers are typed into a filter box and matched against option labels, so
 * punctuation in a real answer ("EU/EEA/Swiss citizen (No permit required).")
 * must be escaped before it can be a pattern. */
const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Fixed answers for board-specific questions, matched on the label text. Only
 * questions the profile declares are answered; anything else stays blank and is
 * reported by requiredUnanswered rather than guessed.
 */
/**
 * Checkbox groups ("How should we communicate with you?") have no label[for],
 * so match the question text and the option text, then tick that option.
 */
async function groupOption(page: Page, question: RegExp, answer: string): Promise<Locator | null> {
  const option = new RegExp(`^${escapeRegex(answer)}$`, 'i');
  // Nested wrappers match too; document order puts the innermost block last.
  const group = page
    .locator('div', { hasText: question })
    .filter({ has: page.locator('label', { hasText: option }) })
    .last();
  if (!(await group.count())) return null;
  const id = await group.locator('label', { hasText: option }).first().getAttribute('for');
  return id ? page.locator(`[id="${id}"]`) : null;
}

async function answerQuestions(
  page: Page,
  questions: Array<{ match: string; answer: string }>,
  filled: string[],
  missing: string[],
): Promise<void> {
  for (const question of questions) {
    const id = await labelFor(page, new RegExp(question.match, 'i'));
    if (!id) {
      const box = await groupOption(page, new RegExp(question.match, 'i'), question.answer);
      if (box) {
        await box.check().catch(() => undefined);
        (await box.isChecked().catch(() => false))
          ? filled.push(`answer: ${question.match} → ${question.answer}`)
          : missing.push(`answer: ${question.match} → ${question.answer}`);
      }
      continue;
    }
    const field = page.locator(`[id="${id}"]`);
    if (!(await field.count())) continue;

    const type = await field.getAttribute('type');
    const classes = (await field.getAttribute('class')) ?? '';
    let ok = false;
    if (type === 'checkbox' || type === 'radio') {
      if (/^(yes|true)$/i.test(question.answer)) {
        await field.check().catch(() => {});
        ok = await field.isChecked().catch(() => false);
      } else {
        ok = !(await field.isChecked().catch(() => true));
      }
    } else if (classes.includes('select__input')) {
      await pickOption(page, id, new RegExp(`^${escapeRegex(question.answer)}`, 'i'), question.answer);
      ok = (await selectValue(page, id)).toLowerCase() === question.answer.toLowerCase();
    } else {
      ok = await setText(page, id, question.answer);
    }

    if (ok) filled.push(`answer: ${question.match} → ${question.answer}`);
    else missing.push(`answer: ${question.match} (${question.answer})`);
  }
}

/**
 * Questions the form marks required but left empty. Reported, never guessed:
 * visa and office-attendance answers belong to the applicant, not the filler.
 */
/**
 * Required checkbox groups ("How should we communicate with you?") have no
 * label[for], so the label scan cannot see them. For every visible checkbox,
 * the nearest ancestor whose text carries an asterisk is the group block;
 * report its header when nothing inside is ticked.
 */
async function requiredGroupsUnanswered(page: Page): Promise<string[]> {
  const out = new Set<string>();
  const boxes = page.locator('input[type="checkbox"]:visible');
  const count = await boxes.count();
  for (let i = 0; i < count; i += 1) {
    const group = boxes.nth(i).locator('xpath=ancestor::div[contains(., "*")][1]');
    if (!(await group.count())) continue;
    const header = (((await group.innerText().catch(() => '')) ?? '').split('\n')[0] ?? '').trim();
    if (!/\*\s*$/.test(header) || out.has(header)) continue;
    if ((await group.locator('input[type="checkbox"]:checked').count()) > 0) continue;
    out.add(header.replace(/\s*\*$/, ''));
  }
  return [...out];
}

async function requiredUnanswered(page: Page, skipIds: string[]): Promise<string[]> {
  const out: string[] = [];
  const labels = page.locator('label');
  const count = await labels.count();
  for (let i = 0; i < count; i += 1) {
    const label = labels.nth(i);
    const text = ((await label.textContent().catch(() => '')) ?? '').trim();
    if (!text.includes('*')) continue;
    const id = await label.getAttribute('for');
    if (!id || skipIds.includes(id)) continue;
    const field = page.locator(`[id="${id}"]`);
    if (!(await field.count()) || !(await field.isVisible().catch(() => false))) continue;
    // Greenhouse marks optional questions (the demographic survey) with
    // aria-required="false" even though their labels carry an asterisk.
    if ((await field.getAttribute('aria-required')) === 'false') continue;
    const type = await field.getAttribute('type');
    const classes = (await field.getAttribute('class')) ?? '';
    const selected = classes.includes('select__input') ? await selectValue(page, id) : '';
    const answered =
      type === 'checkbox' || type === 'radio'
        ? await field.isChecked().catch(() => false)
        : classes.includes('select__input')
          ? selected !== '' && !/^select\.{0,3}$/i.test(selected)
          : ((await field.inputValue().catch(() => '')) ?? '').trim() !== '';
    if (!answered) out.push(text.replace(/\s*\*$/, ''));
  }
  return [...new Set([...out, ...(await requiredGroupsUnanswered(page))])].slice(0, 8);
}

const CONFIRMATION = /thank you for applying|application (has been )?(submitted|received)|thanks for applying/i;
/** Confirmation pages often announce themselves in the path before the body settles. */
const CONFIRMATION_URL = /(\/|_)(confirmation|thank[-_]?you|applied)(\/|$|\?)/i;

/**
 * Watch a form a person is reviewing. Nothing is clicked here: the loop only
 * polls for the confirmation page and for the window disappearing, so a human
 * submission is observed rather than performed.
 */
async function waitForOperator(
  page: Page,
  outDir: string,
  timeoutMs = 45 * 60_000,
): Promise<{ submitted: boolean; needsCode: boolean; confirmation: string }> {
  const deadline = Date.now() + timeoutMs;
  let needsCode = false;
  let lastUrl = '';
  const captured = async (): Promise<string> => {
    await page.screenshot({ path: join(outDir, 'submitted.png'), fullPage: true }).catch(() => {});
    return 'thank you page';
  };
  while (Date.now() < deadline) {
    if (page.isClosed()) {
      return {
        submitted: false,
        needsCode,
        confirmation: `window closed before a confirmation appeared (last page: ${lastUrl || 'unknown'})`,
      };
    }
    lastUrl = (() => {
      try {
        return page.url();
      } catch {
        return lastUrl;
      }
    })();
    const body = await page.locator('body').innerText().catch(() => '');
    if (CONFIRMATION.test(body) || CONFIRMATION_URL.test(lastUrl)) {
      return { submitted: true, needsCode, confirmation: await captured() };
    }
    if (/verification code/i.test(body)) needsCode = true;
    await page.waitForTimeout(1500).catch(() => {});
  }
  return { submitted: false, needsCode, confirmation: 'timed out waiting for the reviewer' };
}

/**
 * Fill every field the profile can answer.
 *
 * Throws on the first step that cannot complete: the caller decides whether
 * that is fatal (headless) or a hand-off to a human who can finish the form.
 */
async function fillApplicationForm(
  page: Page,
  ctx: ApplyContext,
  filled: string[],
  missing: string[],
): Promise<void> {
  const { first, last } = splitName(ctx.doc.name);

  // The form hydrates after first paint; anything typed before that is wiped by
  // the next render. Files go first (attaching triggers that render), then text,
  // then every value is read back before we believe it.
  await page.waitForLoadState('networkidle').catch(() => {});
  await sleep(page, 800);

  const cvAttached = await attachFile(page, 'resume', ctx.cvPath);
  // Not every board asks for a letter; a missing field is not a blank.
  const asksForLetter = (await page.locator('#cover_letter').count()) > 0;
  const letterAttached = ctx.letterPath && asksForLetter ? await attachFile(page, 'cover_letter', ctx.letterPath) : false;

  // Country before the text fields: its re-render clears the city input, and the
  // phone widget needs the dial code before it will format the national number.
  const country = await pickCountry(page, ctx.applicant.country);

  const texts: Array<{ id: string; value: string; label: string }> = [
    { id: 'first_name', value: first, label: 'first name' },
    { id: 'last_name', value: last, label: 'last name' },
    { id: 'email', value: ctx.doc.contact.email, label: 'email' },
  ];
  if (await page.locator('#preferred_name').count()) {
    texts.push({ id: 'preferred_name', value: first.split(/\s+/)[0] ?? first, label: 'preferred first name' });
  }
  if (ctx.applicant.phoneNational) {
    texts.push({ id: 'phone', value: ctx.applicant.phoneNational, label: 'phone' });
  } else {
    missing.push('phone (set phoneNational in profile/applicant.json)');
  }
  const links: Array<[RegExp, string, string]> = [
    [/linkedin/i, ctx.doc.contact.linkedin ?? '', 'LinkedIn'],
    [/(website|portfolio|github)/i, ctx.doc.contact.github ?? '', 'website/GitHub'],
  ];
  const linkIds: string[] = [];
  const bodyText = await page.locator('body').innerText();
  for (const [pattern, value, label] of links) {
    if (!value) continue;
    const id = await labelFor(page, pattern);
    if (!id) {
      // Only report a link as blank when the form actually has that field.
      if (bodyText.includes(label.split('/')[0] as string)) missing.push(label);
      continue;
    }
    linkIds.push(id);
    texts.push({ id, value: value.startsWith('http') ? value : `https://${value}`, label });
  }

  for (const field of texts) await setText(page, field.id, field.value);

  const hearId = await labelFor(page, /how did you hear/i);
  if (hearId) {
    const picked = await pickOption(page, hearId, new RegExp(ctx.applicant.howDidYouHear, 'i'), ctx.applicant.howDidYouHear);
    if (picked) filled.push(`heard via (${picked})`);
    else missing.push('how did you hear');
  }

  // Only boards that actually ask for a preferred location get the checkbox;
  // "Amsterdam" also appears in the on-site question on other forms.
  const asksLocation = (await page.locator('body').innerText()).includes('Preferred location');
  if (asksLocation) {
    if (await checkByLabel(page, new RegExp(ctx.applicant.preferredLocation, 'i'))) {
      filled.push(`location (${ctx.applicant.preferredLocation})`);
    } else {
      missing.push('preferred location');
    }
  }

  if (ctx.applicant.consentRetention) {
    // Prefer Greenhouse's retention box by id: a broad "consent" label also
    // matches demographic-survey consents, which we deliberately leave alone.
    const gdpr = page.locator('[id^="gdpr_retention_consent"]').first();
    const hasBox = (await gdpr.count()) > 0 || Boolean(await labelFor(page, /retain my data/i));
    if (hasBox) {
      let checked = false;
      if (await gdpr.count()) {
        await gdpr.check({ force: true }).catch(() => undefined);
        if (!(await gdpr.isChecked().catch(() => false))) {
          const id = await gdpr.getAttribute('id');
          if (id) await page.locator(`label[for="${id}"]`).click({ force: true }).catch(() => undefined);
        }
        checked = await gdpr.isChecked().catch(() => false);
      } else {
        checked = await checkByLabel(page, /retain my data/i);
      }
      (checked ? filled : missing).push('retention consent');
    }
  }

  // City last: picking its suggestion re-renders the form, so it must not be
  // able to disturb the fields that the readback then checks.
  const city = ctx.applicant.city ?? ctx.applicant.preferredLocation;
  const cityFilled = (await page.locator('#candidate-location').count()) ? await fillCity(page, city) : false;

  // Profile answers for board-specific questions (visa, office days). Runs
  // before the readback so any re-render it triggers is repaired below.
  await answerQuestions(page, ctx.applicant.questions ?? [], filled, missing);

  // Readback pass: whatever a late re-render dropped is set once more, then
  // reported as it really is. Earlier steps never count as proof.
  await sleep(page, 500);
  for (const field of texts) {
    let ok = sameValue(field.id, field.value, (await readText(page, field.id)) ?? '');
    if (!ok && (await setText(page, field.id, field.value))) {
      ok = sameValue(field.id, field.value, (await readText(page, field.id)) ?? '');
    }
    (ok ? filled : missing).push(ok ? field.label : `${field.label} (reverted after fill)`);
  }

  if (await page.locator('#candidate-location').count()) {
    (cityFilled ? filled : missing).push(cityFilled ? `location (city: ${city})` : `location (city: ${city} not committed)`);
  }

  (country ? filled : missing).push(country ? `country (${country})` : 'country');
  (cvAttached ? filled : missing).push(cvAttached ? 'CV' : 'CV (upload did not register)');
  if (ctx.letterPath && asksForLetter) {
    (letterAttached ? filled : missing).push(letterAttached ? 'cover letter' : 'cover letter (upload did not register)');
  }

  // Required questions we have no answer source for (visa, office days) are
  // blockers, not silent omissions.
  const managed = ['first_name', 'last_name', 'email', 'phone', 'country', 'candidate-location', 'resume', 'cover_letter', hearId ?? '', ...linkIds];
  for (const label of await requiredUnanswered(page, managed)) missing.push(`required: ${label}`);

  await page.waitForTimeout(300);
}

export async function applyGreenhouse(ctx: ApplyContext): Promise<ApplyResult> {
  const filled: string[] = [];
  const missing: string[] = [];

  const browser = await chromium.launch({
    executablePath: ctx.browserPath,
    headless: ctx.headless,
    // A headed review window is useless behind Brave's first-run prompts.
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
    await openApplicationForm(page);

    // The form is React-rendered below the posting, so give it time to mount
    // and nudge the page in case it renders on scroll.
    let mounted = true;
    try {
      await page.waitForSelector('#first_name', { timeout: 25000 });
    } catch {
      mounted = false;
    }
    if (!mounted) {
      await page.mouse.wheel(0, 4000);
      try {
        await page.waitForSelector('#first_name', { timeout: 15000 });
        mounted = true;
      } catch {
        mounted = false;
      }
    }
    if (!mounted) {
      const body = await page.locator('body').innerText();
      if (/no longer open|position (is )?closed|no longer accepting/i.test(body)) {
        throw new Error(`posting is closed: ${ctx.url}`);
      }
      throw new Error(`no application form found at ${ctx.url}. The board may serve this job without an inline form.`);
    }

    let fillError: string | null = null;
    let screenshot = join(ctx.outDir, 'form.png');

    try {
      await fillApplicationForm(page, ctx, filled, missing);
      await page.screenshot({ path: screenshot, fullPage: true });
    } catch (err) {
      // A half-filled form is still worth a human's time: in review mode the
      // window stays open and they finish what automation could not. Headless
      // and auto-submit runs still fail loudly - nobody is there to repair them.
      if (!ctx.review || ctx.submit) throw err;
      fillError = briefError(err);
      ctx.onFillError?.(fillError);
      await page.screenshot({ path: screenshot, fullPage: true }).catch(() => undefined);
    }

    let submitted = false;
    let needsCode = false;
    let confirmation: string | null = null;

    if (ctx.review) {
      // Land the reviewer at the top of the form, not wherever the last field
      // left the page scrolled.
      await page.locator('#first_name').scrollIntoViewIfNeeded().catch(() => {});
      await page.bringToFront().catch(() => {});
      ctx.onReviewReady?.();
      const outcome = await waitForOperator(page, ctx.outDir);
      submitted = outcome.submitted;
      needsCode = outcome.needsCode;
      confirmation = outcome.confirmation;
    }

    if (ctx.submit) {
      await page.getByRole('button', { name: /submit application/i }).click();
      await page.waitForTimeout(8000);
      const body = await page.locator('body').innerText();
      needsCode = /verification code/i.test(body);

      if (needsCode && ctx.askCode) {
        const code = (await ctx.askCode()).trim();
        const boxes = page.locator('input[maxlength="1"]');
        const boxCount = await boxes.count();
        if (boxCount >= code.length) {
          await boxes.first().click();
          for (const char of code) await page.keyboard.type(char, { delay: 90 });
        } else {
          await page.locator('input[autocomplete="one-time-code"], input[name*="code"]').first().fill(code);
        }
        await page.waitForTimeout(800);
        await page.getByRole('button', { name: /submit application/i }).click();
        await page.waitForTimeout(9000);
      }

      const after = await page.locator('body').innerText();
      submitted = /thank you for applying|application (has been )?(submitted|received)/i.test(after);
      confirmation = submitted ? 'thank you page' : needsCode ? 'waiting for verification code' : 'no confirmation detected';
      await page.screenshot({ path: join(ctx.outDir, 'submitted.png'), fullPage: true });
    }

    return {
      filled: [...new Set(filled)],
      missing: [...new Set(missing)],
      screenshot,
      submitted,
      needsCode,
      confirmation,
      fillError,
    };
  } finally {
    await browser.close();
  }
}
