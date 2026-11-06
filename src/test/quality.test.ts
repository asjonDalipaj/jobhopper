import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isAgencyCompany, shouldDropAggregator } from '../sources/quality.js';

test('agency heuristic recognizes observed recruiters and consultancies', () => {
  for (const name of ['CarusiHR', 'CarusiHR & Co.', 'Techyon', 'Welyk', 'FORTIL', 'Grafton', 'Digital Talent Agency', 'Accenture', 'Avanade']) {
    assert.equal(isAgencyCompany(name), true, name);
  }
  for (const name of ['TomTom', 'AstraZeneca', 'Hotelbeds', 'Just Eat Takeaway', 'Grafana Labs', 'SICPA']) {
    assert.equal(isAgencyCompany(name), false, name);
  }
});

test('agency description phrases are caught', () => {
  assert.equal(isAgencyCompany('Acme', 'We are recruiting for our client in Milan'), true);
  assert.equal(isAgencyCompany('Acme', 'Build our own platform in Milan'), false);
});

test('aggregator policy drops weak and agency rows only', () => {
  assert.equal(shouldDropAggregator({ source: 'aggregator-careerjet', company: 'Techyon', verdict: 'fair' }), true);
  assert.equal(shouldDropAggregator({ source: 'aggregator-careerjet', company: 'TomTom', verdict: 'weak' }), true);
  assert.equal(shouldDropAggregator({ source: 'aggregator-careerjet', company: 'TomTom', verdict: 'fair' }), false);
  assert.equal(shouldDropAggregator({ source: 'greenhouse', company: 'Techyon', verdict: 'weak' }), false);
});
