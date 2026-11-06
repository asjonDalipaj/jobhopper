import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseIntervalMinutes } from '../watch/interval.js';

test('parseIntervalMinutes converts minutes to milliseconds', () => {
  assert.equal(parseIntervalMinutes('15'), 900_000);
  assert.equal(parseIntervalMinutes('0.5'), 30_000);
});

test('parseIntervalMinutes rejects zero, negative and non-numeric values', () => {
  assert.throws(() => parseIntervalMinutes('0'), /positive number of minutes/);
  assert.throws(() => parseIntervalMinutes('-5'), /positive number of minutes/);
  assert.throws(() => parseIntervalMinutes('soon'), /positive number of minutes/);
});
