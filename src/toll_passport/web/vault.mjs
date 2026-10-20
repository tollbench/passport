// Copyright 2026 Steven Ochs and Tollbench.
// SPDX-License-Identifier: Apache-2.0
// Local-only reference implementation. No network calls or key persistence.

export const MAX_VAULT_BYTES = 100 * 1024 * 1024;
export const MAX_FILE_BYTES = 25 * 1024 * 1024;
const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', {
  fatal: true
});
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fail = () => {
  throw new Error('Invalid Passport data.');
};
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value) && (
  Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
const keys = (value, required, optional = []) => {
  if (!object(value) || required.some(k => !Object.hasOwn(value, k)) || Object.keys(value).some(
      k => !required.includes(k) && !optional.includes(k))) fail();
};
const string = (value, max = 4096, empty = false) => {
  if (typeof value !== 'string' || value.length > max || (!empty && !value.trim())) fail();
};
const integer = n => {
  if (!Number.isSafeInteger(n) || n < 1) fail();
};
const id = value => {
  if (typeof value !== 'string' || !uuid.test(value)) fail();
};
const clone = value => JSON.parse(JSON.stringify(value));

function jsonValue(value, depth = 0, seen = new Set()) {
  if (depth > 32) fail();
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) fail();
    return;
  }
  if ((!Array.isArray(value) && !object(value)) || seen.has(value)) fail();
  seen.add(value);
  for (const key of Object.keys(value)) {
    if (['__proto__', 'constructor', 'prototype'].includes(key)) fail();
    jsonValue(value[key], depth + 1, seen);
  }
  seen.delete(value);
}

function bytesToBase64(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i,
    i + 8192));
  return btoa(binary);
}

function base64ToBytes(value, maxBytes) {
  if (typeof value !== 'string' || value.length > Math.ceil(maxBytes / 3) * 4 || value.length %
    4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(value)) fail();
  let binary;
  try {
    binary = atob(value);
  } catch {
    fail();
  }
  if (binary.length > maxBytes) fail();
  return Uint8Array.from(binary, c => c.charCodeAt(0));
}

function files(value) {
  if (!Array.isArray(value) || value.length > 1000) fail();
  for (const file of value) {
    keys(file, ['name', 'type', 'data']);
    string(file.name, 1024);
    string(file.type, 256, true);
    base64ToBytes(file.data, MAX_FILE_BYTES);
  }
}

function tags(value) {
  if (!Array.isArray(value) || value.length > 100 || value.some(t => typeof t !== 'string' || !t
      .trim() || t.length > 100)) fail();
}

function fields(value) {
  if (!object(value) || Object.keys(value).length > 1000) fail();
  for (const name of Object.keys(value)) {
    string(name, 256);
    if (name.startsWith('$')) fail();
  }
  jsonValue(value);
}

function timestamp(value) {
  if (typeof value !== 'string' || value.length > 40 || !Number.isFinite(Date.parse(value)) ||
    new Date(value).toISOString() !== value) fail();
}

function serialize(value) {
  let encoded;
  try {
    encoded = encoder.encode(JSON.stringify(value));
  } catch {
    fail();
  }
  // AES-GCM adds a 16-byte tag, which counts toward the encrypted quota.
  if (encoded.length + 16 > MAX_VAULT_BYTES) throw new Error('Passport storage limit exceeded.');
  return encoded;
}

/** Validates a snapshot without changing it; returns the same document. */
export function validateDocument(document) {
  keys(document, ['format', 'vaultId', 'revision', 'entries']);
  if (document.format !== 'passport-document-v1') fail();
  id(document.vaultId);
  integer(document.revision);
  if (!Array.isArray(document.entries) || document.entries.length > 10000) fail();
  const ids = new Set();
  for (const entry of document.entries) {
    keys(entry, ['id', 'versions']);
    id(entry.id);
    if (ids.has(entry.id)) fail();
    ids.add(entry.id);
    if (!Array.isArray(entry.versions) || entry.versions.length < 1 || entry.versions.length >
      10000) fail();
    entry.versions.forEach((version, index) => {
      keys(version, ['version', 'createdAt', 'kind', 'title', 'fields', 'tags', 'files']);
      if (version.version !== index + 1) fail();
      timestamp(version.createdAt);
      string(version.kind, 100);
      string(version.title, 4096);
      fields(version.fields);
      tags(version.tags);
      files(version.files);
    });
  }
  serialize(document);
  return document;
}

