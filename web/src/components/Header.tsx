import React from 'react';
import { ThemeToggle } from './ThemeToggle';

export const Header: React.FC = () => {
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-surface/95 backdrop-blur">
      <div className="mx-auto flex max-w-[1480px] items-center justify-between gap-4 px-4 py-3.5 sm:px-6 lg:px-10">
        <div className="flex items-center gap-3">
          <img src="/jobhopper-mark.svg" alt="" aria-hidden="true" className="h-11 w-11 shrink-0" />
          <div>
            <h1 className="font-display text-lg font-semibold tracking-tight text-ink">JobHopper</h1>
            <p className="text-xs text-ink-soft">Your private job search</p>
          </div>
        </div>

        <ThemeToggle />
      </div>
    </header>
  );
};
