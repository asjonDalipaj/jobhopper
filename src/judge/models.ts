/**
 * Default OpenRouter model choices for jobhopper.
 * These are model ids as the OpenRouter API accepts them.
 * Users can override any of these via `jobhopper config`.
 */

export const DEFAULT_MODELS = {
  /** Used for full judgments. Balances reasoning quality and cost. */
  full: 'openai/gpt-4o-mini',
  /** Used for fast batch/quick screenings. */
  quick: 'openai/gpt-4o-mini',
} as const;

/** Friendly descriptions for `jobhopper config list-models`. */
export const MODEL_PRESETS: Record<string, string> = {
  'openai/gpt-4o-mini': 'Fast and cheap; good default for screening.',
  'openai/gpt-4o': 'Higher quality reasoning; more tokens per judgment.',
  'anthropic/claude-3.5-sonnet': 'Strong long-context reasoning.',
  'anthropic/claude-3.7-sonnet': 'Anthropic latest; excellent judgment quality.',
  'deepseek/deepseek-chat': 'Very low cost, solid reasoning.',
  'meta-llama/llama-3.3-70b-instruct': 'Good open-weights model; low cost.',
};