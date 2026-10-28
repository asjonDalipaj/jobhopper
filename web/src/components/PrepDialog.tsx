import React, { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import {
  AlertTriangle,
  Check,
  Circle,
  ClipboardCopy,
  ExternalLink,
  FileText,
  Loader2,
  MonitorUp,
  RefreshCw,
  X,
} from 'lucide-react';
import type { Job } from '../types';
import { artifactUrl, getPrepRun, latestPrep, startPrep, type PrepRun, type PrepStep } from '../lib/prep';
import { Fireworks } from './Fireworks';

interface PrepDialogProps {
  job: Job;
  /** Local bridge origin: '' for same origin, or the resolved localhost URL. */
  base: string;
  onClose: () => void;
  /** Called on every run update so the card badge can follow along. */
  onRun: (run: PrepRun) => void;
}

function StepIcon({ status }: { status: PrepStep['status'] }) {
  if (status === 'running') return <Loader2 className="h-4 w-4 animate-spin text-teal" aria-hidden="true" />;
  if (status === 'done') return <Check className="h-4 w-4 text-ink" aria-hidden="true" />;
  if (status === 'failed') return <AlertTriangle className="h-4 w-4 text-coral" aria-hidden="true" />;
  return <Circle className="h-3.5 w-3.5 text-ink-faint" aria-hidden="true" />;
}

/**
 * One action: tailor the CV, write the letter, open the filled form in a browser
 * window, and wait for the human to submit it. The tool never clicks Submit.
 */
export const PrepDialog: React.FC<PrepDialogProps> = ({ job, base, onClose, onRun }) => {
  const [run, setRun] = useState<PrepRun | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [noDisplay, setNoDisplay] = useState(false);
  const [starting, setStarting] = useState(true);
  const [copied, setCopied] = useState(false);

  // The parent recreates its callback every render; the start/poll effects must
  // not restart on that, or they would re-run the whole prep in a loop.
  const onRunRef = useRef(onRun);
  useEffect(() => {
    onRunRef.current = onRun;
  }, [onRun]);

  const command = `node dist/cli/index.js apply ${job.id} --review`;

  const begin = useCallback(
    async (options: { steps?: ('cv' | 'letter' | 'fill')[]; force?: boolean; mode?: 'fill' | 'review' }) => {
      setError(null);
      setNoDisplay(false);
      setStarting(true);
      try {
        const started = await startPrep(base, job, options);
        setRun(started);
        // Let the card show "running"/"waiting" even if the dialog is closed.
        onRunRef.current(started);
      } catch (err) {
        const failure = err as Error & { code?: string };
        if (failure.code === 'no-display') setNoDisplay(true);
        setError(failure.message);
      } finally {
        setStarting(false);
      }
    },
    [base, job],
  );

  // Reopening a job must show what already happened (including "Submitted")
  // rather than immediately opening another review window.
  const mounted = useRef(false);
  useEffect(() => {
    if (mounted.current) return;
    mounted.current = true;
    void latestPrep(base, job)
      .then((last) => {
        if (last) {
          setRun(last);
          onRunRef.current(last);
          setStarting(false);
        } else {
          void begin({ mode: 'review' });
        }
      })
      .catch(() => {
        void begin({ mode: 'review' });
      });
  }, [base, job, begin]);

  // The window stays open until the human submits (or 45 min pass), so poll
  // gently while waiting and faster while the fields are being filled.
  useEffect(() => {
    if (!run || run.stage !== 'running') return;
    const timer = window.setInterval(
      () => {
        void getPrepRun(base, run.id)
          .then((next) => {
            setRun(next);
            onRunRef.current(next);
          })
          .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));
      },
      run.awaitingReview ? 1500 : 700,
    );
    return () => window.clearInterval(timer);
  }, [base, run]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const result = run?.result;
  const done = run?.stage === 'done';
  const submitted = Boolean(result?.submitted);

  /** Server messages are already one line; run.error can still be a call log. */
  const firstLine = (text: string) => {
    const line = text.split('\n').map((part) => part.trim()).find(Boolean) ?? text;
    return line.length > 240 ? `${line.slice(0, 237)}…` : line;
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-0 backdrop-blur-sm sm:items-center sm:p-6"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: 32, opacity: 0, scale: 0.99 }}
        animate={{ y: 0, opacity: 1, scale: 1 }}
        exit={{ y: 24, opacity: 0 }}
        transition={{ duration: 0.18 }}
        role="dialog"
        aria-modal="true"
        aria-label={`Apply with auto-fill: ${job.title}`}
        className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-t-3xl border border-ink/10 bg-surface p-5 shadow-2xl sm:rounded-3xl sm:p-6"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-faint">Apply with auto-fill</p>
            <h2 className="mt-1 text-lg font-semibold leading-snug text-ink">{job.title}</h2>
            <p className="mt-0.5 text-sm text-ink-soft">{job.company} · {job.location}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 rounded-xl border border-ink/15 bg-white/60 p-2 text-ink-soft transition-colors hover:text-ink"
            autoFocus
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-5 space-y-2" aria-live="polite">
          {(run?.steps ?? []).map((step) => (
            <div key={step.id} className="flex items-start gap-3 rounded-xl bg-white/60 px-3 py-2.5">
              <span className="mt-0.5"><StepIcon status={step.status} /></span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-ink">{step.label}</p>
                {(() => {
                  const detail =
                    step.id === 'fill' && run?.awaitingReview
                      ? run.fillError
                        ? 'auto-fill stopped — the form is open, finish it yourself'
                        : 'window open — waiting for you to submit'
                      : step.detail;
                  if (!detail) return null;
                  return (
                    <p className={`mt-0.5 break-words text-xs ${step.status === 'failed' ? 'text-coral' : 'text-ink-soft'}`}>
                      {detail}
                      {typeof step.ms === 'number' && step.ms > 0 ? ` · ${(step.ms / 1000).toFixed(0)}s` : ''}
                    </p>
                  );
                })()}
              </div>
            </div>
          ))}
        </div>

        {starting && (
          <div className="flex items-center gap-3 rounded-xl bg-white/60 px-3 py-2.5 text-sm text-ink-soft">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Starting…
          </div>
        )}

        {run?.awaitingReview && (
          <div className={`mt-5 flex items-start gap-3 rounded-xl border px-3 py-3 ${run.fillError ? 'border-coral/40 bg-coral/10' : 'border-teal/30 bg-teal/10'}`}>
            <MonitorUp className={`mt-0.5 h-4 w-4 shrink-0 ${run.fillError ? 'text-coral' : 'text-teal'}`} aria-hidden="true" />
            <div>
              <p className="text-sm font-semibold text-ink">
                {run.fillError ? 'The form is open, but auto-fill stopped' : 'The form is open in your browser'}
              </p>
              <p className="mt-1 text-sm leading-6 text-ink-soft">
                {run.fillError ? (
                  <>
                    <span className="font-medium text-ink">{run.fillError}</span> — finish the rest by hand; the CV and letter are attached.
                    Then click <span className="font-medium text-ink">Submit Application</span> and this panel will record it.
                  </>
                ) : (
                  <>
                    Check every field — the CV and letter are attached — then click <span className="font-medium text-ink">Submit Application</span> there.
                    This panel updates when the confirmation page appears.
                  </>
                )}
              </p>
              {run.fillError && (
                <p className="mt-1 text-xs text-ink-faint">
                  Rather start over? Close the browser window — this panel will then offer <span className="font-medium">Open the form again</span>.
                </p>
              )}
            </div>
          </div>
        )}

        {error && (
          <div className="mt-4 flex items-start gap-2 rounded-xl border border-coral/40 bg-coral/10 px-3 py-2.5 text-sm text-ink">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-coral" aria-hidden="true" />
            <span className="break-words">{error}</span>
          </div>
        )}

        {noDisplay && (
          <div className="mt-3 rounded-xl bg-white/70 p-3">
            <p className="text-xs text-ink-soft">No window from this server. Run it yourself instead:</p>
            <pre className="mt-2 overflow-x-auto rounded-lg bg-ink px-3 py-2 text-xs text-surface">{command}</pre>
            <button
              type="button"
              onClick={() => void copy()}
              className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-ink/20 bg-white px-2.5 py-1.5 text-xs font-medium text-ink"
            >
              <ClipboardCopy className="h-3.5 w-3.5" /> {copied ? 'Copied' : 'Copy command'}
            </button>
          </div>
        )}

        {done && result && (
          <div className="mt-5 space-y-4 border-t border-ink/10 pt-4">
            {submitted ? (
              <div className="relative overflow-hidden rounded-xl border border-mint/60 bg-mint/25">
                <Fireworks />
                <div className="relative flex items-start gap-3 px-3 py-4">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-ink" aria-hidden="true" />
                  <div>
                    <p className="text-sm font-semibold text-ink">Submitted</p>
                    <p className="mt-0.5 text-sm text-ink-soft">It is on your applied list.</p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex items-start gap-3 rounded-xl bg-white/60 px-3 py-3">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-ink-faint" aria-hidden="true" />
                <div>
                  <p className="text-sm font-semibold text-ink">Closed without submitting</p>
                  <p className="mt-0.5 text-sm text-ink-soft">
                    {result.confirmation === 'window closed before a confirmation appeared'
                      ? 'The window was closed before the confirmation page appeared, so this is not recorded as applied.'
                      : result.confirmation === 'timed out waiting for the reviewer'
                        ? 'The window stayed open for 45 minutes without a confirmation, so this is not recorded as applied.'
                        : 'No confirmation page appeared, so this is not recorded as applied.'}
                  </p>
                </div>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2 text-xs">
              {result.artifacts.cv && (
                <a className="inline-flex items-center gap-1.5 rounded-lg bg-white/70 px-2.5 py-1.5 text-ink" href={artifactUrl(base, job, 'cv.pdf')} target="_blank" rel="noopener noreferrer">
                  <FileText className="h-3.5 w-3.5" /> CV
                </a>
              )}
              {result.artifacts.letter && (
                <a className="inline-flex items-center gap-1.5 rounded-lg bg-white/70 px-2.5 py-1.5 text-ink" href={artifactUrl(base, job, 'letter.pdf')} target="_blank" rel="noopener noreferrer">
                  <FileText className="h-3.5 w-3.5" /> Letter
                </a>
              )}
              {job.url && (
                <a className="inline-flex items-center gap-1.5 rounded-lg bg-white/70 px-2.5 py-1.5 text-ink" href={job.url} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-3.5 w-3.5" /> Posting
                </a>
              )}
            </div>

            {result.warnings.length > 0 && (
              <details className="rounded-xl bg-white/60 px-3 py-2 text-sm text-ink-soft">
                <summary className="cursor-pointer font-medium text-ink">{result.warnings.length} note(s)</summary>
                <ul className="mt-2 ml-4 list-disc space-y-1">
                  {result.warnings.map((item) => <li key={item}>{item}</li>)}
                </ul>
              </details>
            )}

            {result.missing.length > 0 && (
              <div>
                <p className="text-sm font-semibold text-ink">{result.missing.length} field(s) the form wanted left blank:</p>
                <ul className="mt-1 ml-4 list-disc space-y-1 text-sm text-ink-soft">
                  {result.missing.map((item) => <li key={item}>{item}</li>)}
                </ul>
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => void begin({ steps: ['fill'], mode: 'review' })} className="inline-flex items-center gap-1.5 rounded-xl border border-ink/20 bg-white/70 px-3 py-2 text-sm font-medium text-ink transition-colors hover:bg-white">
                <RefreshCw className="h-3.5 w-3.5" /> {submitted ? 'Apply again' : 'Open the form again'}
              </button>
              <button type="button" onClick={() => void begin({ force: true, mode: 'review' })} className="inline-flex items-center gap-1.5 rounded-xl border border-ink/20 bg-white/70 px-3 py-2 text-sm font-medium text-ink transition-colors hover:bg-white">
                Re-tailor and retry
              </button>
            </div>
          </div>
        )}

        {run?.stage === 'failed' && (
          <div className="mt-5 space-y-3 border-t border-ink/10 pt-4">
            <div className="flex items-start gap-2 rounded-xl border border-coral/40 bg-coral/10 px-3 py-2.5 text-sm text-ink">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-coral" aria-hidden="true" />
              <div className="min-w-0">
                <p className="font-semibold">Auto-fill stopped</p>
                <p className="mt-0.5 break-words text-ink-soft">
                  {firstLine(run.fillError ?? run.error ?? 'The run failed before the form was ready.')}
                </p>
              </div>
            </div>

            {(run.error ?? '').length > 160 && (
              <details className="rounded-xl bg-white/60 px-3 py-2 text-xs text-ink-soft">
                <summary className="cursor-pointer font-medium text-ink">Technical detail</summary>
                <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-all">{run.error}</pre>
              </details>
            )}

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void begin({ mode: 'review' })}
                className="inline-flex items-center gap-1.5 rounded-xl border border-ink/20 bg-white/70 px-3 py-2 text-sm font-medium text-ink transition-colors hover:bg-white"
              >
                <RefreshCw className="h-3.5 w-3.5" /> Open the form again
              </button>
              <button
                type="button"
                onClick={() => void begin({ force: true, mode: 'review' })}
                className="inline-flex items-center gap-1.5 rounded-xl border border-ink/20 bg-white/70 px-3 py-2 text-sm font-medium text-ink transition-colors hover:bg-white"
              >
                Re-tailor and retry
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs">
              {run.result?.artifacts.cv && (
                <a className="inline-flex items-center gap-1.5 rounded-lg bg-white/70 px-2.5 py-1.5 text-ink" href={artifactUrl(base, job, 'cv.pdf')} target="_blank" rel="noopener noreferrer">
                  <FileText className="h-3.5 w-3.5" /> CV
                </a>
              )}
              {run.result?.artifacts.letter && (
                <a className="inline-flex items-center gap-1.5 rounded-lg bg-white/70 px-2.5 py-1.5 text-ink" href={artifactUrl(base, job, 'letter.pdf')} target="_blank" rel="noopener noreferrer">
                  <FileText className="h-3.5 w-3.5" /> Letter
                </a>
              )}
              {job.url && (
                <a className="inline-flex items-center gap-1.5 rounded-lg bg-white/70 px-2.5 py-1.5 text-ink" href={job.url} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-3.5 w-3.5" /> Apply on the posting
                </a>
              )}
            </div>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
};
