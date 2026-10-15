import React, { useMemo, useState } from 'react';
import { Activity } from 'lucide-react';
import type { Job, Verdict } from '../types';

interface ActivityPanelProps {
  /** All loaded jobs (unfiltered — the panel shows totals, not the view). */
  jobs: Job[];
  /** Effective applied timestamps keyed by `${source}-${external_id}`. */
  appliedAtByKey: Record<string, string>;
}

/** Number of weeks shown in the chart (including the current one). */
const WEEKS_SHOWN = 6;

/** Monday 00:00 of the week containing `date`. */
function weekStart(date: Date): number {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d.getTime();
}

function shortDate(ms: number): string {
  return new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export const ActivityPanel: React.FC<ActivityPanelProps> = ({ jobs, appliedAtByKey }) => {
  // Captured once per mount: the panel buckets by week, so per-render
  // precision is irrelevant and Date.now() stays out of the render path.
  const [now] = useState(() => Date.now());
  const stats = useMemo(() => {
    const thisWeek = weekStart(new Date(now));
    const weeks = Array.from({ length: WEEKS_SHOWN }, (_, i) => thisWeek - (WEEKS_SHOWN - 1 - i) * 7 * 86400000);

    const appliedList = jobs
      .map((job) => appliedAtByKey[`${job.source}-${job.external_id}`] ?? job.applied_at ?? null)
      .filter((t): t is string => Boolean(t));
    const appliedTimes = appliedList.map((t) => new Date(t).getTime()).filter((t) => !Number.isNaN(t));

    const newPerWeek = weeks.map((w) => jobs.filter((j) => {
      const t = j.first_seen ? new Date(j.first_seen).getTime() : NaN;
      return !Number.isNaN(t) && t >= w && t < w + 7 * 86400000;
    }).length);
    const appliedPerWeek = weeks.map((w) => appliedTimes.filter((t) => t >= w && t < w + 7 * 86400000).length);

    const verdictCounts: Record<Verdict | 'unjudged', number> = { strong: 0, fair: 0, weak: 0, no: 0, unjudged: 0 };
    for (const job of jobs) {
      verdictCounts[job.verdict ?? 'unjudged']++;
    }

    return {
      weeks,
      newPerWeek,
      appliedPerWeek,
      verdictCounts,
      judged: jobs.length - verdictCounts.unjudged,
      applied: appliedTimes.length,
      maxBar: Math.max(1, ...newPerWeek, ...appliedPerWeek),
    };
  }, [jobs, appliedAtByKey, now]);

  const { weeks, newPerWeek, appliedPerWeek, verdictCounts, judged, applied, maxBar } = stats;
  const applicationRate = judged > 0 ? Math.round((applied / judged) * 100) : 0;

  // Chart geometry
  const chartW = 560;
  const chartH = 150;
  const barGap = 16;
  const groupW = chartW / weeks.length;
  const barW = Math.max(8, (groupW - barGap * 2) / 2);

  const verdictRows: Array<[string, number, string]> = [
    ['Strong', verdictCounts.strong, 'bg-mint'],
    ['Fair', verdictCounts.fair, 'bg-butter'],
    ['Weak', verdictCounts.weak, 'bg-coral'],
    ['Pass', verdictCounts.no, 'bg-ink-faint'],
    ['Not reviewed', verdictCounts.unjudged, 'bg-ink/20'],
  ];

  return (
    <section aria-label="Application activity" className="mb-8 rounded-2xl border border-line bg-surface p-5 sm:p-6">
      <div className="mb-5 flex items-center gap-2">
        <Activity className="h-4 w-4 text-ink-soft" aria-hidden="true" />
        <h3 className="text-lg font-semibold">Application activity</h3>
      </div>

      {/* Summary tiles */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          [jobs.length, 'scanned'],
          [judged, 'judged'],
          [applied, 'applied'],
          [`${applicationRate}%`, 'of judged applied'],
        ].map(([value, label]) => (
          <div key={label} className="rounded-xl border border-line bg-surface-well px-4 py-3">
            <span className="block text-xl font-semibold tabular-nums">{value}</span>
            <span className="text-xs text-ink-soft">{label}</span>
          </div>
        ))}
      </div>

      {/* Weekly bars: discovered vs applied */}
      <div className="mt-6">
        <div className="mb-2 flex items-center gap-4 text-xs text-ink-soft">
          <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-ink/70" aria-hidden="true" /> jobs discovered</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-mint" aria-hidden="true" /> applications</span>
        </div>
        <svg viewBox={`0 0 ${chartW} ${chartH + 24}`} role="img" aria-label={`Weekly job discoveries and applications over the last ${WEEKS_SHOWN} weeks`} className="w-full">
          {weeks.map((w, i) => {
            const groupX = i * groupW;
            const newH = (newPerWeek[i] / maxBar) * chartH;
            const appliedH = (appliedPerWeek[i] / maxBar) * chartH;
            return (
              <g key={w}>
                <rect x={groupX + barGap} y={chartH - newH} width={barW} height={newH} rx={3} className="fill-ink/70" />
                <rect x={groupX + barGap + barW + 8} y={chartH - appliedH} width={barW} height={appliedH} rx={3} className="fill-mint" />
                <text x={groupX + groupW / 2} y={chartH + 16} textAnchor="middle" className="fill-ink-soft text-[11px]">{shortDate(w)}</text>
              </g>
            );
          })}
          <line x1={0} y1={chartH} x2={chartW} y2={chartH} className="stroke-line" strokeWidth={1} />
        </svg>
      </div>

      {/* Verdict distribution */}
      <div className="mt-6 grid gap-2">
        {verdictRows.map(([label, count, bg]) => (
          <div key={label} className="flex items-center gap-3 text-sm">
            <span className="w-24 shrink-0 text-ink-soft">{label}</span>
            <span className="h-2 flex-1 overflow-hidden rounded-full bg-surface-well">
              <span className={`block h-full rounded-full ${bg}`} style={{ width: `${jobs.length ? (count / jobs.length) * 100 : 0}%` }} />
            </span>
            <span className="w-8 shrink-0 text-right text-xs tabular-nums text-ink-soft">{count}</span>
          </div>
        ))}
      </div>
    </section>
  );
};
