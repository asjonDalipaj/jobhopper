import { useState, useEffect, useMemo } from 'react';
import { Header } from './components/Header';
import { FilterBar } from './components/FilterBar';
import { JobCard } from './components/JobCard';
import { SAMPLE_JOBS } from './data/mockJobs';
import type { Job, FilterState } from './types';
import { Briefcase, Inbox } from 'lucide-react';

export function App() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<FilterState>({
    search: '',
    verdict: 'all',
    country: '',
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
        const loc = (job.location || '').toLowerCase();
        if (!loc.includes(filters.country.toLowerCase())) return false;
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

  const availableCountries = useMemo(() => {
    const set = new Set<string>();
    jobs.forEach((j) => {
      const parts = j.location.split(',');
      if (parts.length > 1) {
        const country = parts[parts.length - 1].trim();
        if (country) set.add(country);
      } else if (j.location.trim()) {
        set.add(j.location.trim());
      }
    });
    return Array.from(set).sort();
  }, [jobs]);

  const strongCount = useMemo(() => jobs.filter((j) => j.verdict === 'strong').length, [jobs]);

  return (
    <div className="min-h-screen bg-canvas text-ink flex flex-col selection:bg-ink selection:text-canvas">
      <Header totalJobs={jobs.length} strongMatches={strongCount} />

      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-8 space-y-8">
        <section className="space-y-1.5">
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-ink flex items-center gap-2">
            <Briefcase className="w-6 h-6 text-emerald-600 dark:text-emerald-500" />
            <span>European Engineering Opportunities</span>
          </h2>
          <p className="text-sm text-ink-soft max-w-2xl">
            Aggregated European roles evaluated locally against your profile.
          </p>
        </section>

        <FilterBar
          filters={filters}
          onChange={setFilters}
          availableCountries={availableCountries}
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
        JobHopper · Local data stays on your machine
      </footer>
    </div>
  );
}

export default App;
