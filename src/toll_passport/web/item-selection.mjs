// Copyright 2026 Steven Ochs and Tollbench. SPDX-License-Identifier: Apache-2.0
import {
  addEntry,
  validateDocument
} from './vault.mjs';
export const ITEM_LIMITS = Object.freeze({
  maxItems: 50,
  maxFileBytes: 2 * 1024 * 1024,
  maxTotalBytes: 5 * 1024 * 1024
});
export const exact = (v, ks) => !!v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v)
  .length === ks.length && ks.every(k => Object.hasOwn(v, k));
export const uuid = v => typeof v === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const clone = v => JSON.parse(JSON.stringify(v));
export const scalarText = v => typeof v === 'string' && [...v].every(c => {
  const n = c.codePointAt(0);
  return n < 0xd800 || n > 0xdfff;
});
export const shareField = (key, value) => /^[A-Za-z][A-Za-z0-9_.-]{0,99}$/.test(key) && scalarText(
  value) && !['source', 'classification', 'subject', 'taskId', 'reusedFrom', 'constructor',
  'prototype'
].includes(key);
export const canonical = v => JSON.stringify(sort(v));

function sort(v) {
  if (Array.isArray(v)) return v.map(sort);
  if (v && typeof v === 'object') return Object.fromEntries(Object.keys(v).sort().map(k => [k, sort(
    v[k])]));
  return v;
}
export async function manifestDigest(items) {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(
    canonical(items))))].map(x => x.toString(16).padStart(2, '0')).join('');
}
export function validLimits(l) {
  return exact(l, Object.keys(ITEM_LIMITS)) && Object.keys(l).every(k => Number.isSafeInteger(l[
    k]) && l[k] > 0 && l[k] <= ITEM_LIMITS[k]);
}
export function fileSize(f) {
  if (!exact(f, ['name', 'type', 'data']) || !scalarText(f.name) || !f.name.trim() || f.name
    .length > 1024 || /[\x00-\x1f\x7f\\/]/.test(f.name) || typeof f.type !== 'string' || f.type
    .length > 256 || !/^[a-zA-Z0-9!#$&^_.+-]+\/[a-zA-Z0-9!#$&^_.+-]+$/.test(f.type) || typeof f
    .data !== 'string' || f.data.length > Math.ceil(ITEM_LIMITS.maxFileBytes / 3) * 4 || f.data
    .length % 4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(f.data)) return null;
  try {
    const raw = atob(f.data);
    return btoa(raw) === f.data ? raw.length : null;
  } catch {
    return null;
  }
}
export function validateItems(items, limits = ITEM_LIMITS) {
  if (!validLimits(limits) || !Array.isArray(items) || !items.length || items.length > limits
    .maxItems) return false;
  const ids = new Set();
  try {
    for (const i of items) {
      if (!exact(i, ['id', 'sourceVersion', 'title', 'kind', 'fields', 'files']) || !uuid(i.id) ||
        ids.has(i.id) || !Number.isSafeInteger(i.sourceVersion) || i.sourceVersion < 1 || !['note',
          'file'
        ].includes(i.kind) || !scalarText(i.title) || !i.title.trim() || i.title.length > 4096 || !i
        .fields || typeof i.fields !== 'object' || Array.isArray(i.fields) || !Array.isArray(i
          .files) || Object.keys(i.fields).length > 1000 || !Object.entries(i.fields).every(([k,
          v
        ]) => shareField(k, v)) || (!Object.keys(i.fields).length && !i.files.length))
        return false;
      ids.add(i.id);
      for (const f of i.files) {
        const n = fileSize(f);
        if (n === null || n > limits.maxFileBytes) return false;
      }
    }
    return new TextEncoder().encode(canonical(items)).length <= limits.maxTotalBytes;
  } catch {
    return false;
  }
}
export function itemVersion(doc, ref) {
  const entry = doc.entries.find(e => e.id === ref.entryId),
    v = entry?.versions.find(v => v.version === ref.version);
  if (!v || !['note', 'file'].includes(v.kind)) throw Error('invalid');
  return v;
}
export function makeCollection(doc, title, members) {
  validateDocument(doc);
  if (typeof title !== 'string' || !title.trim() || title.length > 4096 || !Array.isArray(
      members) || !members.length || members.length > 50) throw Error('invalid');
  const ids = new Set();
  for (const r of members) {
    if (!exact(r, ['entryId', 'version']) || ids.has(r.entryId)) throw Error('invalid');
    itemVersion(doc, r);
    ids.add(r.entryId);
  }
  return addEntry(doc, {
    kind: 'passport.collection',
    title,
    fields: {
      members: clone(members)
    }
  });
}
export function collectionMembers(doc, entryId, version) {
  const c = doc.entries.find(e => e.id === entryId)?.versions.find(v => v.version === version);
  if (c?.kind !== 'passport.collection' || !Array.isArray(c.fields.members) || !c.fields.members
    .length || c.fields.members.length > 50) throw Error('invalid');
  const ids = new Set();
  for (const r of c.fields.members) {
    if (!exact(r, ['entryId', 'version']) || ids.has(r.entryId)) throw Error('invalid');
    itemVersion(doc, r);
    ids.add(r.entryId);
  }
  return clone(c.fields.members);
}
export function snapshotItems(doc, selections, limits = ITEM_LIMITS) {
  validateDocument(doc);
  if (!Array.isArray(selections) || !selections.length || selections.length > limits.maxItems)
    throw Error('invalid');
  const seen = new Set();
  const items = selections.map(s => {
    if (!exact(s, ['entryId', 'version', 'fields', 'files']) || seen.has(s.entryId) || !Array
      .isArray(s.fields) || !Array.isArray(s.files) || new Set(s.fields).size !== s.fields
      .length || new Set(s.files).size !== s.files.length) throw Error('invalid');
    seen.add(s.entryId);
    const v = itemVersion(doc, s),
      fields = {};
    for (const k of s.fields) {
      if (!Object.hasOwn(v.fields, k) || !shareField(k, v.fields[k])) throw Error('invalid');
      fields[k] = clone(v.fields[k]);
    }
    const files = s.files.map(n => {
      if (!Number.isSafeInteger(n) || n < 0 || n >= v.files.length) throw Error('invalid');
      return clone(v.files[n]);
    });
    return {
      id: crypto.randomUUID(),
      sourceVersion: v.version,
      title: v.title,
      kind: v.kind,
      fields,
      files
    };
  });
  if (!validateItems(items, limits)) throw Error('quota');
  return items;
}
