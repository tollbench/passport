// Copyright 2026 Steven Ochs and Tollbench. SPDX-License-Identifier: Apache-2.0
// The mini organizer: a small sentence-meaning model that runs inside the box.
// It finds saved answers that mean the same as a new question, and labels an
// answer Personal or Business plus a topic from the catalog. No network: the
// model is a few fixed data modules next to this file, imported once on first use.
// See docs/ORGANIZER.md.
import { TOPIC_CATALOG } from './topic-catalog.mjs';
import { TOPIC_HINTS, BOOK_HINTS, FUNCTION_WORDS, TUNING } from './organizer/labels.mjs';

export const ORGANIZER_VERSION = '1';
const FALLBACK_LABEL = Object.freeze({ book: 'personal', topic: null });
const MAX_CANDIDATES = 1000;
const MAX_TEXT = 4000;
const CACHE_LIMIT = 2048;

// ---------- weights ----------

function decodeBase64(text) {
  if (typeof Uint8Array.fromBase64 === 'function') return Uint8Array.fromBase64(text);
  const binary = atob(text), out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

function buildModel({ vocab, model, parts }) {
  const info = model?.MODEL_INFO, vinfo = vocab?.VOCAB_INFO;
  if (!info || info.format !== 'toll-organizer-static-v1' || !vinfo || typeof vocab.VOCAB !== 'string' ||
      typeof model.SCALES !== 'string' || !Array.isArray(parts) || !Array.isArray(info.parts) || parts.length !== info.parts.length)
    throw new Error('organizer model shape');
  const { rows, dim } = info;
  const tokens = vocab.VOCAB.split('\n');
  if (!Number.isInteger(rows) || !Number.isInteger(dim) || rows < 1 || dim < 1 || tokens.length !== rows || vinfo.size !== rows)
    throw new Error('organizer model size');
  const vectors = new Int8Array(rows * dim);
  let next = 0;
  parts.forEach((part, i) => {
    const want = info.parts[i];
    if (typeof part?.VECTORS !== 'string' || part.PART?.firstRow !== next || want.firstRow !== next || part.PART.rows !== want.rows)
      throw new Error('organizer weights part');
    const bytes = decodeBase64(part.VECTORS);
    if (bytes.length !== want.rows * dim) throw new Error('organizer weights length');
    vectors.set(new Int8Array(bytes.buffer, bytes.byteOffset, bytes.length), next * dim);
    next += want.rows;
  });
  const scaleBytes = decodeBase64(model.SCALES);
  if (next !== rows || scaleBytes.length !== rows * 4) throw new Error('organizer weights length');
  const view = new DataView(scaleBytes.buffer, scaleBytes.byteOffset, scaleBytes.length);
  const scales = new Float64Array(rows);
  for (let r = 0; r < rows; r++) scales[r] = view.getFloat32(r * 4, true);
  const ids = new Map();
  let longest = 0;
  tokens.forEach((t, i) => { ids.set(t, i); longest = Math.max(longest, [...t].length); });
  const weight = new Float64Array(rows);
  const fw = new Set(FUNCTION_WORDS);
  tokens.forEach((t, i) => { weight[i] = PUNCT_ONLY.test(t) ? 0 : fw.has(t) ? TUNING.functionWordWeight : 1; });
  const special = new Map(['[PAD]', '[UNK]', '[CLS]', '[SEP]', '[MASK]'].filter(t => ids.has(t)).map(t => [t, ids.get(t)]));
  return Object.freeze({
    source: info.source, revision: info.revision, rows, dim, tokens, ids, longest, vectors, scales, weight, special,
    unkId: vinfo.unkId, maxChars: vinfo.maxInputCharsPerWord, maxTokens: vinfo.maxTokens,
    clip: vinfo.maxTokens * vinfo.medianTokenLength,
  });
}

let bundled = null;
function loadBundled() {
  // Fixed literal paths: the bundle checker resolves these and nothing else.
  bundled ||= Promise.all([import('./organizer/vocab.mjs'), import('./organizer/model.mjs'),
    import('./organizer/vectors-1.mjs'), import('./organizer/vectors-2.mjs'), import('./organizer/vectors-3.mjs')])
    .then(([vocab, model, ...parts]) => buildModel({ vocab, model, parts }))
    .catch(error => { bundled = null; throw error; });
  return bundled;
}

// The decoded model itself, for tests and tools (same cache as createOrganizer).
export async function loadOrganizerModel(options = {}) {
  return typeof options?.load === 'function' ? buildModel(await options.load()) : loadBundled();
}

// ---------- tokenizer: BERT uncased WordPiece, same steps as the original model ----------

const CONTROL = /\p{C}/u, SPACE = /\s/u, MARK = /\p{Mn}/u;
const PUNCT = /[\p{P}!-\/:-@\[-`{-~]/u;
const PUNCT_ONLY = /^[\p{P}]+$/u;
const SPECIAL = /\[(?:PAD|UNK|CLS|SEP|MASK)\]/g;
const isCjk = cp => (cp >= 0x4E00 && cp <= 0x9FFF) || (cp >= 0x3400 && cp <= 0x4DBF) || (cp >= 0x20000 && cp <= 0x2A6DF) ||
  (cp >= 0x2A700 && cp <= 0x2B73F) || (cp >= 0x2B740 && cp <= 0x2B81F) || (cp >= 0x2B820 && cp <= 0x2CEAF) ||
  (cp >= 0xF900 && cp <= 0xFAFF) || (cp >= 0x2F800 && cp <= 0x2FA1F);

function normalizeText(text) {
  let cleaned = '';
  for (const ch of text) {
    const cp = ch.codePointAt(0);
    if (cp === 0 || cp === 0xFFFD || (ch !== '\t' && ch !== '\n' && ch !== '\r' && CONTROL.test(ch))) continue;
    if (SPACE.test(ch)) cleaned += ' ';
    else if (isCjk(cp)) cleaned += ' ' + ch + ' ';
    else cleaned += ch;
  }
  let out = '';
  for (const ch of cleaned.normalize('NFD')) if (!MARK.test(ch)) out += ch.toLowerCase();
  return out;
}

function words(normalized) {
  const out = [];
  let word = '';
  for (const ch of normalized) {
    if (SPACE.test(ch)) { if (word) out.push(word); word = ''; }
    else if (PUNCT.test(ch)) { if (word) out.push(word); out.push(ch); word = ''; }
    else word += ch;
  }
  if (word) out.push(word);
  return out;
}

function wordPiece(model, word, out) {
  const chars = [...word];
  if (chars.length > model.maxChars) { out.push(model.unkId); return; }
  const pieces = [];
  for (let start = 0; start < chars.length;) {
    let end = Math.min(chars.length, start + model.longest), found = -1;
    for (; end > start; end--) {
      const piece = (start > 0 ? '##' : '') + chars.slice(start, end).join('');
      const id = model.ids.get(piece);
      if (id !== undefined) { found = id; break; }
    }
    if (found < 0) { out.push(model.unkId); return; }
    pieces.push(found);
    start = end;
  }
  out.push(...pieces);
}

export function tokenize(model, text) {
  const clipped = [...String(text ?? '')].slice(0, model.clip).join('');
  const ids = [];
  let last = 0;
  const segment = part => { for (const w of words(normalizeText(part))) wordPiece(model, w, ids); };
  for (const match of clipped.matchAll(SPECIAL)) {
    segment(clipped.slice(last, match.index));
    ids.push(model.special.get(match[0]) ?? model.unkId);
    last = match.index + match[0].length;
  }
  segment(clipped.slice(last));
  return ids.slice(0, model.maxTokens).filter(id => id !== model.unkId);
}

// Mean of token rows, then unit length. weighted=false is the original model's pooling.
export function embed(model, text, { weighted = true } = {}) {
  const ids = tokenize(model, text);
  const { dim, vectors, scales, weight } = model;
  const sum = new Float64Array(dim);
  let total = 0;
  for (const id of ids) {
    const w = weighted ? weight[id] : 1;
    if (!w) continue;
    const s = scales[id] * w, base = id * dim;
    for (let j = 0; j < dim; j++) sum[j] += vectors[base + j] * s;
    total += w;
  }
  if (!total) return null;
  let norm = 0;
  for (let j = 0; j < dim; j++) norm += sum[j] * sum[j];
  norm = Math.sqrt(norm);
  if (!(norm > 0)) return null;
  for (let j = 0; j < dim; j++) sum[j] /= norm;
  return sum;
}

const dot = (a, b) => { let s = 0; for (let j = 0; j < a.length; j++) s += a[j] * b[j]; return s; };
const round4 = x => Math.round(Math.min(1, Math.max(0, x)) * 1e4) / 1e4;
const byScoreThenId = (a, b) => b.score - a.score || (a.key < b.key ? -1 : a.key > b.key ? 1 : a.index - b.index);
const asText = value => typeof value === 'string' ? value.slice(0, MAX_TEXT) : '';

function cleanCandidates(candidates) {
  if (!Array.isArray(candidates)) return [];
  const out = [];
  for (const c of candidates.slice(0, MAX_CANDIDATES)) {
    if (!c || typeof c !== 'object' || !(typeof c.id === 'string' || Number.isFinite(c.id)) || typeof c.text !== 'string') continue;
    out.push({ id: c.id, key: String(c.id), text: c.text.slice(0, MAX_TEXT), index: out.length });
  }
  return out;
}

function finishRank(scored) {
  const best = new Map();
  for (const s of scored) {
    const prior = best.get(s.key);
    if (!prior || s.score > prior.score) best.set(s.key, s);
  }
  return [...best.values()].sort(byScoreThenId).map(({ id, score }) => ({ id, score }));
}

// ---------- organizers ----------

const catalogTopics = () => TOPIC_CATALOG.map(d => d.requestType).filter(id => Array.isArray(TOPIC_HINTS[id]));
const entityKindOf = id => TOPIC_CATALOG.find(d => d.requestType === id)?.entityKind;

function modelOrganizer(model) {
  const cache = new Map();
  const vector = text => {
    if (cache.has(text)) return cache.get(text);
    const v = embed(model, text);
    if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value);
    cache.set(text, v);
    return v;
  };
  const hints = list => list.map(vector).filter(Boolean);
  const topics = catalogTopics().map(id => ({ id, kind: entityKindOf(id), vectors: hints(TOPIC_HINTS[id]) }));
  const personal = hints(BOOK_HINTS.personal), business = hints(BOOK_HINTS.business);
  const best = (v, list) => list.reduce((m, h) => Math.max(m, dot(v, h)), -1);

  function rank(questionText, candidates) {
    const q = vector(asText(questionText));
    if (!q) return [];
    const scored = [];
    for (const c of cleanCandidates(candidates)) {
      const v = vector(c.text);
      if (!v) continue;
      const cos = dot(q, v);
      if (cos >= TUNING.rankMin) scored.push({ ...c, score: round4(cos) });
    }
    return finishRank(scored);
  }

  function label(text) {
    const v = vector(asText(text));
    if (!v) return { ...FALLBACK_LABEL };
    const ranked = topics.map(t => ({ t, s: best(v, t.vectors) })).sort((a, b) => b.s - a.s || (a.t.id < b.t.id ? -1 : 1));
    const top = ranked[0], next = ranked[1];
    const topic = top && top.s >= TUNING.topicMin && (!next || top.s - next.s >= TUNING.topicMargin) ? top.t : null;
    const prior = !topic ? 0 : topic.kind === 'organization' ? TUNING.bookPrior : topic.kind === 'person' || topic.kind === 'pet' ? -TUNING.bookPrior : 0;
    const lean = best(v, business) - best(v, personal) + prior;
    return { book: lean > TUNING.bookMargin ? 'business' : 'personal', topic: topic ? topic.id : null };
  }

  return Object.freeze({ kind: 'model', version: ORGANIZER_VERSION, model: Object.freeze({ source: model.source, revision: model.revision }), rank, label });
}

// Plain word overlap, used only when the model cannot load.
const fallbackStop = new Set(FUNCTION_WORDS);
function wordSet(text) {
  const plain = asText(text).normalize('NFD').replace(/\p{Mn}/gu, '').toLowerCase();
  const out = new Set();
  for (let w of plain.split(/[^\p{L}\p{N}]+/u)) {
    if (!w || fallbackStop.has(w) || (w.length < 2 && !/\d/.test(w))) continue;
    if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) w = w.slice(0, -1);
    out.add(w);
  }
  return out;
}

function fallbackOrganizer(reason) {
  function rank(questionText, candidates) {
    const q = wordSet(questionText);
    if (!q.size) return [];
    const scored = [];
    for (const c of cleanCandidates(candidates)) {
      const w = wordSet(c.text);
      let shared = 0;
      for (const x of w) if (q.has(x)) shared++;
      if (shared) scored.push({ ...c, score: round4(shared / Math.sqrt(q.size * w.size)) });
    }
    return finishRank(scored);
  }
  const label = () => ({ ...FALLBACK_LABEL });
  return Object.freeze({ kind: 'fallback', version: ORGANIZER_VERSION, model: null, reason: String(reason || 'unavailable'), rank, label });
}

// options.load: optional async () => ({vocab, model, parts}) module namespaces, for tests or another fixed copy.
// Never throws: if the model cannot load, the word-overlap organizer comes back instead.
export async function createOrganizer(options = {}) {
  try {
    const load = typeof options?.load === 'function' ? async () => buildModel(await options.load()) : loadBundled;
    return modelOrganizer(await load());
  } catch (error) {
    return fallbackOrganizer(error?.message);
  }
}
