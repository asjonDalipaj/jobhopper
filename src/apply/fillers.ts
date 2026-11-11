/** Single source of truth for which filler handles a detected ATS. */
import type { Ats } from './ats.js';
import type { ApplyContext, ApplyResult } from './greenhouse.js';
import { applyGreenhouse } from './greenhouse.js';
import { applyAshby } from './ashby.js';
import { applyLever } from './lever.js';

export function fillerFor(ats: Ats): (ctx: ApplyContext) => Promise<ApplyResult> {
  if (ats === 'greenhouse') return applyGreenhouse;
  if (ats === 'ashby') return applyAshby;
  if (ats === 'lever') return applyLever;
  throw new Error(`${ats} is detected but has no apply adapter`);
}
