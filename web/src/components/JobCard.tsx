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
  index: number;
}

export const JobCard: React.FC<JobCardProps> = ({ job, index }) => {
  const [expanded, setExpanded] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: Math.min(index * 0.04, 0.4) }}
      className="group relative rounded-2xl bg-surface hover:bg-surface-hover border border-line/70 hover:border-line-strong shadow-sm hover:shadow-md transition-all duration-200 overflow-hidden"
    >
      <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-coral/0 to-transparent group-hover:via-coral/40 transition-all duration-300" />

      <div className="p-5 sm:p-6 space-y-4">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
          <div className="space-y-1 pr-2">
            <h3 className="text-base sm:text-lg font-semibold text-ink group-hover:text-ink tracking-tight">
              {job.title}
            </h3>

            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-soft">
              <span className="flex items-center gap-1 font-medium text-ink">
                <Building2 className="w-3.5 h-3.5 text-ink-faint" />
                {job.company}
              </span>
              <span className="text-ink-faint">·</span>
              <span className="flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5 text-ink-faint" />
                {job.location}
              </span>
              {job.workplace_type && (
                <>
                  <span className="text-ink-faint">·</span>
                  <span className="px-1.5 py-0.5 rounded bg-surface-well text-ink-soft text-[11px] font-mono border border-line">
                    {job.workplace_type}
                  </span>
                </>
              )}
              {job.posted_at && (
                <>
                  <span className="text-ink-faint">·</span>
                  <span className="flex items-center gap-1 text-ink-faint font-mono text-[11px]">
                    <Calendar className="w-3 h-3" />
                    {formatDate(job.posted_at)}
                  </span>
                </>
              )}
            </div>
          </div>

          <div className="flex items-center sm:self-start gap-2">
            <VerdictBadge verdict={job.verdict} />
          </div>
        </div>

        {/* AI Insight */}
        {job.reasoning && (
          <div className="rounded-lg bg-surface-well border border-line p-3 text-xs text-ink-soft space-y-1.5">
            <div className="flex items-center gap-1.5 font-mono text-[11px] text-emerald-700 dark:text-emerald-300 font-medium">
              <Sparkles className="w-3.5 h-3.5" />
              <span>AI Match Analysis</span>
            </div>
            <p className="leading-relaxed text-ink-soft line-clamp-2 hover:line-clamp-none transition-all">
              {job.reasoning}
            </p>
          </div>
        )}

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
        <div className="flex items-center justify-between pt-2 border-t border-line text-xs">
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-1 text-ink-soft hover:text-ink font-mono transition-colors cursor-pointer"
          >
            <span>{expanded ? 'Hide description' : 'View description'}</span>
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
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md bg-gradient-to-r from-coral to-butter text-ink hover:opacity-90 shadow-sm font-medium transition-all text-xs cursor-pointer active:scale-95"
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
              <div className="mt-3 p-4 rounded-lg bg-surface-well border border-line text-xs text-ink-soft leading-relaxed font-sans whitespace-pre-wrap max-h-96 overflow-y-auto">
                {job.description || 'No detailed description available.'}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
};
