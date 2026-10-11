import React from 'react';
import { Search, MapPin, Laptop } from 'lucide-react';
import type { FilterState } from '../types';
import type { LocationGroupOptions } from '../data/locations';

interface FilterBarProps {
  filters: FilterState;
  onChange: (filters: FilterState) => void;
  locationOptions: LocationGroupOptions[];
}

export const FilterBar: React.FC<FilterBarProps> = ({ filters, onChange, locationOptions }) => (
  <section className="search-panel rounded-2xl border border-line bg-surface p-3 shadow-sm sm:p-4" aria-label="Search jobs">
    <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(180px,0.65fr)_auto]">
      <label className="search-field flex min-w-0 items-center gap-3 rounded-xl bg-surface-well px-4 py-3">
        <Search className="h-4 w-4 shrink-0 text-ink-faint" aria-hidden="true" />
        <span className="sr-only">Search jobs</span>
        <input
          type="search"
          value={filters.search}
          onChange={(event) => onChange({ ...filters, search: event.target.value })}
          placeholder="Role, company or keyword"
          className="w-full min-w-0 bg-transparent text-sm text-ink outline-none placeholder:text-ink-faint"
        />
      </label>

      <label className="flex min-w-0 items-center gap-3 rounded-xl bg-surface-well px-4 py-3">
        <MapPin className="h-4 w-4 shrink-0 text-ink-faint" aria-hidden="true" />
        <span className="sr-only">Filter by location</span>
        <select value={filters.country} onChange={(event) => onChange({ ...filters, country: event.target.value })} className="w-full min-w-0 appearance-none bg-transparent text-sm text-ink outline-none">
          <option value="">All locations</option>
          {locationOptions.map((group) => <optgroup key={group.continent} label={group.continent}>
            <option value={group.continent}>{group.continent} (all)</option>
            {group.countries.map((country) => <option key={country} value={country}>{country}</option>)}
          </optgroup>)}
        </select>
      </label>

      <button
        type="button"
        onClick={() => onChange({ ...filters, remoteOnly: !filters.remoteOnly })}
        aria-pressed={filters.remoteOnly}
        className={`inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${filters.remoteOnly ? 'bg-ink text-surface' : 'bg-brand text-ink hover:brightness-95'}`}
      >
        <Laptop className="h-4 w-4" aria-hidden="true" />
        Remote
      </button>
    </div>
  </section>
);