import { useState, useEffect, useMemo, useCallback } from 'react';
import { AnimatePresence } from 'motion/react';
import { Header } from './components/Header';
import { FilterBar } from './components/FilterBar';
import { JobCard } from './components/JobCard';
import { SAMPLE_JOBS } from './data/mockJobs';
import { matchesLocation, getLocationFilterOptions } from './data/locations';
import type { Job, FilterState } from './types';
import { toLocalDay, isNewJob } from './utils';
import { appliedKey, loadApplied, saveApplied } from './utils/applied';
import { ApplyToast } from './components/ApplyToast';
import { PrepDialog } from './components/PrepDialog';
import { latestPreps, localBase, prepKey, type PrepRun } from './lib/prep';
import { ActivityPanel } from './components/ActivityPanel';
import { Inbox, SlidersHorizontal } from 'lucide-react';

const initialFilters: FilterState = {
  search: '',
  verdict: 'relevant',
  country: '',
  dateFrom: '',
  dateTo: '',
  remoteOnly: false,
  newOnly: false,
  applied: 'all',
};

export function App() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<FilterState>(initialFilters);
  const [applied, setApplied] = useState<Record<string, string>>(() => loadApplied());
  const [toastJob, setToastJob] = useState<Job | null>(null);
  const [showActivity, setShowActivity] = useState(false);
  const [prepBase, setPrepBase] = useState<string | null>(null);
  const [prepProbed, setPrepProbed] = useState(false);
  const [preps, setPreps] = useState<Record<string, PrepRun>>({});
  const [prepJob, setPrepJob] = useState<Job | null>(null);

  // Auto-fill needs the local CLI. Same origin when served by `jobhopper ui`;
  // the hosted build reaches the same server through http://localhost:3333.
  useEffect(() => {
    let alive = true;
    void localBase().then(async (base) => {
      if (!alive) return;
      setPrepBase(base);
      if (base === null) {
        setPrepProbed(true);
        return;
      }
      const runs = await latestPreps(base);
      if (!alive) return;
      setPreps(Object.fromEntries(runs.map((run) => [`${run.source}:${run.externalId}`, run])));
      setPrepProbed(true);
    });
    return () => {
      alive = false;
    };
  }, []);

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

  const prepStateFor = (job: Job): 'none' | 'ready' | 'running' | 'waiting' | 'submitted' => {
    const run = preps[prepKey(job)];
    if (run?.result?.submitted) return 'submitted';
    if (run?.awaitingReview) return 'waiting';
    if (run?.stage === 'running') return 'running';
    return run?.result?.artifacts.cv ? 'ready' : 'none';
  };

  // A confirmed submission is an application: record it like the Apply toast
  // does (localStorage for the static site, DB when the local server runs).
  const recordSubmission = useCallback((run: PrepRun) => {
    if (!run.result?.submitted) return;
    const key = `${run.source}-${run.externalId}`;
    const appliedAt = run.finishedAt ?? new Date().toISOString();
    setApplied((prev) => {
      if (prev[key]) return prev;
      const next = { ...prev, [key]: appliedAt };
      saveApplied(next);
      return next;
    });
    void fetch('/api/applied', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source: run.source, externalId: run.externalId, appliedAt }),
    }).catch(() => undefined);
  }, []);

  const prepFinished = useCallback((run: PrepRun) => {
    setPreps((prev) => ({ ...prev, [`${run.source}:${run.externalId}`]: run }));
    recordSubmission(run);
  }, [recordSubmission]);

  // Review runs can sit open for a while, so keep the card chips fresh while
  // anything is in flight (the dialog also polls its own run).
  const anyRunning = Object.values(preps).some((run) => run.stage === 'running');
  useEffect(() => {
    // Same-origin base is '' (truthy check would disable polling here).
    if (prepBase === null || !anyRunning) return;
    const timer = window.setInterval(() => {
      void latestPreps(prepBase).then((runs) => {
        // Merge: latestPreps only returns finished runs, so replacing the map
        // would drop the run that is currently waiting for you.
        setPreps((prev) => {
          const next = { ...prev };
          for (const run of runs) next[`${run.source}:${run.externalId}`] = run;
          return next;
        });
        // The dialog may be closed while the review window is submitted, so the
        // applied flag must not depend on it being open.
        for (const run of runs) recordSubmission(run);
      });
    }, 4000);
    return () => window.clearInterval(timer);
  }, [prepBase, anyRunning, recordSubmission]);

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
    if (filters.verdict === 'relevant') {
      // The default view: rejected roles stay out of the way, unjudged ones stay in.
      if (job.verdict === 'no') return false;
    } else if (filters.verdict !== 'all') {
      if (filters.verdict === 'unjudged') {
        if (job.verdict) return false;
      } else if (job.verdict !== filters.verdict) return false;
    }

    if (filters.remoteOnly) {
      const loc = (job.location || '').toLowerCase();
      const remote = job.workplace_type?.toLowerCase().includes('rem') || loc.includes('remote');
      if (!remote) return false;
    }

    if (filters.newOnly && !isNewJob(job)) return false;

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
    relevant: jobs.filter((job) => job.verdict !== 'no').length,
    strong: jobs.filter((job) => job.verdict === 'strong').length,
    fair: jobs.filter((job) => job.verdict === 'fair').length,
    weak: jobs.filter((job) => job.verdict === 'weak').length,
    no: jobs.filter((job) => job.verdict === 'no').length,
    unjudged: jobs.filter((job) => !job.verdict).length,
  }), [jobs]);

  const clearFilters = () => setFilters(initialFilters);
  const hasActiveFilters = filters.search || filters.verdict !== 'relevant' || filters.country || filters.dateFrom || filters.dateTo || filters.remoteOnly || filters.newOnly || filters.applied !== 'all';

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
              <span className="block text-xl font-semibold tabular-nums">{filteredJobs.filter((job) => job.verdict === 'strong').length}</span>
              <span className="text-xs text-ink-soft">strong matches</span>
            </div>
          </div>
        </section>

        {showActivity && <ActivityPanel jobs={jobs} appliedAtByKey={applied} />}

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
            <button
              type="button"
              onClick={() => setShowActivity((v) => !v)}
              aria-pressed={showActivity}
              className={`mb-5 w-full rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors ${showActivity ? 'bg-ink text-surface' : 'bg-brand text-ink hover:brightness-95'}`}
            >
              {showActivity ? 'Hide activity' : 'Show activity'}
            </button>
            <div className="space-y-5">
              <fieldset>
                <legend className="mb-3 text-sm font-semibold">Match</legend>
                <div className="space-y-2.5">
                  {([
                    ['all', 'All roles'], ['relevant', 'Hide rejected'], ['strong', 'Strong match'], ['fair', 'Fair match'], ['weak', 'Weak match'], ['no', 'Pass'], ['unjudged', 'Not reviewed'],
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
                <label className="mt-4 flex cursor-pointer items-center justify-between gap-3 text-sm font-medium">
                  <span>New this scan <span className="text-xs font-normal text-ink-faint">(last 3 days)</span></span>
                  <input type="checkbox" checked={filters.newOnly} onChange={(event) => setFilters({ ...filters, newOnly: event.target.checked })} />
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
                {prepProbed && prepBase === null && (
                  <p className="mt-1 text-xs text-ink-faint">Auto-fill runs on your machine: start <code className="rounded bg-white/70 px-1">jobhopper ui</code> to enable it.</p>
                )}
              </div>
              {hasActiveFilters && <button type="button" onClick={clearFilters} className="inline-flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-xs font-medium text-ink-soft hover:text-ink"><SlidersHorizontal className="h-3.5 w-3.5" /> Clear filters</button>}
            </div>

            {loading ? (
              <div className="rounded-2xl border border-line bg-surface py-24 text-center text-sm text-ink-soft">Loading roles…</div>
            ) : filteredJobs.length > 0 ? (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                {filteredJobs.map((job, index) => <JobCard key={`${job.source}-${job.external_id}`} job={job} index={index} appliedAt={effectiveAppliedAt(job)} onApplyClick={setToastJob} prepAvailable={prepBase !== null} prepState={prepStateFor(job)} onPrep={setPrepJob} />)}
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
        {prepJob && prepBase !== null && (
          <PrepDialog
            key={prepKey(prepJob)}
            job={prepJob}
            base={prepBase}
            onClose={() => setPrepJob(null)}
            onRun={prepFinished}
          />
        )}
      </AnimatePresence>

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