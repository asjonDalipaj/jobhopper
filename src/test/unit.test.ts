import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeFtsQuery } from '../db/jobs-repo.js';
import { stripHtml } from '../sources/html.js';
import { guessWorkplace, guessEmployment } from '../sources/types.js';
import { isSoftware } from '../sources/remotive.js';
import { isJob } from '../sources/remoteok.js';

test('sanitizeFtsQuery strips special characters and prefixes wildcards', () => {
  assert.equal(sanitizeFtsQuery('c++'), '"c"*');
  assert.equal(sanitizeFtsQuery('full-stack/backend'), '"full"* "stack"* "backend"*');
  assert.equal(sanitizeFtsQuery('node.js & typescript'), '"node"* "js"* "typescript"*');
  assert.equal(sanitizeFtsQuery(''), '""');
  assert.equal(sanitizeFtsQuery('!!!'), '""');
});

test('stripHtml removes tags and decodes entities', () => {
  assert.equal(stripHtml('<p>Hello &amp; bye</p>'), 'Hello & bye');
  assert.equal(stripHtml('a&nbsp; b&#39;c'), 'a b\'c');
  assert.equal(stripHtml('<b>X</b>   <i>Y</i>'), 'X Y');
  assert.equal(stripHtml(''), '');
});

test('guessWorkplace returns Remote/Hybrid/On-site or null', () => {
  assert.equal(guessWorkplace('Remote - Europe'), 'Remote');
  assert.equal(guessWorkplace('Hybrid in Amsterdam'), 'Hybrid');
  assert.equal(guessWorkplace('on-site'), 'On-site');
  assert.equal(guessWorkplace(undefined), null);
  assert.equal(guessWorkplace('Somewhere'), null);
});

test('guessEmployment returns a type keyword or null', () => {
  assert.equal(guessEmployment('Full-time contract'), 'Contract');
  assert.equal(guessEmployment('full time'), 'Full-time');
  assert.equal(guessEmployment('part-time'), 'Part-time');
  assert.equal(guessEmployment('Internship'), 'Intern');
  assert.equal(guessEmployment(''), null);
});

test('isSoftware keeps real software roles and rejects junk', () => {
  assert.equal(isSoftware({ title: 'Senior Backend Engineer', tags: [] }), true);
  assert.equal(isSoftware({ title: 'Full-stack Developer', tags: [] }), true);
  assert.equal(isSoftware({ title: 'Frontend Engineer', tags: [] }), true);
  assert.equal(isSoftware({ title: 'Sales Account Manager', tags: ['sales'] }), false);
  assert.equal(isSoftware({ title: 'Office ', tags: ['marketing'] }), false);
});

test('isJob requires a non-empty position', () => {
  assert.equal(isJob({ position: 'Backend Engineer', slug: 'x', company: 'C' }), true);
  assert.equal(isJob({ slug: 'x' }), false); // no position
  assert.equal(isJob({ position: '', slug: 'x' }), false); // empty position
  assert.equal(isJob({ legal: 'meta' }), false); // metadata record
  assert.equal(isJob(null), false);
});