function validateEnvelope(envelope, format) {
  keys(envelope, ['format', 'vaultId', 'revision', 'nonce', 'ciphertext']);
  if (envelope.format !== format) fail();
  id(envelope.vaultId);
  integer(envelope.revision);
  const nonce = base64ToBytes(envelope.nonce, 12);
  const ciphertext = base64ToBytes(envelope.ciphertext, MAX_VAULT_BYTES);
  if (nonce.length !== 12 || ciphertext.length < 16) fail();
  return {
    nonce,
    ciphertext
  };
}
const aad = envelope => encoder.encode(JSON.stringify([envelope.format, envelope.vaultId, envelope
  .revision
]));
async function newKey() {
  return crypto.subtle.generateKey({
    name: 'AES-GCM',
    length: 256
  }, true, ['encrypt', 'decrypt']);
}
async function seal(value, key, format, vaultId, revision) {
  if (key?.type !== 'secret' || key?.algorithm?.name !== 'AES-GCM' || key?.algorithm?.length !==
    256 || !key.usages.includes('encrypt')) fail();
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const envelope = {
    format,
    vaultId,
    revision,
    nonce: bytesToBase64(nonce),
    ciphertext: ''
  };
  try {
    envelope.ciphertext = bytesToBase64(new Uint8Array(await crypto.subtle.encrypt({
      name: 'AES-GCM',
      iv: nonce,
      additionalData: aad(envelope),
      tagLength: 128
    }, key, serialize(value))));
  } catch {
    throw new Error('Could not encrypt Passport data.');
  }
  return envelope;
}
export async function exportRecovery(key, vaultId) {
  id(vaultId);
  try {
    if (key?.type !== 'secret' || key?.algorithm?.name !== 'AES-GCM' || key?.algorithm?.length !==
      256) fail();
    return {
      format: 'passport-recovery-v1',
      vaultId,
      key: bytesToBase64(new Uint8Array(await crypto.subtle.exportKey('raw', key)))
    };
  } catch {
    throw new Error('Could not export Passport recovery.');
  }
}
async function open(envelope, recovery, format) {
  const {
    nonce,
    ciphertext
  } = validateEnvelope(envelope, format);
  keys(recovery, ['format', 'vaultId', 'key']);
  if (recovery.format !== 'passport-recovery-v1' || recovery.vaultId !== envelope.vaultId) fail();
  const raw = base64ToBytes(recovery.key, 32);
  if (raw.length !== 32) fail();
  try {
    const key = await crypto.subtle.importKey('raw', raw, {
      name: 'AES-GCM'
    }, true, ['encrypt', 'decrypt']);
    const bytes = await crypto.subtle.decrypt({
      name: 'AES-GCM',
      iv: nonce,
      additionalData: aad(envelope),
      tagLength: 128
    }, key, ciphertext);
    return {
      key,
      value: JSON.parse(decoder.decode(bytes))
    };
  } catch {
    throw new Error('Could not unlock Passport data. Check the backup and recovery file.');
  } finally {
    raw.fill(0);
  }
}
export async function createVault() {
  const document = {
    format: 'passport-document-v1',
    vaultId: crypto.randomUUID(),
    revision: 1,
    entries: []
  };
  const key = await newKey();
  return {
    key,
    document,
    envelope: await sealVault(document, key)
  };
}
export async function sealVault(document, key) {
  validateDocument(document);
  return seal(document, key, 'passport-vault-v1', document.vaultId, document.revision);
}
export async function unlockVault(envelope, recovery) {
  const {
    key,
    value: document
  } = await open(envelope, recovery, 'passport-vault-v1');
  validateDocument(document);
  if (document.vaultId !== envelope.vaultId || document.revision !== envelope.revision) fail();
  return {
    key,
    document
  };
}

