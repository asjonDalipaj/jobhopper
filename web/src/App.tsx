import { useState, useEffect, useMemo, type CSSProperties } from 'react';
import { Header } from './components/Header';
import { FilterBar } from './components/FilterBar';
import { JobCard } from './components/JobCard';
import { SAMPLE_JOBS } from './data/mockJobs';
import { matchesLocation, getLocationFilterOptions } from './data/locations';
import type { Job, FilterState } from './types';
import { Inbox } from 'lucide-react';

export function App() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<FilterState>({
    search: '',
    verdict: 'all',
    country: '',
    dateFrom: '',
    dateTo: '',
    remoteOnly: false,
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

        const res = await fetch('/api/jobs');
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data) && data.length > 0) {
            setJobs(data);
            setLoading(false);
            return;
          }
        }
      } catch {
        // Local server not running or static mode
      }
      setJobs(SAMPLE_JOBS);
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
      // whenever a range is active.
      if (filters.dateFrom || filters.dateTo) {
        const postedDate = (job.posted_at || '').slice(0, 10);
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

      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-10 space-y-8">
        <section className="relative space-y-8 pb-6">
          <div aria-hidden className="pointer-events-none absolute -top-32 -left-24 h-72 w-72 rounded-full bg-coral/20 dark:bg-coral/10 blur-3xl" />
          <div aria-hidden className="pointer-events-none absolute -right-20 top-0 h-80 w-80 rounded-full bg-mint/20 dark:bg-mint/10 blur-3xl" />
          <div aria-hidden className="pointer-events-none absolute left-1/3 top-10 h-56 w-56 rounded-full bg-butter/20 dark:bg-butter/10 blur-3xl" />

          <div className="relative space-y-6">
            <div className="space-y-3 max-w-2xl">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface/70 px-3 py-1 text-[11px] font-mono text-ink-soft">
                <span className="h-1.5 w-1.5 rounded-full bg-gradient-to-r from-coral to-mint" />
                Live index · EU engineering boards
              </span>
              <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-ink font-display">
                European Engineering{' '}
                <span className="bg-gradient-to-r from-coral via-butter to-mint bg-clip-text text-transparent">
                  Opportunities
                </span>
              </h2>
              <p className="text-sm text-ink-soft max-w-2xl">
                Aggregated roles, judged locally against your profile. Filter, scan, apply.
              </p>
            </div>

            <div className="flex flex-wrap max-w-md gap-4 pt-1">
              <div className="sticker rounded-2xl border-2 border-line bg-surface px-4 py-3" style={{ '--sticker-rotate': '-3deg' } as CSSProperties}>
                <div className="text-2xl font-bold tabular-nums tracking-tight text-ink font-display">{jobs.length}</div>
                <div className="text-xs text-ink-faint mt-0.5">jobs indexed</div>
              </div>
              <div className="sticker rounded-2xl border-2 border-mint/60 bg-mint/15 px-4 py-3" style={{ '--sticker-rotate': '2deg' } as CSSProperties}>
                <div className="text-2xl font-bold tabular-nums tracking-tight text-emerald-700 dark:text-emerald-300 font-display">{strongCount}</div>
                <div className="text-xs text-ink-faint mt-0.5">strong matches</div>
              </div>
              <div className="sticker rounded-2xl border-2 border-line bg-surface px-4 py-3" style={{ '--sticker-rotate': '-2deg' } as CSSProperties}>
                <div className="text-2xl font-bold tabular-nums tracking-tight text-ink font-display">{judgedCount}</div>
                <div className="text-xs text-ink-faint mt-0.5">judged</div>
              </div>
            </div>
          </div>

          <svg
            aria-hidden
            viewBox="0 0 1200 40"
            preserveAspectRatio="none"
            className="wavy-divider absolute -bottom-2 left-0"
          >
            <path
              d="M0 20 Q 50 0, 100 20 T 200 20 T 300 20 T 400 20 T 500 20 T 600 20 T 700 20 T 800 20 T 900 20 T 1000 20 T 1100 20 T 1200 20 V40 H0 Z"
              fill="currentColor"
            />
          </svg>
        </section>

        <FilterBar
          filters={filters}
          onChange={setFilters}
          locationOptions={locationOptions}
        />

        <div className="flex items-center justify-between text-xs font-mono text-ink-faint">
          <span>Showing {filteredJobs.length} of {jobs.length} roles</span>
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
            {filteredJobs.map((job, index) => (
              <JobCard key={job.id || `${job.source}-${job.external_id}`} job={job} index={index} />
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-line-strong p-12 text-center space-y-3">
            <Inbox className="w-8 h-8 mx-auto text-ink-faint" />
            <p className="text-sm text-ink-soft font-medium">No roles match your filters</p>
          </div>
        )}
      </main>

      <footer className="border-t border-line py-6 text-center text-xs text-ink-faint font-mono">
        <span className="font-display text-ink-soft">JobHopper</span> · Local data stays on your machine
      </footer>
    </div>
  );
}

export default App;
