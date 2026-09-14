import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { getPaths } from '../storage/paths.js';
import { DEFAULT_MODEL, DEFAULT_MODELS } from '../judge/models.js';

export interface AppConfig {
  /** OpenRouter API key. Leave empty to rely on JOBHOPPER_OPENROUTER_KEY env var. */
  openrouterKey: string;
  /** Model id used for judging. */
  model: string;
  /** Model id used for fast batch/quick judgments. */
  quickModel: string;
}

export function defaultConfig(): AppConfig {
  return {
    openrouterKey: '',
    model: DEFAULT_MODEL,
    quickModel: DEFAULT_MODELS.quick,
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

/** The key jobhopper will use, resolved from file or environment. */
export function resolveApiKey(config: AppConfig): string {
  const fromEnv = process.env['JOBHOPPER_OPENROUTER_KEY'] ?? process.env['OPENROUTER_API_KEY'] ?? '';
  return config.openrouterKey || fromEnv;
}

/** Whether a usable API key is available. */
export function hasApiKey(config: AppConfig): boolean {
  return resolveApiKey(config).length > 0;
}