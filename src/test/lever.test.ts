import { test } from 'node:test';
import assert from 'node:assert/strict';
import { leverAnswer } from '../apply/lever.js';
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
    questions: [{ match: 'authorized to work', answer: 'Yes' }, { match: 'salary expectations', answer: 'EUR 80k' }],
  },
} as unknown as ApplyContext;

test('leverAnswer maps Lever question labels to profile data', () => {
  assert.equal(leverAnswer('LinkedIn URL', ctx), 'https://linkedin.com/in/asjon');
  assert.equal(leverAnswer('Phone', ctx), '612345678');
  assert.equal(leverAnswer('Are you legally authorized to work in Italy?', ctx), 'Yes');
  assert.equal(leverAnswer('Salary expectations', ctx), 'EUR 80k');
  assert.equal(leverAnswer('Where are you currently based?', ctx), 'Utrecht, Netherlands');
  assert.equal(leverAnswer('Favourite colour?', ctx), null);
});
