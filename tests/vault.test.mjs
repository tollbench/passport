// Copyright 2026 Steven Ochs and Tollbench.
// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createVault,
  unlockVault,
  exportRecovery,
  sealVault,
  validateDocument,
  addEntry,
  removeEntry,
  selectRelease,
  encryptRelease,
  decryptRelease,
  MAX_FILE_BYTES,
  MAX_VAULT_BYTES
} from '../src/toll_passport/web/vault.mjs';

async function populated() {
  const vault = await createVault();
  vault.document = addEntry(vault.document, {
    kind: 'information',
    title: 'Private founder record',
    fields: {
      bio: 'Approved short biography',
      phone: 'PRIVATE PHONE',
      project: 'PRIVATE PROJECT'
    },
    tags: [' Founder BIO ', 'founder bio', 'Unfamiliar hint'],
    files: [{
      name: 'PRIVATE FILE.txt',
      type: 'text/plain',
      data: btoa('PRIVATE CONTENT')
    }]
  });
  return vault;
}
test('random keys and nonces; encrypted snapshot discloses only envelope metadata', async () => {
  const {
    key,
    document
  } = await populated();
  const a = await sealVault(document, key);
  const b = await sealVault(document, key);
  assert.notEqual(a.nonce, b.nonce);
  assert.notEqual(a.ciphertext, b.ciphertext);
  assert.deepEqual(Object.keys(a), ['format', 'vaultId', 'revision', 'nonce', 'ciphertext']);
  for (const marker of ['founder', 'PHONE', 'PROJECT', 'FILE', 'CONTENT']) assert.equal(JSON
    .stringify(a).includes(marker), false);
  const recovery = await exportRecovery(key, document.vaultId);
  assert.equal(Buffer.from(recovery.key, 'base64').length, 32);
  assert.deepEqual((await unlockVault(a, recovery)).document, document);
  const other = await createVault();
  assert.notEqual((await exportRecovery(other.key, other.document.vaultId)).key, recovery
  .key);
});
test('key, ciphertext, nonce and authenticated revision tampering fail closed', async () => {
  const {
    key,
    document
  } = await populated();
  const envelope = await sealVault(document, key);
  const recovery = await exportRecovery(key, document.vaultId);
  const wrong = await createVault();
  const wrongRecovery = await exportRecovery(wrong.key, document.vaultId);
  await assert.rejects(unlockVault(envelope, wrongRecovery), /Could not unlock/);
  for (const field of ['ciphertext', 'nonce']) {
    const bytes = Buffer.from(envelope[field], 'base64');
    bytes[0] ^= 1;
    await assert.rejects(unlockVault({
      ...envelope,
      [field]: bytes.toString('base64')
    }, recovery));
  }
  await assert.rejects(unlockVault({
    ...envelope,
    revision: envelope.revision + 1
  }, recovery));
  const changedId = crypto.randomUUID();
  await assert.rejects(unlockVault({
    ...envelope,
    vaultId: changedId
  }, {
    ...recovery,
    vaultId: changedId
  }));
  await assert.rejects(unlockVault({
    ...envelope,
    format: 'passport-release-envelope-v1'
  }, recovery));
});
test('malformed imports and recovery are rejected without private content in errors', async () => {
  const {
    key,
    document
  } = await populated();
  const envelope = await sealVault(document, key);
  const recovery = await exportRecovery(key, document.vaultId);
  for (const bad of [null, [], {}, {
      ...envelope,
      extra: 'PRIVATE'
    }, {
      ...envelope,
      nonce: 'PRIVATE'
    }, {
      ...envelope,
      ciphertext: '===='
    }, {
      ...envelope,
      revision: -1
    }]) {
    await assert.rejects(unlockVault(bad, recovery), error => !error.message.includes(
      'PRIVATE'));
  }
  for (const bad of [null, {}, {
      ...recovery,
      key: ''
    }, {
      ...recovery,
      vaultId: crypto.randomUUID()
    }, {
      ...recovery,
      key: btoa('short')
    }]) await assert.rejects(unlockVault(envelope, bad));
});
test('immutable version updates and deletion leave original document intact', async () => {
  const {
    document
  } = await populated();
  const original = JSON.stringify(document);
  const entryId = document.entries[0].id;
  const updated = addEntry(document, {
    id: entryId,
    kind: 'information',
    title: 'Changed',
    fields: {
      bio: 'New biography'
    }
  });
  assert.equal(JSON.stringify(document), original);
  assert.equal(updated.revision, document.revision + 1);
  assert.equal(updated.entries.length, 1);
  assert.equal(updated.entries[0].versions.length, 2);
  assert.deepEqual(updated.entries[0].versions[0], document.entries[0].versions[0]);
  assert.equal(updated.entries[0].versions[1].version, 2);
  assert.equal(removeEntry(updated, entryId).entries.length, 0);
  assert.equal(updated.entries.length, 1);
  assert.throws(() => removeEntry(document, crypto.randomUUID()));
  assert.throws(() => addEntry(document, {
    id: crypto.randomUUID(),
    kind: 'note',
    title: 'Unknown entry',
    fields: {}
  }));
});
test('optional, unfamiliar question tags remain hints and normalize without model calls',
async () => {
    const {
      document
    } = await populated();
    assert.deepEqual(document.entries[0].versions[0].tags, ['founder bio', 'unfamiliar hint']);
    const next = addEntry(document, {
      kind: 'answer',
      title: 'Unclassified answer',
      fields: {
        answer: 'Yes'
      }
    });
    assert.deepEqual(next.entries[1].versions[0].tags, []);
  });
