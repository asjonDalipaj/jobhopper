import { useState, useEffect, useMemo } from 'react';
import { Header } from './components/Header';
import { FilterBar } from './components/FilterBar';
import { JobCard } from './components/JobCard';
import { matchesLocation, getLocationFilterOptions } from './data/locations';
import type { Job, FilterState } from './types';
import { toLocalDay } from './utils';
import { Inbox } from 'lucide-react';

const LOAD_ERROR = 'Cannot load dashboard data. For local SQLite mode, run npm run ui.';

export function App() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filters, setFilters] = useState<FilterState>({
    search: '',
    verdict: 'all',
    country: '',
    dateFrom: '',
    dateTo: '',
    remoteOnly: false,
    newOnly: false,
    applied: 'all',
  });

  useEffect(() => {
    async function loadData() {
      try {
        const injected = (window as unknown as { __INITIAL_JOBS__?: Job[] }).__INITIAL_JOBS__;
        if (Array.isArray(injected) && injected.length > 0) {
          setJobs(injected);
          setLoading(false);
          return;
        }

        const urls = import.meta.env.DEV
          ? ['/api/jobs', 'http://localhost:3333/api/jobs', `${import.meta.env.BASE_URL}jobs.json`]
          : ['/api/jobs', `${import.meta.env.BASE_URL}jobs.json`];
        for (const url of urls) {
          try {
            const res = await fetch(url);
            if (!res.ok) continue;
            const data = await res.json();
            if (Array.isArray(data)) {
              setJobs(data);
              setLoading(false);
              return;
            }
          } catch {
            // Try next local API endpoint.
          }
        }
        setLoadError(LOAD_ERROR);
      } catch {
        setLoadError(LOAD_ERROR);
      }
      setLoading(false);
    }

    loadData();
  }, []);

  const filteredJobs = useMemo(() => {
    return jobs.filter((job) => {
      if (filters.verdict !== 'all') {
        if (filters.verdict === 'unjudged') {
          if (job.verdict) return false;
        } else if (job.verdict !== filters.verdict) {
          return false;
        }
      }

      if (filters.remoteOnly) {
        const loc = (job.location || '').toLowerCase();
        const isRemote =
          (job.workplace_type && job.workplace_type.toLowerCase().includes('rem')) ||
          loc.includes('remote');
        if (!isRemote) return false;
      }

      if (filters.country) {
        if (!matchesLocation(job.location, filters.country)) return false;
      }

      // Posting date range (inclusive). postings without a date are excluded
      // whenever a range is active. toLocalDay matches formatDate's timezone
      // so the filter compares against the day the card displays.
      if (filters.dateFrom || filters.dateTo) {
        const postedDate = toLocalDay(job.posted_at);
        if (!postedDate) return false;
        if (filters.dateFrom && postedDate < filters.dateFrom) return false;
        if (filters.dateTo && postedDate > filters.dateTo) return false;
      }

      if (filters.search.trim()) {
        const q = filters.search.toLowerCase();
        const matchTitle = job.title.toLowerCase().includes(q);
        const matchCompany = job.company.toLowerCase().includes(q);
        const matchLocation = job.location.toLowerCase().includes(q);
        const matchTags = job.tags ? job.tags.toLowerCase().includes(q) : false;
        const matchDesc = job.description ? job.description.toLowerCase().includes(q) : false;
        if (!matchTitle && !matchCompany && !matchLocation && !matchTags && !matchDesc) {
          return false;
        }
      }

      return true;
    });
  }, [jobs, filters]);

  const locationOptions = useMemo(() => getLocationFilterOptions(jobs), [jobs]);

  const strongCount = useMemo(() => jobs.filter((j) => j.verdict === 'strong').length, [jobs]);
  const judgedCount = useMemo(() => jobs.filter((j) => j.verdict).length, [jobs]);

  return (
    <div className="min-h-screen bg-canvas text-ink flex flex-col selection:bg-ink selection:text-canvas">
      <Header />

      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-7 sm:py-10 space-y-6 sm:space-y-8">
        <section className="flex flex-col gap-5 border-b border-line pb-6 sm:flex-row sm:items-end sm:justify-between">
          <div className="max-w-2xl space-y-2">
            <p className="text-sm font-medium text-ink-soft">Italy · Spain · Netherlands</p>
            <h2 className="font-display text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
              Find your next role.
            </h2>
            <p className="max-w-xl text-sm leading-6 text-ink-soft">
              Fresh engineering and music roles, with profile matches where available.
            </p>
          </div>
          <dl className="flex items-center gap-5 text-sm sm:gap-7">
            <div>
              <dt className="text-xs text-ink-faint">Roles</dt>
              <dd className="mt-0.5 font-display text-xl font-semibold tabular-nums text-ink">{jobs.length}</dd>
            </div>
            <div className="h-8 w-px bg-line" aria-hidden="true" />
            <div>
              <dt className="text-xs text-ink-faint">Judged</dt>
              <dd className="mt-0.5 font-display text-xl font-semibold tabular-nums text-ink">{judgedCount}</dd>
            </div>
            <div className="h-8 w-px bg-line" aria-hidden="true" />
            <div>
              <dt className="text-xs text-ink-faint">Strong fit</dt>
              <dd className="mt-0.5 font-display text-xl font-semibold tabular-nums text-emerald-700 dark:text-emerald-300">{strongCount}</dd>
            </div>
          </dl>
        </section>

        <section aria-label="Filter roles" className="rounded-2xl border border-line bg-surface p-3 shadow-sm sm:p-4">
          <FilterBar filters={filters} onChange={setFilters} locationOptions={locationOptions} />
        </section>

        <div className="flex items-center justify-between border-b border-line pb-2 text-sm">
          <span className="font-medium text-ink">Roles</span>
          <span className="font-mono text-xs tabular-nums text-ink-faint">{filteredJobs.length} of {jobs.length}</span>
          {filters.search && (
            <button
              onClick={() => setFilters({ ...filters, search: '' })}
              className="text-ink-soft hover:text-ink cursor-pointer"
            >
              Clear
            </button>
          )}
        </div>

        {loading ? (
          <div className="py-24 text-center text-ink-faint font-mono text-sm">
            Loading...
          </div>
        ) : filteredJobs.length > 0 ? (
          <div className="grid grid-cols-1 gap-4">
            {filteredJobs.map((job) => (
              <JobCard key={`${job.source}-${job.external_id}`} job={job} />
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-line-strong p-12 text-center space-y-3">
            <Inbox className="w-8 h-8 mx-auto text-ink-faint" />
            <p className="text-sm text-ink-soft font-medium">{loadError || 'No roles match your filters'}</p>
          </div>
        )}
      </main>

      <footer className="border-t border-line py-6 text-center text-xs text-ink-faint font-mono">
        <span className="font-display text-ink-soft">JobHopper</span> · NL / IT / ES job index
      </footer>
    </div>
  );
}

export default App;
