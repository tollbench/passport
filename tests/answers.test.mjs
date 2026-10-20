// Copyright 2026 Steven Ochs and Tollbench.
// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import { createVault, addEntry } from '../src/toll_passport/web/vault.mjs';
import { canonicalAnswerLabel, findAnswerCandidates } from '../src/toll_passport/web/answers.mjs';

const context = { label: 'founder_bio', subject: 'person:one', scope: 'task', taskId: 'task:one' };
const now = Date.parse('2026-10-20T00:00:00.000Z');
async function fixture(fields = {}, tags = [], date = '2026-10-19T00:00:00.000Z') {
  const vault = await createVault();
  const document = addEntry(vault.document, { kind: 'answer', title: 'Biography?',
    fields: Object.fromEntries(Object.entries({ answer: 'Synthetic biography', ...context, ...fields })
      .filter(([, value]) => value !== undefined)), tags });
  document.entries[0].versions[0].createdAt = date;
  return document;
}
const find = (document, query = context) => findAnswerCandidates(document, query, { now });

test('specific aliases normalize, categories and missing labels do not match', async () => {
  for (const alias of ['founder_bio', ' Founder Bio ', 'founder biography']) {
    assert.equal(canonicalAnswerLabel(alias), 'founder_bio');
    assert.equal(find(await fixture({ label: alias })).length, 1);
  }
  for (const label of ['', undefined, null, 'about_you', 'preferences', 'contact_information', 'founder_boi', 'constructor']) {
    assert.equal(canonicalAnswerLabel(label), null);
    assert.deepEqual(find(await fixture(), { ...context, label }), []);
  }
  // Unknown metadata is stored successfully, but cannot turn a broad hint into a match.
  assert.deepEqual(find(await fixture({ label: 'unfamiliar' }, ['founder_bio'])), []);
});

test('subjects are opaque exact identifiers, never guessed or normalized', async () => {
  const document = await fixture();
  for (const subject of ['person:two', 'Person:one', 'person:one ', '', undefined]) {
    assert.deepEqual(find(document, { ...context, subject }), []);
  }
  assert.equal(find(document).length, 1);
});

test('task answers require exact task and cannot become reusable', async () => {
  const document = await fixture();
  for (const taskId of ['task:two', 'Task:one', '', undefined]) {
    assert.deepEqual(find(document, { ...context, taskId }), []);
  }
  assert.deepEqual(find(document, { ...context, scope: 'reusable' }), []);
  assert.deepEqual(find(await fixture({ taskId: '' })), []);
  for (const scope of ['', undefined, 'all-agents']) assert.deepEqual(find(await fixture({ scope })), []);
  const reusable = await fixture({ scope: 'reusable' });
  assert.equal(find(reusable, { ...context, taskId: 'task:two' }).length, 1);
  assert.equal(find(reusable, { ...context, scope: 'reusable' }).length, 1);
});

test('legacy tags work only when they identify one specific answer type', async () => {
  const document = await fixture({}, ['founder bio', 'unfamiliar']);
  delete document.entries[0].versions[0].fields.label;
  assert.equal(find(document).length, 1);
  document.entries[0].versions[0].tags.push('audience');
  assert.deepEqual(find(document), []);
  document.entries[0].versions[0].tags = ['about_you'];
  assert.deepEqual(find(document), []);
  document.entries[0].versions[0].tags = [];
  assert.deepEqual(find(document), []);
});

test('only latest versions participate, including changed labels and scope', async () => {
  let document = await fixture();
  const entryId = document.entries[0].id;
  document = addEntry(document, { id: entryId, kind: 'answer', title: 'New biography?',
    fields: { ...context, answer: 'Latest biography' } });
  document.entries[0].versions[1].createdAt = '2026-10-20T00:00:00.000Z';
  const [candidate] = find(document);
  assert.equal(candidate.answer, 'Latest biography');
  assert.equal(candidate.provenance.version, 2);
  assert.equal(candidate.provenance.entryId, entryId);
  assert.equal(candidate.provenance.createdAt, '2026-10-20T00:00:00.000Z');
  document.entries[0].versions[1].fields.label = 'audience';
  assert.deepEqual(find(document), []);
  document.entries[0].versions[1].fields.label = 'founder_bio';
  document.entries[0].versions[1].fields.taskId = 'task:two';
  assert.deepEqual(find(document), []);
});

test('multiple, dated and future candidates require visible review reasons', async () => {
  let document = await fixture({}, [], '2025-10-20T00:00:00.000Z');
  assert.deepEqual(find(document)[0].reviewReasons, ['dated']);
  document = addEntry(document, { kind: 'answer', title: 'Alternative?', fields: { ...context, answer: 'Alternative' } });
  document.entries[1].versions[0].createdAt = '2026-10-21T00:00:00.000Z';
  const candidates = find(document);
  assert.equal(candidates.length, 2);
  assert.deepEqual(candidates[0].reviewReasons, ['future-date', 'multiple-candidates']);
  assert.deepEqual(candidates[1].reviewReasons, ['dated', 'multiple-candidates']);
});

test('finding candidates changes nothing and grants no sharing permission', async () => {
  const document = await fixture({ privatePhone: 'EXCLUDE', recipient: 'EXCLUDE' });
  const before = JSON.stringify(document);
  const candidates = find(document);
  assert.equal(JSON.stringify(document), before);
  assert.deepEqual(Object.keys(candidates[0]).sort(), ['answer', 'provenance', 'reviewReasons']);
  assert.equal(JSON.stringify(candidates).includes('EXCLUDE'), false);
  candidates[0].answer = 'Changed';
  candidates[0].provenance.subject = 'Changed';
  assert.equal(JSON.stringify(document), before);
});
