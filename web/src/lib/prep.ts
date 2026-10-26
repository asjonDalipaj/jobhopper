/**
 * Client for the local prep bridge.
 *
 * The hosted build has no backend, so a card can only auto-fill when the user's
 * own `jobhopper ui` answers. Resolution order: same origin (served by the CLI),
 * then http://localhost:3333 for the Cloudflare-hosted build. Nothing here sends
 * the CV anywhere: the browser talks to the user's machine.
 */

import type { Job } from '../types';

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
  dir: string;
  cv?: string;
  letter?: string;
  letterTxt?: string;
  plan?: string;
  screenshot?: string;
}

export interface PrepResult {
  artifacts: PrepArtifacts;
  filled: string[];
  missing: string[];
  warnings: string[];
  ats: string | null;
  /** True only when the human submitted in the review window and the thank-you page appeared. */
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
}

export type PrepMode = 'fill' | 'review';

const LOCAL_ORIGIN = 'http://localhost:3333';

export const prepKey = (job: Pick<Job, 'source' | 'external_id'>) => `${job.source}:${job.external_id}`;

async function probe(base: string, timeoutMs: number): Promise<boolean> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${base}/api/status`, { signal: controller.signal, cache: 'no-store' });
    if (!res.ok) return false;
    // A static host may answer 200 with index.html for unknown paths.
    if (!(res.headers.get('content-type') ?? '').includes('application/json')) return false;
    const body = (await res.json()) as { ok?: boolean; prep?: boolean };
    return body.ok === true && body.prep === true;
  } catch {
    return false;
  } finally {
    window.clearTimeout(timer);
  }
}

let resolved: Promise<string | null> | undefined;

/** '' means same origin; a full localhost URL means the hosted-page bridge. */
export function localBase(): Promise<string | null> {
  resolved ??= (async () => {
    if (await probe('', 1500)) return '';
    if (await probe(LOCAL_ORIGIN, 2500)) return LOCAL_ORIGIN;
    return null;
  })();
  return resolved;
}

/** Forget a failed probe so a later click can retry (server started after load). */
export function resetLocalBase(): void {
  resolved = undefined;
}

async function readJson<T>(res: Response): Promise<T> {
  return (await res.json().catch(() => ({}))) as T;
}

export async function startPrep(
  base: string,
  job: Pick<Job, 'source' | 'external_id'>,
  options: { steps?: PrepStepId[]; force?: boolean; mode?: PrepMode } = {},
): Promise<PrepRun> {
  const res = await fetch(`${base}/api/prep`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ source: job.source, externalId: job.external_id, ...options }),
  });
  const body = await readJson<{ run?: PrepRun; error?: string; code?: string }>(res);
  if (res.status === 409 && body.run) return body.run;
  if (res.status === 404) {
    throw new Error('This role is not in your local database yet — run `jobhopper scan`, then retry.');
  }
  if (!res.ok || !body.run) {
    const error = new Error(body.error ?? `prep failed (HTTP ${res.status})`) as Error & { code?: string };
    error.code = body.code;
    throw error;
  }
  return body.run;
}

export async function getPrepRun(base: string, runId: string): Promise<PrepRun> {
  const res = await fetch(`${base}/api/prep/${runId}`, { cache: 'no-store' });
  const body = await readJson<{ run?: PrepRun; error?: string }>(res);
  if (!res.ok || !body.run) throw new Error(body.error ?? `could not read the run (HTTP ${res.status})`);
  return body.run;
}

export async function latestPreps(base: string): Promise<PrepRun[]> {
  const res = await fetch(`${base}/api/prep/latest`, { cache: 'no-store' });
  if (!res.ok) return [];
  const body = await readJson<{ runs?: PrepRun[] }>(res);
  return Array.isArray(body.runs) ? body.runs : [];
}

/** The last run for one job, so reopening the dialog shows it instead of restarting. */
export async function latestPrep(base: string, job: Pick<Job, 'source' | 'external_id'>): Promise<PrepRun | null> {
  const params = new URLSearchParams({ source: job.source, externalId: job.external_id });
  const res = await fetch(`${base}/api/prep/latest?${params.toString()}`, { cache: 'no-store' });
  if (!res.ok) return null;
  const body = await readJson<{ run?: PrepRun | null }>(res);
  return body.run ?? null;
}

export function artifactUrl(
  base: string,
  job: Pick<Job, 'source' | 'external_id'>,
  file: 'cv.pdf' | 'letter.pdf' | 'letter.txt' | 'form.png' | 'plan.json',
): string {
  const params = new URLSearchParams({ source: job.source, externalId: job.external_id, file });
  return `${base}/api/artifacts?${params.toString()}`;
}
