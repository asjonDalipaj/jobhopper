import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { CvDocument } from '../cv/schema.js';
import type { Applicant } from '../apply/applicant.js';
import { analyzeProfile, type ProfileSnapshot } from '../profile/doctor.js';

const doc: CvDocument = {
  name: 'Test Person',
  headline: 'Software Engineer',
  location: 'Utrecht, Netherlands  ·  open to Netherlands, Italy, Spain and remote EU',
  contact: {
    email: 'test@example.com',
    phone: '+31 6 1234 5678',
    linkedin: 'linkedin.com/in/test',
    github: 'github.com/test',
  },
  summary: 'Ten years building systems.',
  skills: [{ label: 'Backend', items: ['Java'] }],
  experience: [{ role: 'Engineer', org: 'Acme', place: 'Utrecht', start: '01/2020', end: 'Present', bullets: ['Built APIs'] }],
  projects: [],
  education: [],
  languages: 'English',
};

const cvText = [
  'TEST PERSON',
  'Software Engineer',
  'Utrecht, Netherlands  ·  open to Netherlands, Italy, Spain and remote EU',
  'test@example.com · +31 6 1234 5678 · linkedin.com/in/test · github.com/test',
].join('\n');

const applicant: Applicant = {
  country: 'Netherlands',
  phoneNational: '612345678',
  preferredLocation: 'Amsterdam',
  city: 'Utrecht',
  howDidYouHear: 'LinkedIn',
  consentRetention: false,
  questions: [],
  salaryByCountry: { NL: '€95,000', ES: '€70,000', IT: '€60,000' },
};

const base: ProfileSnapshot = {
  cvDoc: doc,
  cvErrors: [],
  cvText,
  preferences: 'Senior roles in the Netherlands, Italy or Spain; remote EU.',
  constraints: 'No US on-site.',
  background: 'Senior full-stack engineer.',
  applicant,
  applicantPresent: true,
  applicantErrors: [],
};

const codes = (snapshot: ProfileSnapshot) =>
  analyzeProfile(snapshot)
    .filter((finding) => finding.level !== 'ok')
    .map((finding) => finding.code);

test('consistent profile has no warnings or errors', () => {
  assert.deepEqual(codes(base), []);
});

test('missing remote EU in cv.json is flagged against cv.txt and preferences', () => {
  const drifted = { ...base, cvDoc: { ...doc, location: 'Utrecht, Netherlands  ·  open to Netherlands, Italy and Spain' } };
  assert.deepEqual(codes(drifted), ['location-drift', 'preferences-drift']);
});

test('stale cv.txt contact details are flagged', () => {
  assert.deepEqual(codes({ ...base, cvText: cvText.replace('test@example.com', '') }), ['contact-drift']);
});

test('missing cv.txt is an error', () => {
  assert.deepEqual(codes({ ...base, cvText: null }), ['cvtext-missing']);
});

test('auto-fill consent is surfaced', () => {
  assert.deepEqual(codes({ ...base, applicant: { ...applicant, consentRetention: true } }), ['consent']);
});