test('exact selected version and fields exclude all unrelated entries, metadata and files',
async () => {
    let {
      document
    } = await populated();
    const entryId = document.entries[0].id;
    document = addEntry(document, {
      kind: 'private',
      title: 'Other private entry',
      fields: {
        secret: 'PRIVATE SECOND ENTRY'
      }
    });
    document = addEntry(document, {
      id: entryId,
      kind: 'information',
      title: 'New private version',
      fields: {
        bio: 'New biography',
        phone: 'NEW PRIVATE PHONE'
      }
    });
    const release = selectRelease(document, {
      entryId,
      version: 1,
      fields: ['bio'],
      recipient: 'Outreach agent',
      purpose: 'Prepare one pitch'
    });
    assert.deepEqual(release.fields, {
      bio: 'Approved short biography'
    });
    assert.equal(JSON.stringify(release).includes('PRIVATE'), false);
    for (const name of ['title', 'kind', 'tags', 'files']) assert.equal(Object.hasOwn(release,
      name), false);
    assert.equal(release.version, 1);
    assert.throws(() => selectRelease(document, {
      entryId,
      version: 1,
      fields: ['missing'],
      recipient: 'Agent',
      purpose: 'Pitch'
    }));
    assert.throws(() => selectRelease(document, {
      entryId,
      version: 99,
      fields: ['bio'],
      recipient: 'Agent',
      purpose: 'Pitch'
    }));
    const explicit = selectRelease(document, {
      entryId,
      version: 1,
      fields: ['$title', '$tags', '$files'],
      recipient: 'Agent',
      purpose: 'Review'
    });
    assert.equal(explicit.title, 'Private founder record');
    assert.equal(explicit.files[0].name, 'PRIVATE FILE.txt');
    explicit.files[0].name = 'Changed';
    assert.equal(document.entries[0].versions[0].files[0].name, 'PRIVATE FILE.txt');
  });
test('release has independent encryption; cannot be opened as a full vault', async () => {
  const {
    key,
    document
  } = await populated();
  const release = selectRelease(document, {
    entryId: document.entries[0].id,
    version: 1,
    fields: ['bio'],
    recipient: 'Agent',
    purpose: 'Pitch'
  });
  const {
    envelope,
    recovery
  } = await encryptRelease(release);
  assert.deepEqual(await decryptRelease(envelope, recovery), release);
  assert.notEqual(recovery.key, (await exportRecovery(key, document.vaultId)).key);
  assert.notEqual(envelope.vaultId, document.vaultId);
  await assert.rejects(unlockVault(envelope, recovery));
  const bytes = Buffer.from(envelope.ciphertext, 'base64');
  bytes[0] ^= 1;
  await assert.rejects(decryptRelease({
    ...envelope,
    ciphertext: bytes.toString('base64')
  }, recovery));
});
test('schema rejects prototype pollution, invalid versions, duplicates and non-JSON fields',
async () => {
  const {
    document
  } = await populated();
  const copy = () => structuredClone(document);
  let bad = copy();
  bad.entries.push(bad.entries[0]);
  assert.throws(() => validateDocument(bad));
  bad = copy();
  bad.entries[0].versions[0].version = 2;
  assert.throws(() => validateDocument(bad));
  bad = copy();
  bad.entries[0].versions[0].fields = JSON.parse('{"__proto__":{"polluted":true}}');
  assert.throws(() => validateDocument(bad));
  for (const value of [NaN, Infinity, undefined, () => {}, new Date()]) {
    bad = copy();
    bad.entries[0].versions[0].fields = {
      bad: value
    };
    assert.throws(() => validateDocument(bad));
  }
  bad = copy();
  bad.entries[0].versions[0].fields.self = bad;
  assert.throws(() => validateDocument(bad));
  bad = copy();
  bad.entries[0].versions[0].fields = {
    '$files': 'ambiguous selector'
  };
  assert.throws(() => validateDocument(bad));
});
test('raw file limit is enforced before a file enters the document', async () => {
  const {
    document
  } = await createVault();
  const data = Buffer.alloc(MAX_FILE_BYTES + 1).toString('base64');
  assert.throws(() => addEntry(document, {
    kind: 'file',
    title: 'Too big',
    fields: {},
    files: [{
      name: 'large.bin',
      type: '',
      data
    }]
  }));
});
test('whole snapshot quota includes file encoding and encryption overhead', async () => {
  const {
    document
  } = await populated();
  document.entries[0].versions[0].fields.large = 'x'.repeat(MAX_VAULT_BYTES);
  assert.throws(() => validateDocument(document), /storage limit/);
});
test('external keys must be AES-256-GCM', async () => {
  const {
    document
  } = await createVault();
  const weakKey = await crypto.subtle.generateKey({
    name: 'AES-GCM',
    length: 128
  }, true, ['encrypt', 'decrypt']);
  await assert.rejects(sealVault(document, weakKey));
  await assert.rejects(exportRecovery(weakKey, document.vaultId));
});
