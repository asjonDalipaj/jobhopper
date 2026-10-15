import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { Check, X, PartyPopper } from 'lucide-react';
import type { Job } from '../types';

const DURATION_SECONDS = 7;

const OPENERS = [
  'So… did you hit that Apply button?',
  'Fingers on the keyboard — applied yet?',
  'Be honest. Did you apply?',
  'That tab is open. You know what to do.',
  'New role, who applied?',
];

interface ApplyToastProps {
  job: Job;
  /** Called when the user confirms they applied. */
  onConfirm: () => void;
  /** Called on dismiss button or when the countdown runs out. */
  onDismiss: () => void;
}

/**
 * Playful "did you apply?" toast pinned to the bottom of the screen.
 * The 7s countdown only ticks while the page is visible, so switching tabs
 * pauses it and coming back resumes. Purely an overlay — the page stays
 * scrollable and clickable behind it.
 */
export const ApplyToast: React.FC<ApplyToastProps> = ({ job, onConfirm, onDismiss }) => {
  const [remaining, setRemaining] = useState(DURATION_SECONDS);
  const [opener] = useState(() => OPENERS[Math.floor(Math.random() * OPENERS.length)]);
  const done = useRef(false);

  const finish = (confirm: boolean) => {
    if (done.current) return;
    done.current = true;
    if (confirm) onConfirm();
    else onDismiss();
  };

  useEffect(() => {
    // 10 ticks per second so the progress bar animates smoothly; the tick is
    // skipped while the document is hidden, which pauses the countdown.
    const id = window.setInterval(() => {
      if (document.hidden) return;
      setRemaining((prev) => {
        const next = Math.max(0, prev - 0.1);
        if (next <= 0) finish(false);
        return next;
      });
    }, 100);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const progress = (remaining / DURATION_SECONDS) * 100;

  return (
    <motion.div
      initial={{ y: 120, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 120, opacity: 0 }}
      transition={{ type: 'spring', stiffness: 380, damping: 28 }}
      role="dialog"
      aria-label="Confirm application"
      className="pointer-events-auto fixed inset-x-0 bottom-0 z-50 flex justify-center px-4 pb-4 sm:px-6"
    >
      <div className="w-full max-w-xl overflow-hidden rounded-2xl border border-ink/10 bg-ink text-surface shadow-xl">
        <div className="flex items-center gap-3 px-4 py-3.5 sm:px-5">
          <PartyPopper className="h-5 w-5 shrink-0 text-butter" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold leading-snug">{opener}</p>
            <p className="mt-0.5 truncate text-xs opacity-70">
              {job.title} · {job.company}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => finish(true)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-mint px-3 py-2 text-xs font-semibold text-ink transition-transform hover:scale-105 active:scale-95"
            >
              <Check className="h-3.5 w-3.5" /> Applied!
            </button>
            <button
              type="button"
              onClick={() => finish(false)}
              aria-label="Dismiss"
              className="inline-flex items-center justify-center rounded-xl bg-white/10 p-2 text-surface transition-colors hover:bg-white/20"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
        {/* Countdown bar — shrinks as the 7s run out (pauses when tab hidden) */}
        <div className="h-1.5 w-full bg-white/10" aria-hidden="true">
          <div
            className="h-full bg-butter transition-[width] duration-100 ease-linear"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    </motion.div>
  );
};