/** Optional id appends a new version to an existing entry. No existing version changes. */
export function addEntry(document, input) {
  validateDocument(document);
  keys(input, ['kind', 'title', 'fields'], ['id', 'tags', 'files']);
  const next = clone(document);
  let entry;
  if (Object.hasOwn(input, 'id')) {
    id(input.id);
    entry = next.entries.find(item => item.id === input.id);
    if (!entry) fail();
  } else {
    entry = {
      id: crypto.randomUUID(),
      versions: []
    };
    next.entries.push(entry);
  }
  // Unknown tags remain useful hints; their spelling never affects task scoring.
  const normalizedTags = input.tags === undefined ? [] : input.tags;
  if (!Array.isArray(normalizedTags) || normalizedTags.some(t => typeof t !== 'string')) fail();
  fields(input.fields);
  entry.versions.push({
    version: entry.versions.length + 1,
    createdAt: new Date().toISOString(),
    kind: input.kind,
    title: input.title,
    fields: clone(input.fields),
    tags: [...new Set(normalizedTags.map(t => t.trim().toLowerCase()).filter(Boolean))],
    files: input.files === undefined ? [] : clone(input.files)
  });
  next.revision += 1;
  return validateDocument(next);
}
export function removeEntry(document, entryId) {
  validateDocument(document);
  id(entryId);
  if (!document.entries.some(entry => entry.id === entryId)) fail();
  const next = clone(document);
  next.entries = next.entries.filter(entry => entry.id !== entryId);
  next.revision += 1;
  return validateDocument(next);
}

function validateRelease(value) {
  keys(value, ['format', 'vaultId', 'entryId', 'version', 'recipient', 'purpose', 'createdAt',
    'fields'
  ], ['title', 'kind', 'tags', 'files']);
  if (value.format !== 'passport-release-v1') fail();
  id(value.vaultId);
  id(value.entryId);
  integer(value.version);
  string(value.recipient, 1024);
  string(value.purpose, 4096);
  timestamp(value.createdAt);
  fields(value.fields);
  if (Object.hasOwn(value, 'title')) string(value.title, 4096);
  if (Object.hasOwn(value, 'kind')) string(value.kind, 100);
  if (Object.hasOwn(value, 'tags')) tags(value.tags);
  if (Object.hasOwn(value, 'files')) files(value.files);
  serialize(value);
}
/** Exact field selection. $title/$kind/$tags/$files explicitly disclose metadata/files.
 * Recipient and purpose are labels, not authentication or enforceable restrictions.
 * A downloaded disclosure cannot be revoked and has no enforced expiry.
 */
export function selectRelease(document, selection) {
  validateDocument(document);
  keys(selection, ['entryId', 'version', 'fields', 'recipient', 'purpose']);
  if (!Array.isArray(selection.fields) || selection.fields.length < 1 || selection.fields.some(
      name => typeof name !== 'string')) fail();
  const entry = document.entries.find(item => item.id === selection.entryId);
  const version = entry?.versions.find(item => item.version === selection.version);
  if (!version) fail();
  const value = {
    format: 'passport-release-v1',
    vaultId: document.vaultId,
    entryId: entry.id,
    version: version.version,
    recipient: selection.recipient,
    purpose: selection.purpose,
    createdAt: new Date().toISOString(),
    fields: {}
  };
  for (const name of new Set(selection.fields)) {
    if (['$title', '$kind', '$tags', '$files'].includes(name)) value[name.slice(1)] = clone(version[
      name.slice(1)]);
    else if (Object.hasOwn(version.fields, name)) value.fields[name] = clone(version.fields[name]);
    else fail();
  }
  validateRelease(value);
  return value;
}
export async function encryptRelease(value) {
  validateRelease(value);
  const key = await newKey();
  const releaseId = crypto.randomUUID();
  return {
    envelope: await seal(value, key, 'passport-release-envelope-v1', releaseId, 1),
    recovery: await exportRecovery(key, releaseId)
  };
}
export async function decryptRelease(envelope, recovery) {
  const {
    value
  } = await open(envelope, recovery, 'passport-release-envelope-v1');
  validateRelease(value);
  return value;
}
