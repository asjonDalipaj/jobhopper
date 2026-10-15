import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ExternalLink,
  ChevronDown,
  Building2,
  MapPin,
  Calendar,
  Sparkles,
  Tag
} from 'lucide-react';
import type { Job } from '../types';
import { VerdictBadge } from './VerdictBadge';
import { formatDate } from '../utils';

interface JobCardProps {
  job: Job;
}

export const JobCard: React.FC<JobCardProps> = ({ job }) => {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className="group rounded-2xl border border-line bg-surface transition-colors hover:border-line-strong hover:bg-surface-hover"
    >
      <div className="space-y-4 p-4 sm:p-5">
        {/* Header */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 space-y-1.5">
            <h3 className="text-base font-semibold leading-snug tracking-tight text-ink sm:text-lg">
              {job.title}
            </h3>

            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-ink-soft">
              <span className="inline-flex items-center gap-1.5 font-semibold text-ink">
                <Building2 className="h-3.5 w-3.5 shrink-0 text-ink-faint" aria-hidden="true" />
                {job.company}
              </span>
              <span className="hidden text-line-strong sm:inline" aria-hidden="true">·</span>
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5 shrink-0 text-ink-faint" aria-hidden="true" />
                {job.location}
              </span>
              {job.workplace_type && (
                <>
                  <span className="hidden text-line-strong sm:inline" aria-hidden="true">·</span>
                  <span className="rounded-md border border-line bg-surface-well px-2 py-1 text-[11px] text-ink-soft">
                    {job.workplace_type}
                  </span>
                </>
              )}
              {job.posted_at && (
                <>
                  <span className="hidden text-line-strong sm:inline" aria-hidden="true">·</span>
                  <span className="inline-flex items-center gap-1.5 text-[11px] text-ink-faint">
                    <Calendar className="h-3 w-3" aria-hidden="true" />
                    {formatDate(job.posted_at)}
                  </span>
                </>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 sm:shrink-0">
            <VerdictBadge verdict={job.verdict} />
          </div>
        </div>

        {/* Tags */}
        {job.tags && (
          <div className="flex items-center gap-1.5 flex-wrap">
            <Tag className="w-3 h-3 text-ink-faint" />
            {job.tags.split(',').map((tag, i) => (
              <span
                key={i}
                className="text-[11px] font-mono px-2 py-0.5 rounded bg-surface-well text-ink-soft border border-line"
              >
                {tag.trim()}
              </span>
            ))}
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-between border-t border-line pt-3 text-xs">
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-md pr-2 text-ink-soft transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral cursor-pointer"
            aria-expanded={expanded}
          >
            <span>{expanded ? 'Hide details' : 'View details'}</span>
            <ChevronDown
              className={`w-3.5 h-3.5 transition-transform duration-200 ${
                expanded ? 'rotate-180' : ''
              }`}
            />
          </button>

          {job.url && (
            <a
              href={job.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-coral px-4 text-xs font-semibold text-white transition-colors hover:bg-coral/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral focus-visible:ring-offset-2 focus-visible:ring-offset-surface cursor-pointer"
            >
              <span>Apply</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </div>

        {/* Expanded Description */}
        <AnimatePresence>
          {expanded && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="mt-1 max-h-96 space-y-4 overflow-y-auto rounded-xl border border-line bg-surface-well p-4 text-sm leading-6 text-ink-soft">
                {job.reasoning && (
                  <section>
                    <h4 className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-ink">
                      <Sparkles className="h-3.5 w-3.5 text-emerald-700 dark:text-emerald-300" aria-hidden="true" />
                      Match notes
                    </h4>
                    <p className="whitespace-pre-wrap">{job.reasoning}</p>
                  </section>
                )}
                <section>
                  {job.reasoning && <h4 className="mb-1 text-xs font-semibold text-ink">Role description</h4>}
                  <p className="whitespace-pre-wrap">{job.description || 'No detailed description available.'}</p>
                </section>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};
