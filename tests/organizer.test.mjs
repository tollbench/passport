// Copyright 2026 Steven Ochs and Tollbench. SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createOrganizer, loadOrganizerModel, tokenize, embed } from '../src/toll_passport/web/organizer.mjs';
import { TOPIC_CATALOG } from '../src/toll_passport/web/topic-catalog.mjs';
import * as MODEL from '../src/toll_passport/web/organizer/model.mjs';
import * as VOCAB from '../src/toll_passport/web/organizer/vocab.mjs';
import * as P1 from '../src/toll_passport/web/organizer/vectors-1.mjs';
import * as P2 from '../src/toll_passport/web/organizer/vectors-2.mjs';
import * as P3 from '../src/toll_passport/web/organizer/vectors-3.mjs';
const PARTS = [P1, P2, P3];

const web = new URL('../src/toll_passport/web/', import.meta.url);
const reference = JSON.parse(readFileSync(new URL('./fixtures/organizer-reference.json', import.meta.url)));
const topicIds = new Set(TOPIC_CATALOG.map(d => d.requestType));
const saved = [
  { id: 'song', text: 'Who is the song for? My sister Maya' },
  { id: 'budget', text: "What is your company's budget? $5,000" },
  { id: 'dog', text: "What is your dog's name? Biscuit" },
  { id: 'food', text: 'What foods do you avoid? peanuts' },
  { id: 'company', text: 'Company name? Ochs Studios LLC' },
  { id: 'reach', text: 'Best way to reach you? text me' },
];

test('packaged weights decode to the recorded hashes and stay under the size cap', () => {
  const sha = text => createHash('sha256').update(Buffer.from(text, 'base64')).digest('hex');
  assert.equal(createHash('sha256').update(Buffer.concat(PARTS.map(p => Buffer.from(p.VECTORS, 'base64')))).digest('hex'), MODEL.MODEL_INFO.vectorsSha256);
  PARTS.forEach((p, i) => { assert.equal(sha(p.VECTORS), MODEL.MODEL_INFO.parts[i].sha256); assert.deepEqual({ ...p.PART }, MODEL.MODEL_INFO.parts[i]); });
  assert.equal(sha(MODEL.SCALES), MODEL.MODEL_INFO.scalesSha256);
  for (const name of ['model.mjs', 'vocab.mjs', 'vectors-1.mjs', 'vectors-2.mjs', 'vectors-3.mjs'])
    assert(statSync(new URL('organizer/' + name, web)).size < 4500000, name + ' must stay under the 5 MB static-origin file check');
  assert.equal(VOCAB.VOCAB.split('\n').length, MODEL.MODEL_INFO.rows);
  const dir = new URL('organizer/', web);
  const bytes = readdirSync(dir).reduce((n, f) => n + statSync(new URL(f, dir)).size, 0) + statSync(new URL('organizer.mjs', web)).size;
  assert(bytes < 30 * 1024 * 1024, 'organizer adds ' + bytes + ' bytes');
});

