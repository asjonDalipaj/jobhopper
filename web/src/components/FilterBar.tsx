import React from 'react';
import { Search, MapPin, Laptop, SlidersHorizontal } from 'lucide-react';
import type { FilterState } from '../types';
import { cn } from '../utils';

interface FilterBarProps {
  filters: FilterState;
  onChange: (filters: FilterState) => void;
  availableCountries: string[];
}

export const FilterBar: React.FC<FilterBarProps> = ({
  filters,
  onChange,
  availableCountries,
}) => {
  const verdicts: Array<{ id: FilterState['verdict']; label: string }> = [
    { id: 'all', label: 'All Jobs' },
    { id: 'strong', label: 'Strong' },
    { id: 'fair', label: 'Fair' },
    { id: 'weak', label: 'Weak' },
    { id: 'unjudged', label: 'Unjudged' },
  ];

  return (
    <div className="w-full space-y-3">
      {/* Search Input Box */}
      <div className="relative flex items-center">
        <div className="absolute left-3.5 text-ink-faint pointer-events-none">
          <Search className="w-4 h-4" />
        </div>
        <input
          type="text"
          value={filters.search}
          onChange={(e) => onChange({ ...filters, search: e.target.value })}
          placeholder="Filter by title, company, stack, keywords... (Press / to focus)"
          className="w-full pl-10 pr-12 py-2.5 bg-surface hover:bg-surface-hover focus:bg-surface border border-line focus:border-line-strong rounded-lg text-sm text-ink placeholder-ink-faint transition-all outline-none font-sans"
        />
        <div className="absolute right-3 hidden sm:flex items-center gap-1 text-[10px] font-mono text-ink-faint px-1.5 py-0.5 rounded border border-line bg-surface-well">
          ⌘K or /
        </div>
      </div>

      {/* Filter Row: Verdict Pills & Switches */}
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
        {/* Verdict Pills */}
        <div className="flex items-center gap-1.5 p-1 rounded-lg bg-surface border border-line">
          {verdicts.map((v) => {
            const active = filters.verdict === v.id;
            return (
              <button
                key={v.id}
                type="button"
                onClick={() => onChange({ ...filters, verdict: v.id })}
                className={cn(
                  'px-3 py-1 rounded-md font-medium transition-all cursor-pointer',
                  active
                    ? 'bg-ink text-canvas shadow-sm'
                    : 'text-ink-soft hover:text-ink hover:bg-surface-well'
                )}
              >
                {v.label}
              </button>
            );
          })}
        </div>

        {/* Remote & Country Controls */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onChange({ ...filters, remoteOnly: !filters.remoteOnly })}
            className={cn(
              'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium cursor-pointer transition-all',
              filters.remoteOnly
                ? 'bg-ink border-line-strong text-canvas'
                : 'bg-surface border-line text-ink-soft hover:text-ink'
            )}
          >
            <Laptop className="w-3.5 h-3.5" />
            <span>Remote</span>
          </button>

          <div className="relative inline-flex items-center">
            <MapPin className="absolute left-2.5 w-3.5 h-3.5 text-ink-faint pointer-events-none" />
            <select
              value={filters.country}
              onChange={(e) => onChange({ ...filters, country: e.target.value })}
              className="appearance-none pl-8 pr-7 py-1.5 rounded-lg bg-surface border border-line text-ink-soft text-xs font-medium focus:outline-none focus:border-line-strong cursor-pointer"
            >
              <option value="">All Locations</option>
              {availableCountries.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <SlidersHorizontal className="absolute right-2.5 w-3 h-3 text-ink-faint pointer-events-none" />
          </div>
        </div>
      </div>
    </div>
  );
};
