import React from 'react';
import { Terminal } from 'lucide-react';
import { ThemeToggle } from './ThemeToggle';

export const Header: React.FC = () => {
  return (
    <header className="relative border-b border-line bg-canvas/80 backdrop-blur-md sticky top-0 z-40">
      {/* Subtle top ambient glow */}
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-coral/40 to-transparent" />

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-coral via-butter to-mint flex items-center justify-center shadow-sm">
            <Terminal className="w-4 h-4 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-ink font-display">
              JobHopper
            </h1>
            <p className="text-xs text-ink-soft">
              Local-first EU job radar
            </p>
          </div>
        </div>

        <ThemeToggle />
      </div>
    </header>
  );
};
