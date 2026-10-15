import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ExternalLink, ChevronDown, Building2, MapPin, Calendar, Sparkles, Tag } from 'lucide-react';
import type { Job } from '../types';
import { VerdictBadge } from './VerdictBadge';
import { formatDate } from '../utils';

interface JobCardProps {
  job: Job;
  index: number;
}

const cardTints = ['card-tint-blue', 'card-tint-mint', 'card-tint-pink', 'card-tint-lilac', 'card-tint-slate', 'card-tint-peach'];

export const JobCard: React.FC<JobCardProps> = ({ job, index }) => {
  const [expanded, setExpanded] = useState(false);
  const tint = cardTints[index % cardTints.length];

  return (
    <motion.article
      layout
      className={`job-card ${tint} flex min-h-[320px] flex-col overflow-hidden rounded-2xl border border-black/5 p-5 transition-shadow hover:shadow-md sm:p-6`}
    >
      <div className="mb-5 flex items-start justify-between gap-3">
        <div className="company-mark flex h-12 w-12 items-center justify-center rounded-full bg-white/85 text-ink shadow-sm" aria-hidden="true">
          <Building2 className="h-5 w-5" />
        </div>
        <VerdictBadge verdict={job.verdict} />
      </div>

      <h3 className="text-lg font-semibold leading-snug tracking-tight text-ink">{job.title}</h3>
      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink-soft">
        <span className="font-medium text-ink">{job.company}</span>
        <span aria-hidden="true">·</span>
        <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{job.location}</span>
      </div>

      <div className="mt-4 flex flex-wrap gap-2 text-xs text-ink-soft">
        {job.workplace_type && <span className="rounded-md bg-white/65 px-2.5 py-1.5">{job.workplace_type}</span>}
        {job.employment_type && <span className="rounded-md bg-white/65 px-2.5 py-1.5">{job.employment_type}</span>}
        {job.posted_at && <span className="inline-flex items-center gap-1 rounded-md bg-white/65 px-2.5 py-1.5"><Calendar className="h-3 w-3" />{formatDate(job.posted_at)}</span>}
      </div>

      {job.tags && <div className="mt-3 flex flex-wrap gap-1.5" aria-label="Skills and keywords">
        <Tag className="mr-0.5 h-3.5 w-3.5 self-center text-ink-faint" />
        {job.tags.split(',').slice(0, 4).map((tag) => <span key={tag} className="rounded-md bg-white/55 px-2 py-1 text-[11px] text-ink-soft">{tag.trim()}</span>)}
      </div>}

      <div className="mt-auto pt-6">
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-2">
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            aria-expanded={expanded}
            className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-ink/50 bg-white/25 px-3 text-sm font-medium text-ink transition-colors hover:bg-white/65"
          >
            Details
            <ChevronDown className={`h-4 w-4 transition-transform ${expanded ? 'rotate-180' : ''}`} />
          </button>
          {job.url && <a href={job.url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-ink px-3 text-sm font-medium text-white transition-opacity hover:opacity-85">
            Apply <ExternalLink className="h-3.5 w-3.5" />
          </a>}
        </div>

        <AnimatePresence initial={false}>
          {expanded && <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.18 }} className="overflow-hidden">
            <div className="mt-4 space-y-3 border-t border-ink/10 pt-4">
              {job.reasoning && <div className="rounded-xl bg-white/60 p-3 text-sm leading-6 text-ink-soft">
                <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-ink"><Sparkles className="h-3.5 w-3.5" />Private profile match</div>
                <p>{job.reasoning}</p>
              </div>}
              <div className="max-h-64 overflow-y-auto whitespace-pre-wrap text-sm leading-6 text-ink-soft">{job.description || 'No detailed description available.'}</div>
            </div>
          </motion.div>}
        </AnimatePresence>
      </div>
    </motion.article>
  );
};