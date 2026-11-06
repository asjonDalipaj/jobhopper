/**
 * Resolve which OpenAI-compatible provider handles a model call.
 *
 * auto: OpenRouter when its key is present, otherwise DeepSeek.
 * Explicit `judgeProvider` forces one and fails loudly if its key is missing.
 */

import type { AppConfig } from '../config/config.js';
import { resolveDeepSeekKey, resolveOpenRouterKey } from '../config/config.js';

export type JudgeProviderName = 'openrouter' | 'deepseek';

export interface JudgeProvider {
  name: JudgeProviderName;
  apiKey: string;
  url: string;
  model: string;
  /** Provider-specific headers (OpenRouter attribution). */
  headers: Record<string, string>;
  /** Provider-specific request fields (DeepSeek thinking toggle). */
  bodyExtras: Record<string, unknown>;
}

export interface JudgeModelOptions {
  quick?: boolean;
  model?: string;
}

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const DEEPSEEK_DEFAULT_URL = 'https://api.deepseek.com';

/** OpenRouter uses `deepseek/deepseek-v4-*`; direct DeepSeek ids drop the prefix. */
export function normalizeDeepSeekModel(id: string): string {
  const bare = id.trim().replace(/^deepseek\//i, '');
  return bare === 'deepseek-v4-flash' ? 'deepseek-flash' : bare;
}

function keyError(): Error {
  return new Error(
    'No judge API key configured. Set DEEPSEEK_API_KEY or OPENROUTER_API_KEY, ' +
      'or run `jobhopper config set-deepseek-key` / `set-openrouter-key`.',
  );
}

export function resolveJudgeProvider(
  config: AppConfig,
  env: NodeJS.ProcessEnv = process.env,
  options: JudgeModelOptions = {},
): JudgeProvider {
  const openrouterKey = resolveOpenRouterKey(config, env);
  const deepseekKey = resolveDeepSeekKey(config, env);
  const envPreference = env['JOBHOPPER_JUDGE_PROVIDER'];
  const preference =
    envPreference === 'auto' || envPreference === 'openrouter' || envPreference === 'deepseek'
      ? envPreference
      : (config.judgeProvider ?? 'auto');

  let name: JudgeProviderName;
  if (preference === 'openrouter') {
    if (!openrouterKey) throw new Error('judgeProvider is "openrouter" but OPENROUTER_API_KEY is not set');
    name = 'openrouter';
  } else if (preference === 'deepseek') {
    if (!deepseekKey) throw new Error('judgeProvider is "deepseek" but DEEPSEEK_API_KEY is not set');
    name = 'deepseek';
  } else if (openrouterKey) {
    name = 'openrouter';
  } else if (deepseekKey) {
    name = 'deepseek';
  } else {
    throw keyError();
  }

  if (name === 'openrouter') {
    const model = options.model ?? (options.quick ? config.quickModel : config.model);
    return {
      name,
      apiKey: openrouterKey,
      url: OPENROUTER_URL,
      model,
      headers: { 'HTTP-Referer': 'https://github.com/asjonDalipaj/jobhopper', 'X-Title': 'jobhopper' },
      bodyExtras: {},
    };
  }

  const baseUrl = (env['DEEPSEEK_BASE_URL'] || DEEPSEEK_DEFAULT_URL).replace(/\/+$/, '');
  const model = options.model
    ? normalizeDeepSeekModel(options.model)
    : options.quick
      ? config.deepseekQuickModel
      : config.deepseekModel;
  return {
    name,
    apiKey: deepseekKey,
    url: `${baseUrl}/chat/completions`,
    model,
    headers: {},
    // Judging is extraction, not open-ended reasoning; disable thinking so the
    // response is the JSON object and the latency/cost stay predictable.
    bodyExtras: { thinking: { type: 'disabled' } },
  };
}
