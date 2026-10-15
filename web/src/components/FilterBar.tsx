import React from 'react';
import { Search, MapPin, Laptop, SlidersHorizontal, CalendarRange, X } from 'lucide-react';
import type { FilterState } from '../types';
import type { LocationGroupOptions } from '../data/locations';
import { cn } from '../utils';

interface FilterBarProps {
  filters: FilterState;
  onChange: (filters: FilterState) => void;
  locationOptions: LocationGroupOptions[];
}

export const FilterBar: React.FC<FilterBarProps> = ({
  filters,
  onChange,
  locationOptions,
}) => {
  const verdicts: Array<{ id: FilterState['verdict']; label: string }> = [
    { id: 'all', label: 'All roles' },
    { id: 'strong', label: 'Strong' },
    { id: 'fair', label: 'Fair' },
    { id: 'weak', label: 'Weak' },
    { id: 'unjudged', label: 'Unjudged' },
  ];

  return (
    <div className="w-full space-y-4">
      <div className="relative flex items-center">
        <div className="pointer-events-none absolute left-3.5 text-ink-faint">
          <Search className="w-4 h-4" />
        </div>
        <input
          type="text"
          value={filters.search}
          onChange={(e) => onChange({ ...filters, search: e.target.value })}
          placeholder="Search roles, companies, locations, skills"
          aria-label="Search roles, companies, locations, and skills"
          className="w-full rounded-xl border border-line bg-canvas px-10 py-3 text-sm text-ink placeholder:text-ink-faint transition-colors hover:border-line-strong focus:border-coral focus:outline-none focus:ring-2 focus:ring-ring font-sans"
        />
      </div>

      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex max-w-full items-center gap-1 overflow-x-auto rounded-xl bg-surface-well p-1" role="group" aria-label="Filter by match">
          {verdicts.map((v) => {
            const active = filters.verdict === v.id;
            return (
              <button
                key={v.id}
                type="button"
                onClick={() => onChange({ ...filters, verdict: v.id })}
                aria-pressed={active}
                className={cn(
                  'shrink-0 rounded-lg px-3 py-2 text-xs font-medium transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral',
                  active
                    ? 'bg-surface text-ink shadow-sm'
                    : 'text-ink-soft hover:bg-surface/70 hover:text-ink'
                )}
              >
                {v.label}
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => onChange({ ...filters, remoteOnly: !filters.remoteOnly })}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral',
              filters.remoteOnly
                ? 'bg-ink border-ink text-canvas'
                : 'bg-surface border-line text-ink-soft hover:border-line-strong hover:text-ink'
            )}
            aria-pressed={filters.remoteOnly}
          >
            <Laptop className="w-3.5 h-3.5" />
            <span>Remote</span>
          </button>

          <div className="relative inline-flex items-center">
            <MapPin className="absolute left-2.5 w-3.5 h-3.5 text-ink-faint pointer-events-none" />
            <select
              value={filters.country}
              onChange={(e) => onChange({ ...filters, country: e.target.value })}
              className="appearance-none rounded-lg border border-line bg-surface py-2 pl-8 pr-8 text-xs font-medium text-ink-soft cursor-pointer focus:border-coral focus:outline-none focus:ring-2 focus:ring-ring"
              aria-label="Filter by location"
            >
              <option value="">All Locations</option>
              {locationOptions.map((group) => (
                <optgroup key={group.continent} label={group.continent}>
                  <option value={group.continent}>
                    {group.continent} (All)
                  </option>
                  {group.countries.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            <SlidersHorizontal className="pointer-events-none absolute right-2.5 h-3 w-3 text-ink-faint" />
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="flex items-center gap-1.5 pr-1 text-ink-soft">
          <CalendarRange className="w-3.5 h-3.5 text-ink-faint" />
          <span className="font-medium">Posted</span>
        </span>
        <input
          type="date"
          value={filters.dateFrom}
          onChange={(e) => onChange({ ...filters, dateFrom: e.target.value })}
          title="From date (inclusive) - show postings from this day onwards"
          className="rounded-lg border border-line bg-surface px-2.5 py-2 text-xs font-medium text-ink-soft focus:border-coral focus:outline-none focus:ring-2 focus:ring-ring"
          aria-label="Posted from date"
        />
        <span className="text-ink-faint">→</span>
        <input
          type="date"
          value={filters.dateTo}
          onChange={(e) => onChange({ ...filters, dateTo: e.target.value })}
          title="To date (inclusive) - show postings up to this day"
          className="rounded-lg border border-line bg-surface px-2.5 py-2 text-xs font-medium text-ink-soft focus:border-coral focus:outline-none focus:ring-2 focus:ring-ring"
          aria-label="Posted to date"
        />
        {(filters.dateFrom || filters.dateTo) && (
          <button
            type="button"
            onClick={() => onChange({ ...filters, dateFrom: '', dateTo: '' })}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-ink-soft underline hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral cursor-pointer"
          >
            <X className="h-3 w-3" aria-hidden="true" />
            Clear
          </button>
        )}
        <span className="text-ink-faint">
          Latest first
        </span>
      </div>
    </div>
  );
};
