/**
 * One "prep" run: tailor the CV, write the cover letter, fill the form.
 *
 * Used by the local web server (the button on a card) and shaped so the CLI can
 * adopt it without changing what lands on disk. Two invariants:
 *  - the fill never submits,
 *  - a step that cannot be done fails loudly instead of producing half an
 *    application.
 */

import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { getPaths } from '../storage/paths.js';
import type { Job } from '../db/types.js';
import { artifactStem } from '../cv/text.js';
import { parseCv } from '../cv/schema.js';
import type { CvDocument } from '../cv/schema.js';
import { tailorCv } from '../cv/tailor.js';
import { writeCoverLetter, lintLetter } from '../cv/letter.js';
import { renderCvPdf, type TailorPlan } from '../cv/render.js';
import { renderLetterPdf } from '../cv/letter-render.js';
import { checkFacts } from '../cv/facts.js';
import { loadApplicant, questionsFor } from './applicant.js';
import { resolveAts, SUPPORTED } from './ats.js';
import { applyGreenhouse, briefError } from './greenhouse.js';
import { resolveBrowser } from './browser.js';

export type PrepStepId = 'cv' | 'letter' | 'fill';
export type StepStatus = 'pending' | 'running' | 'done' | 'skipped' | 'failed';

export interface PrepStep {
  id: PrepStepId;
  label: string;
  status: StepStatus;
  detail?: string;
  ms?: number;
}

export interface PrepArtifacts {
  cv?: string;
  letter?: string;
}

export interface PrepResult {
  artifacts: PrepArtifacts;
  filled: string[];
  missing: string[];
  warnings: string[];
  /** True only when a human submitted in the review window and the thank-you page appeared. */
  submitted: boolean;
  confirmation: string | null;
}

export interface PrepRun {
  id: string;
  jobId: number;
  source: string;
  externalId: string;
  company: string;
  title: string;
  stage: 'running' | 'done' | 'failed';
  steps: PrepStep[];
  result?: PrepResult;
  error?: string;
  startedAt: string;
  finishedAt?: string;
  /** The review window is filled and waiting for the human to submit. */
  awaitingReview?: boolean;
  /**
   * Automation stopped early, but the window is open for the human to finish.
   * Kept separate from `error` so the run is not terminal.
   */
  fillError?: string;
}

export interface PrepOptions {
  /** Defaults to all three steps. */
  steps?: PrepStepId[];
  /** Ignore cached CV/letter and call the model again. */
  force?: boolean;
  /**
   * 'review' (default for the UI) opens a visible browser with the form filled
   * and waits for the human to submit. 'fill' is headless and never submits.
   */
  mode?: 'fill' | 'review';
}

const STEP_LABELS: Record<PrepStepId, string> = {
  cv: 'Tailor CV',
  letter: 'Cover letter',
  fill: 'Fill form',
};

const ALL_STEPS: PrepStepId[] = ['cv', 'letter', 'fill'];
const MAX_FINISHED = 50;

const runs = new Map<string, PrepRun>();
/** key -> id of the most recent run, running or finished. */
const latestByKey = new Map<string, string>();
/** Fills launch a real browser, so only one runs at a time. */
let fillQueue: Promise<unknown> = Promise.resolve();

export const prepKey = (source: string, externalId: string) => `${source}:${externalId}`;

/** A review window needs a real desktop session; SSH and services have none. */
export function hasDisplay(): boolean {
  return Boolean(process.env['DISPLAY'] || process.env['WAYLAND_DISPLAY']);
}

export function descriptionHash(description: string): string {
  return createHash('sha256').update(description ?? '').digest('hex').slice(0, 16);
}

export function artifactDir(job: Pick<Job, 'source' | 'external_id' | 'company' | 'title'>): string {
  return join(getPaths().root, 'applications', artifactStem(job.source, job.external_id, job.company, job.title));
}

/** Long JDs are truncated before the model call anyway; this is the transport cap. */
const MAX_PAYLOAD_DESCRIPTION = 60_000;

