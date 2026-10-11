import { useState, useEffect, useMemo } from 'react';
import { AnimatePresence } from 'motion/react';
import { Header } from './components/Header';
import { FilterBar } from './components/FilterBar';
import { JobCard } from './components/JobCard';
import { SAMPLE_JOBS } from './data/mockJobs';
import { matchesLocation, getLocationFilterOptions } from './data/locations';
import type { Job, FilterState } from './types';
import { toLocalDay } from './utils';
import { appliedKey, loadApplied, saveApplied } from './utils/applied';
import { ApplyToast } from './components/ApplyToast';
import { Inbox, SlidersHorizontal } from 'lucide-react';

const initialFilters: FilterState = {
  search: '',
  verdict: 'all',
  country: '',
  dateFrom: '',
  dateTo: '',
  remoteOnly: false,
  applied: 'all',
};

export function App() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<FilterState>(initialFilters);
  const [applied, setApplied] = useState<Record<string, string>>(() => loadApplied());
  const [toastJob, setToastJob] = useState<Job | null>(null);

  const markApplied = (job: Job) => {
    const appliedAt = new Date().toISOString();
    const next = { ...applied, [appliedKey(job)]: appliedAt };
    setApplied(next);
    saveApplied(next);
    // Sync into the local DB when the local server is running, so scheduled
    // snapshots carry the flag. Static hosted site: fire-and-forget, ignore.
    void fetch('/api/applied', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source: job.source, externalId: job.external_id, appliedAt }),
    }).catch(() => undefined);
  };

  /** localStorage wins (device-specific), snapshot value as fallback. */
  const effectiveAppliedAt = (job: Job): string | null =>
    applied[appliedKey(job)] ?? job.applied_at ?? null;

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
        // Local server not running or static mode.
      }

      // Hosted (static) deploy: the build copies the committed snapshot to /jobs.json.
      try {
        const res = await fetch('/jobs.json');
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data) && data.length > 0) {
            setJobs(data);
            setLoading(false);
            return;
          }
        }
      } catch {
        // Snapshot missing; fall through to sample data.
      }

      setJobs(SAMPLE_JOBS);
      setLoading(false);
    }

    loadData();
  }, []);

  const filteredJobs = useMemo(() => jobs.filter((job) => {
    if (filters.verdict !== 'all') {
      if (filters.verdict === 'unjudged') {
        if (job.verdict) return false;
      } else if (job.verdict !== filters.verdict) return false;
    }

    if (filters.remoteOnly) {
      const loc = (job.location || '').toLowerCase();
      const remote = job.workplace_type?.toLowerCase().includes('rem') || loc.includes('remote');
      if (!remote) return false;
    }

    if (filters.applied !== 'all') {
      const isApplied = Boolean(applied[appliedKey(job)] ?? job.applied_at);
      if (filters.applied === 'applied' ? !isApplied : isApplied) return false;
    }

    if (filters.country && !matchesLocation(job.location, filters.country)) return false;

    if (filters.dateFrom || filters.dateTo) {
      const postedDate = toLocalDay(job.posted_at);
      if (!postedDate || (filters.dateFrom && postedDate < filters.dateFrom) || (filters.dateTo && postedDate > filters.dateTo)) return false;
    }

    const query = filters.search.trim().toLowerCase();
    if (query) {
      const searchable = [job.title, job.company, job.location, job.tags || '', job.description || ''];
      if (!searchable.some((value) => value.toLowerCase().includes(query))) return false;
    }

    return true;
  }), [jobs, filters, applied]);

  const locationOptions = useMemo(() => getLocationFilterOptions(jobs), [jobs]);
  const verdictCounts = useMemo(() => ({
    all: jobs.length,
    strong: jobs.filter((job) => job.verdict === 'strong').length,
    fair: jobs.filter((job) => job.verdict === 'fair').length,
    weak: jobs.filter((job) => job.verdict === 'weak').length,
    no: jobs.filter((job) => job.verdict === 'no').length,
    unjudged: jobs.filter((job) => !job.verdict).length,
  }), [jobs]);

  const clearFilters = () => setFilters(initialFilters);
  const hasActiveFilters = filters.search || filters.verdict !== 'all' || filters.country || filters.dateFrom || filters.dateTo || filters.remoteOnly || filters.applied !== 'all';

  return (
    <div className="app-shell min-h-screen bg-canvas text-ink">
      <Header />

      <main className="mx-auto max-w-[1480px] bg-surface px-4 py-6 sm:px-8 lg:px-10 lg:py-9 xl:my-8">
        <section className="mb-7 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="mb-2 text-xs font-medium tracking-wide text-ink-soft">Your next move starts here</p>
            <h2 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">Find your next role</h2>
            <p className="mt-2 max-w-xl text-sm leading-6 text-ink-soft">Fresh software roles, matched privately against your profile.</p>
          </div>
          <div className="flex gap-3 text-sm">
            <div className="rounded-xl border border-line bg-surface px-4 py-3">
              <span className="block text-xl font-semibold tabular-nums">{filteredJobs.length}</span>
              <span className="text-xs text-ink-soft">{hasActiveFilters ? `of ${jobs.length} roles` : 'roles found'}</span>
            </div>
            <div className="rounded-xl border border-line bg-surface px-4 py-3">
              <span className="block text-xl font-semibold tabular-nums">{hasActiveFilters ? filteredJobs.filter((job) => job.verdict === 'strong').length : verdictCounts.strong}</span>
              <span className="text-xs text-ink-soft">strong matches</span>
            </div>
          </div>
        </section>

        <FilterBar
          filters={filters}
          onChange={setFilters}
          locationOptions={locationOptions}
        />

        <div className="mt-8 grid grid-cols-1 items-start gap-6 lg:grid-cols-[240px_minmax(0,1fr)] xl:grid-cols-[260px_minmax(0,1fr)]">
          <aside className="filter-sidebar rounded-2xl border border-line bg-surface p-5 lg:sticky lg:top-24" aria-label="Job filters">
            <div className="mb-5 flex items-center justify-between">
              <h3 className="text-lg font-semibold">Filters</h3>
              <button type="button" onClick={clearFilters} className="text-xs text-ink-soft underline-offset-4 hover:underline">Clear all</button>
            </div>
            <div className="space-y-5">
              <fieldset>
                <legend className="mb-3 text-sm font-semibold">Match</legend>
                <div className="space-y-2.5">
                  {([
                    ['all', 'All roles'], ['strong', 'Strong match'], ['fair', 'Fair match'], ['weak', 'Weak match'], ['no', 'Pass'], ['unjudged', 'Not reviewed'],
                  ] as const).map(([value, label]) => (
                    <label key={value} className="flex cursor-pointer items-center justify-between gap-2 text-sm text-ink-soft hover:text-ink">
                      <span className="flex items-center gap-2"><input type="radio" name="verdict" value={value} checked={filters.verdict === value} onChange={() => setFilters({ ...filters, verdict: value })} />{label}</span>
                      <span className="text-xs tabular-nums text-ink-faint">{verdictCounts[value]}</span>
                    </label>
                  ))}
                </div>
              </fieldset>

              <div className="border-t border-line pt-5">
                <label className="flex cursor-pointer items-center justify-between gap-3 text-sm font-medium">
                  <span>Remote roles</span>
                  <input type="checkbox" checked={filters.remoteOnly} onChange={(event) => setFilters({ ...filters, remoteOnly: event.target.checked })} />
                </label>
                <label className="mt-4 block text-sm font-medium" htmlFor="applied-filter">Applications</label>
                <select
                  id="applied-filter"
                  value={filters.applied}
                  onChange={(event) => setFilters({ ...filters, applied: event.target.value as FilterState['applied'] })}
                  className="mt-2 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm"
                >
                  <option value="all">All roles</option>
                  <option value="applied">Applied only</option>
                  <option value="not">Not applied yet</option>
                </select>
              </div>

              <fieldset className="border-t border-line pt-5">
                <legend className="mb-2 text-sm font-semibold">Date posted</legend>
                <label className="mb-2 block text-xs text-ink-soft" htmlFor="date-from">From</label>
                <input id="date-from" type="date" value={filters.dateFrom} onChange={(event) => setFilters({ ...filters, dateFrom: event.target.value })} className="mb-3 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm" />
                <label className="mb-2 block text-xs text-ink-soft" htmlFor="date-to">To</label>
                <input id="date-to" type="date" value={filters.dateTo} onChange={(event) => setFilters({ ...filters, dateTo: event.target.value })} className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm" />
              </fieldset>
            </div>
          </aside>

          <section aria-label="Job results" className="min-w-0">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold">Open roles <span className="ml-1 text-sm font-normal text-ink-soft">({filteredJobs.length})</span></h3>
                <p className="mt-1 text-xs text-ink-soft">Showing {filteredJobs.length} of {jobs.length} · newest first</p>
              </div>
              {hasActiveFilters && <button type="button" onClick={clearFilters} className="inline-flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-xs font-medium text-ink-soft hover:text-ink"><SlidersHorizontal className="h-3.5 w-3.5" /> Clear filters</button>}
            </div>

            {loading ? (
              <div className="rounded-2xl border border-line bg-surface py-24 text-center text-sm text-ink-soft">Loading roles…</div>
            ) : filteredJobs.length > 0 ? (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                {filteredJobs.map((job, index) => <JobCard key={`${job.source ?? 'x'}-${job.external_id ?? job.id ?? `i${index}`}`} job={job} index={index} appliedAt={effectiveAppliedAt(job)} onApplyClick={setToastJob} />)}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-line-strong bg-surface p-12 text-center">
                <Inbox className="mx-auto mb-3 h-8 w-8 text-ink-faint" />
                <p className="text-sm font-medium">No roles match these filters</p>
                <p className="mt-1 text-sm text-ink-soft">Try broadening your search or clear the filters.</p>
                <button type="button" onClick={clearFilters} className="mt-4 rounded-lg bg-ink px-4 py-2 text-sm font-medium text-surface">Clear filters</button>
              </div>
            )}
          </section>
        </div>
      </main>

      <footer className="mt-8 border-t border-line bg-surface/60 py-5 text-center text-xs text-ink-faint">
        <span className="font-display font-medium text-ink-soft">JobHopper</span> · Local data stays on your machine
      </footer>

      <AnimatePresence>
        {toastJob && (
          <ApplyToast
            key={appliedKey(toastJob)}
            job={toastJob}
            onConfirm={() => { markApplied(toastJob); setToastJob(null); }}
            onDismiss={() => setToastJob(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

export default App;