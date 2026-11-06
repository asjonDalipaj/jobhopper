import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { getPaths } from '../storage/paths.js';
import { DEFAULT_DEEPSEEK_MODELS, DEFAULT_MODELS } from '../judge/models.js';

export type JudgeProviderPreference = 'auto' | 'openrouter' | 'deepseek';

export interface AppConfig {
  /** OpenRouter API key. Leave empty to rely on the env vars. */
  openrouterKey: string;
  /** DeepSeek direct API key. Leave empty to rely on the env vars. */
  deepseekKey: string;
  /** auto: OpenRouter when present, otherwise DeepSeek. */
  judgeProvider: JudgeProviderPreference;
  /** OpenRouter model id used for full judgments. */
  model: string;
  /** OpenRouter model id used for fast batch/quick judgments. */
  quickModel: string;
  /** DeepSeek direct model id used for full judgments. */
  deepseekModel: string;
  /** DeepSeek direct model id used for fast batch/quick judgments. */
  deepseekQuickModel: string;
}

export function defaultConfig(): AppConfig {
  return {
    openrouterKey: '',
    deepseekKey: '',
    judgeProvider: 'auto',
    model: DEFAULT_MODELS.full,
    quickModel: DEFAULT_MODELS.quick,
    deepseekModel: DEFAULT_DEEPSEEK_MODELS.full,
    deepseekQuickModel: DEFAULT_DEEPSEEK_MODELS.quick,
  };
}

export function loadConfig(): AppConfig {
  const { configFile } = getPaths();
  if (!existsSync(configFile)) return defaultConfig();
  try {
    const raw = JSON.parse(readFileSync(configFile, 'utf8'));
    return { ...defaultConfig(), ...raw };
  } catch {
    return defaultConfig();
  }
}

export function saveConfig(config: AppConfig): void {
  const { configFile } = getPaths();
  writeFileSync(configFile, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
}

/** The OpenRouter key, from the config file or the environment. */
export function resolveOpenRouterKey(config: AppConfig, env: NodeJS.ProcessEnv = process.env): string {
  return config.openrouterKey || env['JOBHOPPER_OPENROUTER_KEY'] || env['OPENROUTER_API_KEY'] || '';
}

/** The DeepSeek direct key, from the config file or the environment. */
export function resolveDeepSeekKey(config: AppConfig, env: NodeJS.ProcessEnv = process.env): string {
  return config.deepseekKey || env['JOBHOPPER_DEEPSEEK_KEY'] || env['DEEPSEEK_API_KEY'] || '';
}

/** Whether either provider has a usable key. */
export function hasApiKey(config: AppConfig, env: NodeJS.ProcessEnv = process.env): boolean {
  const envPreference = env['JOBHOPPER_JUDGE_PROVIDER'];
  const preference =
    envPreference === 'auto' || envPreference === 'openrouter' || envPreference === 'deepseek'
      ? envPreference
      : (config.judgeProvider ?? 'auto');
  if (preference === 'openrouter') return Boolean(resolveOpenRouterKey(config, env));
  if (preference === 'deepseek') return Boolean(resolveDeepSeekKey(config, env));
  return Boolean(resolveOpenRouterKey(config, env) || resolveDeepSeekKey(config, env));
}
