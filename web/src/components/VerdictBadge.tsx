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
          'sticker inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-mono font-medium tracking-wide uppercase',
          'bg-surface-well text-ink-faint border-2 border-line',
          className
        )}
        style={{ '--sticker-rotate': '-2deg' } as React.CSSProperties}
      >
        <span className="w-1.5 h-1.5 rounded-full bg-ink-faint" />
        Unjudged
      </span>
    );
  }

  const configs: Record<
    Verdict,
    { label: string; bg: string; text: string; dot: string; border: string; rotate: string }
  > = {
    strong: {
      label: 'Strong Match',
      bg: 'bg-mint/20 dark:bg-mint/15',
      text: 'text-emerald-700 dark:text-emerald-300',
      dot: 'bg-mint',
      border: 'border-mint',
      rotate: '-2deg',
    },
    fair: {
      label: 'Fair Match',
      bg: 'bg-butter/25 dark:bg-butter/15',
      text: 'text-amber-700 dark:text-amber-300',
      dot: 'bg-butter',
      border: 'border-butter',
      rotate: '2deg',
    },
    weak: {
      label: 'Weak Match',
      bg: 'bg-coral/15 dark:bg-coral/15',
      text: 'text-rose-700 dark:text-rose-300',
      dot: 'bg-coral',
      border: 'border-coral',
      rotate: '-2deg',
    },
    no: {
      label: 'Pass',
      bg: 'bg-surface-well',
      text: 'text-ink-faint',
      dot: 'bg-ink-faint',
      border: 'border-line',
      rotate: '2deg',
    },
  };

  const c = configs[verdict] || configs.weak;

  return (
    <span
      className={cn(
        'sticker inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-mono font-medium tracking-wider uppercase',
        c.bg,
        c.text,
        c.border,
        'border-2',
        className
      )}
      style={{ '--sticker-rotate': c.rotate } as React.CSSProperties}
    >
      <span className={cn('w-1.5 h-1.5 rounded-full', c.dot)} />
      {c.label}
    </span>
  );
};