test('organizer modules never reach the network and import only fixed local files', () => {
  const files = ['organizer.mjs', 'organizer/labels.mjs', 'organizer/vocab.mjs', 'organizer/model.mjs', ...PARTS.map((_, i) => `organizer/vectors-${i + 1}.mjs`)];
  for (const name of files) {
    const head = readFileSync(new URL(name, web), 'utf8').slice(0, /model|vectors/.test(name) ? 4096 : undefined);
    assert(!/\b(fetch|XMLHttpRequest|WebSocket|EventSource|importScripts|sendBeacon|eval|Function)\s*\(/.test(head), name);
    assert(!/\bimport\s*\(\s*(?!['"]\.\/)/.test(head), 'computed or nonlocal import in ' + name);
    for (const [, spec] of head.matchAll(/\b(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g)) assert(spec.startsWith('./'), name + ' imports ' + spec);
  }
});

test('tokenizer and pooling match the upstream model2vec reference', async () => {
  const model = await loadOrganizerModel();
  for (const c of reference.cases) {
    assert.deepEqual(tokenize(model, c.text), c.ids, JSON.stringify(c.text));
    const v = embed(model, c.text, { weighted: false });
    if (!c.ids.length) { assert.equal(v, null); continue; }
    const norm = Math.hypot(...c.embedding);
    const cos = c.embedding.reduce((s, x, j) => s + x * v[j], 0) / norm;
    assert(cos > 0.999, 'int8 weights drifted for ' + JSON.stringify(c.text) + ': ' + cos);
  }
});

test('finds saved answers that mean the same thing in different words', async () => {
  const o = await createOrganizer();
  assert.equal(o.kind, 'model');
  const ranked = o.rank('Whose birthday is this for?', saved);
  const at = id => ranked.findIndex(r => r.id === id);
  assert(at('song') >= 0, JSON.stringify(ranked));
  assert(at('budget') < 0 || at('song') < at('budget'), JSON.stringify(ranked));
  assert.equal(o.rank('How much can you spend?', saved)[0].id, 'budget');
  assert.equal(o.rank('What is the name of your pet?', saved)[0].id, 'dog');
  assert.equal(o.rank('Who should we contact?', saved)[0].id, 'reach');
  for (const r of ranked) assert(r.score > 0 && r.score <= 1 && Object.keys(r).join() === 'id,score');
  for (let i = 1; i < ranked.length; i++) assert(ranked[i - 1].score >= ranked[i].score);
  assert.deepEqual(o.rank('What is the weather on Mars?', saved), [], 'clearly unrelated answers are dropped');
});

test('labels Personal or Business and a catalog topic', async () => {
  const o = await createOrganizer();
  const cases = [
    ['Describe your business. We are a video production agency making brand films', 'business', 'organization.description'],
    ['Who buys from your company? small bakeries and cafes in Oakland', 'business', 'organization.target_audience'],
    ["What is your company's budget? $5,000", 'business', undefined],
    ['Our quarterly revenue target is $40k and we invoice net 30', 'business', undefined],
    ["It's my mom's 60th birthday party", 'personal', undefined],
    ['What foods do you avoid? peanuts and shellfish', 'personal', 'person.food_restrictions'],
    ['What does your dog eat? grain-free kibble twice a day', 'personal', 'pet.diet'],
    ['How should we reach you? text me after 5pm', 'personal', 'person.contact_preference'],
    ['What tone? warm, playful and a little funny', undefined, 'project.communication_tone'],
  ];
  for (const [text, book, topic] of cases) {
    const l = o.label(text);
    assert.deepEqual(Object.keys(l), ['book', 'topic']);
    assert(['personal', 'business'].includes(l.book));
    assert(l.topic === null || topicIds.has(l.topic), l.topic);
    if (book) assert.equal(l.book, book, text);
    if (topic) assert.equal(l.topic, topic, text);
  }
  assert.deepEqual(o.label(''), { book: 'personal', topic: null });
});

test('same input gives the same output, whatever the candidate order', async () => {
  const a = await createOrganizer(), b = await createOrganizer();
  const q = 'Who is this gift for?';
  const first = a.rank(q, saved);
  assert.deepEqual(a.rank(q, saved), first);
  assert.deepEqual(b.rank(q, [...saved].reverse()), first);
  assert.deepEqual(b.label(saved[1].text), a.label(saved[1].text));
  const tie = a.rank('Company name?', [{ id: 'z', text: 'Company name? A' }, { id: 'a', text: 'Company name? A' }]);
  assert.deepEqual(tie.map(r => r.id), ['a', 'z']);
});

test('missing or broken weights fall back to word overlap and never throw', async () => {
  const missing = await createOrganizer({ load: () => import('./fixtures/organizer-missing-weights.mjs') });
  const broken = await createOrganizer({ load: async () => ({ vocab: VOCAB, model: MODEL, parts: [P1, { ...P2, VECTORS: P2.VECTORS.slice(0, 4096) }, P3] }) });
  const lost = await createOrganizer({ load: async () => ({ vocab: VOCAB, model: MODEL, parts: [P1, P3] }) });
  for (const o of [missing, broken, lost]) {
    assert.equal(o.kind, 'fallback');
    assert.deepEqual(o.label('We are a video production agency'), { book: 'personal', topic: null });
    const ranked = o.rank('What is your company name?', saved);
    assert.equal(ranked[0].id, 'company');
    assert(!ranked.some(r => r.id === 'song' || r.id === 'reach'));
    assert.deepEqual(o.rank('What is your company name?', saved), ranked);
  }
});

test('junk input is handled, not thrown into the sheet', async () => {
  const o = await createOrganizer();
  assert.deepEqual(o.rank(null, null), []);
  assert.deepEqual(o.rank('Who is it for?', [null, { id: {}, text: 'x' }, { id: 'n', text: 7 }]), []);
  assert.deepEqual(o.rank('!!!', saved), []);
  assert.deepEqual(o.label(undefined), { book: 'personal', topic: null });
  assert.deepEqual(o.rank('Who is the song for?', [{ id: 'dup', text: 'Who is the song for?' }, { id: 'dup', text: 'My sister' }]).map(r => r.id), ['dup']);
});

test('timing: one load, then fast ranking of 50 saved answers', async t => {
  const t0 = performance.now();
  await loadOrganizerModel({ load: async () => ({ vocab: VOCAB, model: MODEL, parts: PARTS }) });
  const load = performance.now() - t0;
  const o = await createOrganizer();
  const many = Array.from({ length: 50 }, (_, i) => ({ id: 'a' + i, text: saved[i % saved.length].text + ' note ' + i }));
  const t1 = performance.now();
  o.rank('Whose birthday is this for?', many);
  const cold = performance.now() - t1;
  const t2 = performance.now();
  o.rank('Who is the present for?', many);
  const warm = performance.now() - t2;
  t.diagnostic(`model decode ${load.toFixed(0)} ms; rank 50 cold ${cold.toFixed(1)} ms; rank 50 warm ${warm.toFixed(2)} ms`);
  assert(cold < 1000);
});
