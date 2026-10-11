import React from 'react';
import { BriefcaseBusiness } from 'lucide-react';
import { ThemeToggle } from './ThemeToggle';

export const Header: React.FC = () => {
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-surface/95 backdrop-blur">
      <div className="mx-auto flex max-w-[1480px] items-center justify-between gap-4 px-4 py-3.5 sm:px-6 lg:px-10">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-ink text-surface">
            <BriefcaseBusiness className="h-5 w-5" />
          </div>
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
