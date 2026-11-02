import { test } from 'node:test';
import assert from 'node:assert/strict';
import { labelValue, numericAnswer } from '../apply/ashby.js';
import type { ApplyContext } from '../apply/greenhouse.js';

const ctx = {
  doc: {
    name: 'Asjon Kola Dalipaj',
    contact: { email: 'asjon@example.com', phone: '', linkedin: 'https://linkedin.com/in/asjon', github: 'https://github.com/asjon' },
  },
  applicant: {
    country: 'Netherlands',
    phoneNational: '612345678',
    preferredLocation: 'Amsterdam',
    city: 'Utrecht',
    howDidYouHear: 'LinkedIn',
    consentRetention: true,
    questions: [{ match: 'salary expectations', answer: 'EUR 80k' }],
  },
} as unknown as ApplyContext;

test('numericAnswer turns salary strings into numbers', () => {
  assert.equal(numericAnswer('EUR 80k'), '80000');
  assert.equal(numericAnswer('80,000'), '80000');
  assert.equal(numericAnswer('€90.000'), '90000');
  assert.equal(numericAnswer('negotiable'), null);
});

test('labelValue maps Ashby labels to profile data', () => {
  assert.equal(labelValue('Your Preferred Name', ctx), 'Asjon Kola');
  assert.equal(labelValue('LinkedIn Profile', ctx), 'https://linkedin.com/in/asjon');
  assert.equal(labelValue('Phone Number', ctx), '612345678');
  assert.equal(labelValue('Salary expectations', ctx), 'EUR 80k');
  assert.equal(labelValue('Where are you currently based?', ctx), 'Utrecht, Netherlands');
  assert.equal(labelValue('Website', ctx), 'https://github.com/asjon');
  assert.equal(labelValue('Favourite colour?', ctx), null);
});