/**
 * A job the hosted snapshot knows but this database does not.
 *
 * The page sends the row it rendered, so a role that was never scanned locally
 * can still be tailored and filled. `id: 0` marks it as not local: it must
 * never be used for a database write, and the CLI hint is hidden for it.
 */
export function jobFromPayload(raw: unknown, source: string, externalId: string): Job | null {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as Record<string, unknown>;
  if (value['source'] !== source || value['external_id'] !== externalId) return null;

  const text = (key: string): string => (typeof value[key] === 'string' ? (value[key] as string) : '');
  const company = text('company').trim();
  const title = text('title').trim();
  const url = text('url').trim();
  if (!company || !title || !/^https?:\/\//i.test(url)) return null;

  return {
    id: 0,
    external_id: externalId,
    source,
    company,
    title,
    location: text('location').trim(),
    workplace_type: null,
    employment_type: null,
    url,
    description: text('description').slice(0, MAX_PAYLOAD_DESCRIPTION),
    posted_at: null,
    created_at: '',
    applied_at: null,
    tags: null,
    category: null,
    normalized_locations: null,
    extracted_workplace_type: null,
    extraction_model: null,
  };
}

export function activeRun(source: string, externalId: string): PrepRun | undefined {
  const run = latestPrep(source, externalId);
  return run?.stage === 'running' ? run : undefined;
}

export function getPrepRun(id: string): PrepRun | undefined {
  return runs.get(id);
}

export function latestPrep(source: string, externalId: string): PrepRun | undefined {
  const id = latestByKey.get(prepKey(source, externalId));
  return id ? runs.get(id) : undefined;
}

/** Finished runs, newest first — one request hydrates every card badge. */
export function finishedPreps(): PrepRun[] {
  return [...runs.values()]
    .filter((run) => run.stage !== 'running')
    .sort((a, b) => (b.finishedAt ?? '').localeCompare(a.finishedAt ?? ''))
    .slice(0, 200);
}

function loadCvDocument(): CvDocument {
  const file = join(getPaths().profileDir, 'cv.json');
  if (!existsSync(file)) throw new Error(`No CV found at ${file}.`);
  const { doc, errors } = parseCv(readFileSync(file, 'utf8'));
  if (errors.length) throw new Error(`Invalid ${file}:\n  - ${errors.join('\n  - ')}`);
  return doc;
}

interface SavedPlan {
  descriptionHash?: string;
  plan?: TailorPlan;
}

export function readPlan(dir: string): TailorPlan | null {
  return readSavedPlan(dir)?.plan ?? null;
}

function readSavedPlan(dir: string): SavedPlan | null {
  const file = join(dir, 'plan.json');
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as SavedPlan;
  } catch {
    return null;
  }
}

function planReusable(dir: string, job: Job): boolean {
  const saved = readSavedPlan(dir);
  return Boolean(
    saved?.plan && saved.descriptionHash === descriptionHash(job.description) && existsSync(join(dir, 'cv.pdf')),
  );
}

function letterReusable(dir: string): boolean {
  const letter = join(dir, 'letter.txt');
  const plan = join(dir, 'plan.json');
  return existsSync(letter) && existsSync(plan) && statSync(letter).mtimeMs >= statSync(plan).mtimeMs;
}

function assertCvFacts(rendered: string, doc: CvDocument): void {
  const check = checkFacts(rendered, doc);
  if (!check.ok) throw new Error(`CV failed the fact check: ${check.errors.join('; ')}`);
}

function step(run: PrepRun, id: PrepStepId): PrepStep {
  const found = run.steps.find((s) => s.id === id);
  if (!found) throw new Error(`step ${id} is not part of this run`);
  return found;
}

async function timed(stepRef: PrepStep, work: () => Promise<string>): Promise<void> {
  const started = Date.now();
  stepRef.status = 'running';
  try {
    stepRef.detail = await work();
    stepRef.status = 'done';
  } catch (err) {
    stepRef.status = 'failed';
    // The full Playwright call log stays in `run.error`; the step line gets the
    // one sentence a person can act on.
    stepRef.detail = briefError(err);
    throw err;
  } finally {
    stepRef.ms = Date.now() - started;
  }
}

