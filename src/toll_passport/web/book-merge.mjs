// Copyright 2026 Steven Ochs and Tollbench. SPDX-License-Identifier: Apache-2.0
// One book. An older Business book moves in once, inside the browser; its saved
// ciphertext is left untouched on the host. A marker entry records the move.
import {validateDocument} from './vault.mjs';

export const MERGE_KIND = 'book-merge';
const clone = value => JSON.parse(JSON.stringify(value));

/** True when this book already holds the legacy book with this vault ID. */
export function hasMerged(document, legacyVaultId) {
  return !!document?.entries.some(entry => {
    const v = entry.versions.at(-1);
    return v.kind === MERGE_KIND && v.fields.from?.vaultId === legacyVaultId;
  });
}
/** Marker entries are bookkeeping; library views hide them. */
export const isMergeMarker = entry => entry?.versions.at(-1)?.kind === MERGE_KIND;

/** Copies every entry and version, labeled {book:'business'}, plus one marker. */
export function mergeLegacyBook(document, legacy, label = 'business') {
  validateDocument(document);
  validateDocument(legacy);
  if (document.vaultId === legacy.vaultId) throw Error('invalid');
  if (hasMerged(document, legacy.vaultId)) return document;
  const next = clone(document), ids = new Set(next.entries.map(entry => entry.id));
  for (const entry of legacy.entries) {
    if (isMergeMarker(entry)) continue;
    const copy = clone(entry);
    if (ids.has(copy.id)) copy.id = crypto.randomUUID();
    ids.add(copy.id);
    for (const version of copy.versions) version.labels = {...(version.labels || {}), book: label};
    next.entries.push(copy);
  }
  next.entries.push({id: crypto.randomUUID(), versions: [{version: 1, createdAt: new Date().toISOString(),
    kind: MERGE_KIND, title: 'Business book moved in',
    fields: {from: {scope: 'business', vaultId: legacy.vaultId, revision: legacy.revision}},
    tags: [], files: [], labels: {book: label}}]});
  next.revision += 1;
  return validateDocument(next);
}
