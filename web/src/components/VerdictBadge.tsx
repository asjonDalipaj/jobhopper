import React from 'react';
import type { Verdict } from '../types';
import { cn } from '../utils';

interface VerdictBadgeProps {
  verdict?: Verdict | null;
  className?: string;
}

export const VerdictBadge: React.FC<VerdictBadgeProps> = ({ verdict, className }) => {
  if (!verdict) {
    return (
      <span
        className={cn(
          'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-mono font-medium tracking-wide uppercase',
          'bg-surface-well text-ink-faint border border-line',
          className
        )}
      >
        <span className="w-1.5 h-1.5 rounded-full bg-ink-faint" />
        Unjudged
      </span>
    );
  }

  const configs: Record<
    Verdict,
    { label: string; bg: string; text: string; dot: string; border: string }
  > = {
    strong: {
      label: 'Strong Match',
      bg: 'bg-emerald-50 dark:bg-emerald-950/40',
      text: 'text-emerald-700 dark:text-emerald-300',
      dot: 'bg-emerald-500',
      border: 'border-emerald-200 dark:border-emerald-800/50',
    },
    fair: {
      label: 'Fair Match',
      bg: 'bg-amber-50 dark:bg-amber-950/40',
      text: 'text-amber-700 dark:text-amber-300',
      dot: 'bg-amber-500',
      border: 'border-amber-200 dark:border-amber-800/50',
    },
    weak: {
      label: 'Weak Match',
      bg: 'bg-rose-50 dark:bg-rose-950/40',
      text: 'text-rose-700 dark:text-rose-300',
      dot: 'bg-rose-500',
      border: 'border-rose-200 dark:border-rose-800/50',
    },
    no: {
      label: 'Pass',
      bg: 'bg-surface-well',
      text: 'text-ink-faint',
      dot: 'bg-ink-faint',
      border: 'border-line',
    },
  };

  const c = configs[verdict] || configs.weak;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-mono font-medium tracking-wider uppercase',
        c.bg,
        c.text,
        c.border,
        'border',
        className
      )}
    >
      <span className={cn('w-1.5 h-1.5 rounded-full animate-pulse', c.dot)} />
      {c.label}
    </span>
  );
};
