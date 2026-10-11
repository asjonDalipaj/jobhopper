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
          'inline-flex items-center gap-1.5 rounded-full border border-line bg-white/60 px-2.5 py-1 text-[11px] font-medium',
          className
        )}
      >
        <span className="h-1.5 w-1.5 rounded-full bg-ink-faint" />
        Not reviewed
      </span>
    );
  }

  const configs: Record<
    Verdict,
    { label: string; bg: string; text: string; dot: string; border: string }
  > = {
    strong: {
      label: 'Strong',
      bg: 'bg-mint/20 dark:bg-mint/15',
      text: 'text-emerald-700 dark:text-emerald-300',
      dot: 'bg-mint',
      border: 'border-mint',
    },
    fair: {
      label: 'Fair',
      bg: 'bg-butter/25 dark:bg-butter/15',
      text: 'text-amber-700 dark:text-amber-300',
      dot: 'bg-butter',
      border: 'border-butter',
    },
    weak: {
      label: 'Weak',
      bg: 'bg-coral/15 dark:bg-coral/15',
      text: 'text-rose-700 dark:text-rose-300',
      dot: 'bg-coral',
      border: 'border-coral',
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
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold',
        c.bg,
        c.text,
        c.border,
        className
      )}
    >
      <span className={cn('w-1.5 h-1.5 rounded-full', c.dot)} />
      {c.label}
    </span>
  );
};
