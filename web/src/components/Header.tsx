import React from 'react';
import { motion } from 'motion/react';
import { Sparkles, Terminal } from 'lucide-react';
import { ThemeToggle } from './ThemeToggle';

interface HeaderProps {
  totalJobs: number;
  strongMatches: number;
}

export const Header: React.FC<HeaderProps> = ({ totalJobs, strongMatches }) => {
  return (
    <header className="relative border-b border-line bg-canvas/80 backdrop-blur-md sticky top-0 z-40">
      {/* Subtle top ambient glow */}
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-ink-soft/30 to-transparent" />

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-surface border border-line flex items-center justify-center shadow-sm">
            <Terminal className="w-4 h-4 text-emerald-500" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-semibold tracking-tight text-ink">
                JobHopper
              </h1>
              <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-surface-well text-ink-soft border border-line">
                Local-First
              </span>
            </div>
            <p className="text-xs text-ink-soft font-normal">
              Curated European tech boards evaluated locally
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-md bg-surface border border-line text-xs font-mono"
          >
            <span className="text-ink-faint">Indexed:</span>
            <span className="text-ink font-medium">{totalJobs}</span>
            <span className="text-ink-faint">/</span>
            <div className="flex items-center gap-1.5 text-emerald-600">
              <Sparkles className="w-3.5 h-3.5" />
              <span>{strongMatches} strong</span>
            </div>
          </motion.div>

          <ThemeToggle />
        </div>
      </div>
    </header>
  );
};
