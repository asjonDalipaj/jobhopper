/**
 * One OpenAI-compatible chat call for every AI feature (judge, metadata,
 * CV tailoring, cover letters). Provider selection lives in provider.ts.
 */

import { loadConfig, type AppConfig } from '../config/config.js';
import { resolveJudgeProvider, type JudgeProviderName } from './provider.js';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatJsonResult {
  content: string;
  model: string;
  provider: JudgeProviderName;
}

/**
 * Ask the chosen provider for a JSON object and return the raw content.
 * Parsing/validation belongs to the caller (judge, tailor, letter).
 */
export async function chatJson(
  options: {
    messages: ChatMessage[];
    temperature?: number;
    quick?: boolean;
    model?: string;
  },
  config: AppConfig = loadConfig(),
  env: NodeJS.ProcessEnv = process.env,
): Promise<ChatJsonResult> {
  const provider = resolveJudgeProvider(config, env, {
    quick: options.quick,
    model: options.model,
  });

  const res = await fetch(provider.url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${provider.apiKey}`,
      ...provider.headers,
    },
    body: JSON.stringify({
      model: provider.model,
      messages: options.messages,
      response_format: { type: 'json_object' },
      temperature: options.temperature ?? 0.2,
      ...provider.bodyExtras,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`${provider.name} returned HTTP ${res.status}: ${body.slice(0, 300)}`);
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    model?: string;
  };
  const content = data.choices?.[0]?.message?.content ?? '';
  if (!content.trim()) {
    throw new Error(`${provider.name} returned an empty JSON response`);
  }
  return { content, model: data.model ?? provider.model, provider: provider.name };
}
