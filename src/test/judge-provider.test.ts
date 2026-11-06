import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultConfig, hasApiKey, resolveDeepSeekKey, resolveOpenRouterKey } from '../config/config.js';
import { normalizeDeepSeekModel, resolveJudgeProvider } from '../judge/provider.js';
import { chatJson } from '../judge/client.js';

const base = defaultConfig();

test('auto prefers OpenRouter when both keys exist', () => {
  const config = { ...base, openrouterKey: 'or-key', deepseekKey: 'ds-key' };
  const provider = resolveJudgeProvider(config, {});
  assert.equal(provider.name, 'openrouter');
  assert.equal(provider.model, config.model);
  assert.equal(provider.url, 'https://openrouter.ai/api/v1/chat/completions');
  assert.equal(provider.headers['X-Title'], 'jobhopper');
});

test('auto falls back to DeepSeek with its own model ids', () => {
  const config = { ...base, deepseekKey: 'ds-key' };
  const provider = resolveJudgeProvider(config, {});
  assert.equal(provider.name, 'deepseek');
  assert.equal(provider.url, 'https://api.deepseek.com/chat/completions');
  assert.equal(provider.model, 'deepseek-v4-pro');
  assert.deepEqual(provider.bodyExtras.thinking, { type: 'disabled' });
  assert.equal(resolveJudgeProvider(config, {}, { quick: true }).model, 'deepseek-flash');
});

test('JOBHOPPER_JUDGE_PROVIDER overrides the saved preference', () => {
  const config = { ...base, openrouterKey: 'or-key', deepseekKey: 'ds-key' };
  assert.equal(resolveJudgeProvider(config, { JOBHOPPER_JUDGE_PROVIDER: 'deepseek' }).name, 'deepseek');
  assert.equal(resolveJudgeProvider(config, { JOBHOPPER_JUDGE_PROVIDER: 'openrouter' }).name, 'openrouter');
});

test('explicit deepseek wins over a present OpenRouter key', () => {
  const config = { ...base, openrouterKey: 'or-key', deepseekKey: 'ds-key', judgeProvider: 'deepseek' as const };
  assert.equal(resolveJudgeProvider(config, {}).name, 'deepseek');
});

test('explicit provider without its key fails loudly', () => {
  assert.throws(
    () => resolveJudgeProvider({ ...base, judgeProvider: 'deepseek' }, { OPENROUTER_API_KEY: 'or-key' }),
    /DEEPSEEK_API_KEY/,
  );
});

test('no keys mentions both env vars', () => {
  assert.throws(() => resolveJudgeProvider(base, {}), /DEEPSEEK_API_KEY.*OPENROUTER_API_KEY/s);
});

test('DeepSeek base URL and model override are respected', () => {
  const config = { ...base, deepseekKey: 'ds-key' };
  const provider = resolveJudgeProvider(config, { DEEPSEEK_BASE_URL: 'https://example.test/v1/' }, {
    model: 'deepseek/deepseek-v4-flash',
  });
  assert.equal(provider.url, 'https://example.test/v1/chat/completions');
  assert.equal(provider.model, 'deepseek-flash');
  assert.equal(normalizeDeepSeekModel('deepseek/deepseek-v4-pro'), 'deepseek-v4-pro');
});

test('key resolution and hasApiKey cover both providers', () => {
  const config = { ...base, deepseekKey: 'ds-key' };
  assert.equal(resolveDeepSeekKey(config, {}), 'ds-key');
  assert.equal(resolveOpenRouterKey(config, {}), '');
  assert.equal(hasApiKey(config, {}), true);
  assert.equal(hasApiKey(base, { DEEPSEEK_API_KEY: 'env-key' }), true);
  assert.equal(hasApiKey(base, {}), false);
  assert.equal(hasApiKey({ ...base, judgeProvider: 'deepseek' }, { OPENROUTER_API_KEY: 'or-key' }), false);
  assert.equal(hasApiKey({ ...base, judgeProvider: 'openrouter' }, { DEEPSEEK_API_KEY: 'ds-key' }), false);
});


test('chatJson sends a DeepSeek JSON-mode request with thinking disabled', async () => {
  const config = { ...base, deepseekKey: 'ds-key' };
  let captured: { url: string; init: RequestInit } | undefined;
  const original = globalThis.fetch;
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    captured = { url: String(url), init: init ?? {} };
    return new Response(JSON.stringify({
      choices: [{ message: { content: '{"verdict":"fair"}' } }],
      model: 'deepseek-v4-pro',
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }) as typeof fetch;
  try {
    const result = await chatJson({ messages: [{ role: 'user', content: 'x' }] }, config, {});
    assert.equal(result.provider, 'deepseek');
    assert.equal(captured?.url, 'https://api.deepseek.com/chat/completions');
    const body = JSON.parse(String(captured?.init.body)) as Record<string, unknown>;
    assert.equal(body.model, 'deepseek-v4-pro');
    assert.deepEqual(body.response_format, { type: 'json_object' });
    assert.deepEqual(body.thinking, { type: 'disabled' });
    assert.equal((captured?.init.headers as Record<string, string>).Authorization, 'Bearer ds-key');
  } finally {
    globalThis.fetch = original;
  }
});
