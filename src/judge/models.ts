/**
 * Default model choices for jobhopper. OpenRouter ids and DeepSeek direct ids
 * are different namespaces; both are configurable.
 */

export const DEFAULT_MODELS = {
  /** Used for full judgments. Balances reasoning quality and cost. */
  full: 'openai/gpt-4o-mini',
  /** Used for fast batch/quick screenings. */
  quick: 'openai/gpt-4o-mini',
} as const;

/** DeepSeek direct API model ids (https://api.deepseek.com). */
export const DEFAULT_DEEPSEEK_MODELS = {
  /** Full judgments and CV/letter generation. */
  full: 'deepseek-v4-pro',
  /** Fast batch/quick judgments. */
  quick: 'deepseek-flash',
} as const;

/** Friendly descriptions for `jobhopper config list-models`. */
export const MODEL_PRESETS: Record<string, string> = {
  'openai/gpt-4o-mini': 'Fast and cheap; good default for screening.',
  'openai/gpt-4o': 'Higher quality reasoning; more tokens per judgment.',
  'anthropic/claude-3.5-sonnet': 'Strong long-context reasoning.',
  'anthropic/claude-3.7-sonnet': 'Anthropic latest; excellent judgment quality.',
  'deepseek/deepseek-chat': 'OpenRouter: very low cost, solid reasoning.',
  'deepseek-v4-pro': 'DeepSeek direct: full judgments and writing.',
  'deepseek-flash': 'DeepSeek direct: fast, cheap batch screening.',
  'meta-llama/llama-3.3-70b-instruct': 'Good open-weights model; low cost.',
};