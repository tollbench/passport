// Copyright 2026 Steven Ochs and Tollbench. SPDX-License-Identifier: Apache-2.0
// The static-origin bundle check refuses any import-looking token that is not a local
// module path. It reads text, not syntax: a class name or comment ending in the word
// before a quote looks like an import too. Keep the hosted graph clean of both.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readdir, readFile} from 'node:fs/promises';

const web = new URL('../src/toll_passport/web/', import.meta.url);
const looksLikeImport = /\b(?:from\s*|import\s*\(\s*|import\s*)['"]([^'"]+)['"]/g;
test('every import-looking token in the web modules is a local module path', async () => {
  const names = [...(await readdir(web)).filter(n => n.endsWith('.mjs')),
    ...(await readdir(new URL('organizer/', web))).filter(n => n.endsWith('.mjs')).map(n => 'organizer/' + n)];
  assert.ok(names.includes('questions-only.mjs') && names.includes('code-lock.mjs'));
  const bad = [];
  for (const name of names) {
    const text = await readFile(new URL(name, web), 'utf8');
    for (const match of text.matchAll(looksLikeImport))
      if (!/^(\.\/|\.\.\/|\/passport\/assets\/)/.test(match[1])) bad.push(`${name}: ${match[0].slice(0, 60)}`);
  }
  assert.deepEqual(bad, []);
});
