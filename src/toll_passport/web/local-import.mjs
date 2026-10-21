// Copyright 2026 Steven Ochs and Tollbench. SPDX-License-Identifier: Apache-2.0
import {
  addEntry,
  validateDocument
} from './vault.mjs';
import {
  canonical,
  manifestDigest,
  exact
} from './item-selection.mjs';
/** Local provider-neutral import. Input prose is never promoted to classified facts. */
export async function importRecords(document, records) {
  validateDocument(document);
  if (!Array.isArray(records) || records.length > 100) throw Error('invalid');
  let next = document;
  const seen = new Set(),
    result = {
      created: 0,
      updated: 0,
      unchanged: 0
    };
  for (const r of records) {
    if (!exact(r, ['source', 'title', 'text', 'files']) || !exact(r.source, ['namespace',
        'externalId', 'revision', 'digest', 'url', 'modifiedAt'
      ]) || ['namespace', 'externalId', 'revision'].some(k => typeof r.source[k] !== 'string' || !
        r.source[k].trim() || r.source[k].length > 1024) || typeof r.source.url !== 'string' || r
      .source.url.length > 4096 || typeof r.source.modifiedAt !== 'string' || !Number.isFinite(
        Date.parse(r.source.modifiedAt)) || typeof r.title !== 'string' || !r.title.trim() ||
      typeof r.text !== 'string' || !Array.isArray(r.files)) throw Error('invalid');
    const identity = canonical([r.source.namespace, r.source.externalId]);
    if (seen.has(identity)) throw Error('conflict');
    seen.add(identity);
    const digest = await manifestDigest({
      title: r.title,
      text: r.text,
      files: r.files
    });
    if (digest !== r.source.digest) throw Error('invalid');
    const matches = next.entries.filter(e => {
      const s = e.versions.at(-1).fields.source;
      return s?.namespace === r.source.namespace && s.externalId === r.source.externalId;
    });
    if (matches.length > 1) throw Error('conflict');
    const entry = matches[0],
      v = entry?.versions.at(-1);
    if (v) {
      // An unchanged source never overwrites local enrichment.
      if (v.fields.source.digest === digest) { result.unchanged++; continue; }
      if (v.kind !== 'note' || !exact(v.fields, ['text', 'source']) || v.tags.length ||
          !Number.isFinite(Date.parse(v.fields.source.modifiedAt)) ||
          Date.parse(r.source.modifiedAt) < Date.parse(v.fields.source.modifiedAt) ||
          v.fields.source.revision === r.source.revision ||
          await manifestDigest({title:v.title,text:v.fields.text,files:v.files}) !== v.fields.source.digest)
        throw Error('conflict');
    }
    next = addEntry(next, {
      ...(entry ? {
        id: entry.id
      } : {}),
      kind: 'note',
      title: r.title,
      fields: {
        text: r.text,
        source: r.source
      },
      files: r.files
    });
    result[entry ? 'updated' : 'created']++;
  }
  return {
    document: next,
    ...result
  };
}