function pruneFinished(): void {
  const finished = [...runs.values()]
    .filter((run) => run.stage !== 'running')
    .sort((a, b) => (b.finishedAt ?? '').localeCompare(a.finishedAt ?? ''));
  for (const stale of finished.slice(MAX_FINISHED)) {
    runs.delete(stale.id);
    const key = prepKey(stale.source, stale.externalId);
    if (latestByKey.get(key) === stale.id) {
      const next = finished.find((r) => r.id !== stale.id && prepKey(r.source, r.externalId) === key);
      if (next) latestByKey.set(key, next.id);
      else latestByKey.delete(key);
    }
  }
}

/**
 * Register a run and execute it in the background. The caller polls the
 * registry; nothing is awaited on the request path.
 */
export function startPrep(job: Job, options: PrepOptions = {}): PrepRun {
  const requested = new Set(options.steps ?? ALL_STEPS);
  const run: PrepRun = {
    id: randomUUID(),
    jobId: job.id,
    source: job.source,
    externalId: job.external_id,
    company: job.company,
    title: job.title,
    stage: 'running',
    steps: ALL_STEPS.map((id) => ({
      id,
      label: STEP_LABELS[id],
      status: requested.has(id) ? 'pending' : 'skipped',
      ...(requested.has(id) ? {} : { detail: 'not requested' }),
    })),
    startedAt: new Date().toISOString(),
  };
  runs.set(run.id, run);
  latestByKey.set(prepKey(job.source, job.external_id), run.id);
  pruneFinished();
  void execute(run, job, options).catch(() => undefined);
  return run;
}

async function execute(run: PrepRun, job: Job, options: PrepOptions): Promise<void> {
  const force = Boolean(options.force);
  const dir = artifactDir(job);
  const artifacts: PrepArtifacts = {};
  const warnings: string[] = [];
  let submitted = false;
  let confirmation: string | null = null;
  let filled: string[] = [];
  let missing: string[] = [];

  try {
    mkdirSync(dir, { recursive: true });
    const doc = loadCvDocument();

    const cvStep = step(run, 'cv');
    if (cvStep.status !== 'skipped') {
      await timed(cvStep, async () => {
        if (!force && planReusable(dir, job)) return 'reused cached plan';
        const tailored = await tailorCv(
          { company: job.company, title: job.title, location: job.location, description: job.description, url: job.url },
          doc,
          {},
        );
        const rendered = await renderCvPdf(doc, tailored.plan);
        assertCvFacts(rendered.text, doc);
        writeFileSync(join(dir, 'cv.pdf'), rendered.bytes);
        writeFileSync(
          join(dir, 'plan.json'),
          JSON.stringify(
            {
              job: { id: job.id, source: job.source, external_id: job.external_id, company: job.company, title: job.title },
              model: tailored.model,
              rationale: tailored.rationale,
              descriptionHash: descriptionHash(job.description),
              plan: tailored.plan,
            },
            null,
            2,
          ) + '\n',
        );
        for (const rejected of tailored.warnings) warnings.push(`rejected: ${rejected}`);
        artifacts.cv = join(dir, 'cv.pdf');
        const trimmed = rendered.dropped.length ? ` · ${rendered.dropped.length} bullet(s) trimmed` : '';
        return `${tailored.model}${trimmed}`;
      });
    }
    if (existsSync(join(dir, 'cv.pdf'))) artifacts.cv = join(dir, 'cv.pdf');

    const letterStep = step(run, 'letter');
    if (letterStep.status !== 'skipped') {
      await timed(letterStep, async () => {
        const saved = readSavedPlan(dir);
        if (!saved?.plan) throw new Error(`No tailoring plan in ${dir}`);
        if (!force && letterReusable(dir)) return 'reused cached letter';
        const letter = await writeCoverLetter(
          { company: job.company, title: job.title, location: job.location, description: job.description, url: job.url },
          doc,
          saved.plan,
          {},
        );
        for (const problem of letter.errors) warnings.push(`letter: ${problem}`);
        for (const issue of new Set(lintLetter([letter.salutation, ...letter.paragraphs].join(' ')))) {
          warnings.push(`style: ${issue}`);
        }
        const rendered = await renderLetterPdf(doc, letter);
        // The letter prints its own date; that year is not a CV claim.
        const check = checkFacts(rendered.text.split(rendered.date).join(' '), doc, { requireEmployers: false });
        if (!check.ok) throw new Error(`cover letter failed the fact check: ${check.errors.join('; ')}`);
        writeFileSync(join(dir, 'letter.pdf'), rendered.bytes);
        writeFileSync(
          join(dir, 'letter.txt'),
          [letter.salutation, ...letter.paragraphs, letter.signoff, doc.name].join('\n\n') + '\n',
        );
        artifacts.letter = join(dir, 'letter.pdf');
        return 'letter.pdf';
      });
    }

    const fillStep = step(run, 'fill');
    if (fillStep.status !== 'skipped') {
      await timed(fillStep, async () => {
        const { applicant: base, errors } = loadApplicant();
        if (errors.length) throw new Error(errors.join('\n'));
        const applicant = { ...base, questions: questionsFor(base, job.location) };
        const detected = resolveAts(job.url, job.source);
        if (!detected) throw new Error(`Could not tell which ATS ${job.url} uses`);
        if (!SUPPORTED.includes(detected)) throw new Error(`${detected} is detected but has no adapter yet`);

        const cvPath = join(dir, 'cv.pdf');
        if (!existsSync(cvPath)) throw new Error(`No tailored CV in ${dir}`);
        const letterPath = existsSync(join(dir, 'letter.pdf')) ? join(dir, 'letter.pdf') : undefined;

        const review = options.mode === 'review';
        if (review && !hasDisplay()) {
          throw new Error(
            'No desktop display for the review window. Start `jobhopper ui` from your terminal, or run `jobhopper apply ' +
              `${job.id} --review\` there.`,
          );
        }

        const launch = () =>
          applyGreenhouse({
            url: job.url,
            doc,
            applicant,
            cvPath,
            letterPath,
            browserPath: resolveBrowser(),
            headless: !review,
            submit: false,
            review,
            outDir: dir,
            onReviewReady: () => {
              run.awaitingReview = true;
            },
            onFillError: (message) => {
              // The human still gets the window; the run stays alive.
              run.fillError = message;
            },
          });

        // A review run spends most of its life idle, waiting for the human, so it
        // must not sit in the fill queue: that would block every other fill for
        // as long as the window stays open. Headless fills stay serialised.
        let result: Awaited<ReturnType<typeof applyGreenhouse>>;
        if (review) {
          result = await launch();
        } else {
          result = await new Promise<Awaited<ReturnType<typeof applyGreenhouse>>>((resolve, reject) => {
            fillQueue = fillQueue.then(async () => {
              try {
                resolve(await launch());
              } catch (err) {
                reject(err);
              }
            });
          });
        }
        run.awaitingReview = false;
        filled = result.filled;
        missing = result.missing;
        submitted = result.submitted;
        confirmation = result.confirmation;
        if (result.fillError) {
          run.fillError = result.fillError;
          warnings.push(`auto-fill stopped: ${result.fillError}`);
        }
        const blanks = result.missing.length ? ` · ${result.missing.length} left blank` : '';
        if (review) {
          if (result.submitted) return 'submitted';
          return result.fillError ? 'auto-fill stopped — not submitted' : 'not submitted';
        }
        return `${result.filled.length} filled${blanks}`;
      });
    }

    run.result = {
      artifacts,
      filled,
      missing,
      warnings,
      submitted,
      confirmation,
    };
    run.stage = 'done';
  } catch (err) {
    run.awaitingReview = false;
    run.error = err instanceof Error ? err.message : String(err);
    run.stage = 'failed';
    run.result = { artifacts, filled, missing, warnings, submitted: false, confirmation: null };
  } finally {
    run.finishedAt = new Date().toISOString();
  }
}
