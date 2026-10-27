// Copyright 2026 Steven Ochs and Tollbench. SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import {createVault, addEntry, exportRecovery} from '../src/toll_passport/web/vault.mjs';
import {createDeviceMemory} from '../src/toll_passport/web/device-memory.mjs';
import {createBookSession} from '../src/toll_passport/web/book-session.mjs';
import {PROTOCOL, validateRequest, validateResult, validateCodeStatus} from '../src/toll_passport/web/hosted-bridge.mjs';
import {mergeLegacyBook, hasMerged} from '../src/toll_passport/web/book-merge.mjs';

const owner = {ownerBinding: 'x'.repeat(32), parentOrigin: 'https://app.example'};
const storage = () => {
  const records = new Map();
  return {records, get: async k => records.get(k), add: async (k, v) => { if (records.has(k)) throw Error('exists'); records.set(k, v); },
    put: async (k, v) => { records.set(k, v); }, delete: async k => { records.delete(k); }, keys: async () => [...records.keys()]};
};
const nonce = () => crypto.randomUUID().replace(/-/g, '') + 'abc';

/** A host with an in-memory copy of the server door: verifier compare, 10 tries, off at 10. */
function fakeHost({personal = null, business = null} = {}) {
  const rows = {personal: personal ? {envelope: personal, etag: 'p0'} : {envelope: null, etag: null},
    business: business ? {envelope: business, etag: 'b0'} : {envelope: null, etag: null}};
  const server = {code: null, loginNonce: nonce(), unlocks: 0, sets: 0};
  const status = () => server.code ? {hasCode: true, vaultId: server.code.vaultId, salt: server.code.salt,
    iterations: server.code.iterations, attemptsLeft: server.code.disabled ? 0 : 10 - server.code.attempts,
    disabled: server.code.disabled, loginNonce: server.loginNonce} :
    {hasCode: false, vaultId: null, salt: null, iterations: null, attemptsLeft: 10, disabled: false, loginNonce: server.loginNonce};
  const fail = (error, attemptsLeft) => Object.assign(Error(error), attemptsLeft === undefined ? {} : {attemptsLeft});
  const host = {scopes: ['personal', 'business'], storageIdentity: owner, server, rows,
    async request(op, scope, payload = {}) {
      // Every message the session sends must pass the strict bridge check.
      const message = {protocol: PROTOCOL, type: 'request', nonce: crypto.randomUUID(), capability: 'a'.repeat(32),
        id: crypto.randomUUID(), op, scope, ...payload};
      assert.equal(validateRequest(message), true, op);
      const reply = (fields) => {
        const result = {...message, type: 'result', ...fields};
        delete result.auth; delete result.code; delete result.envelope; delete result.expectedEtag;
        if (fields.envelope !== undefined) result.envelope = fields.envelope;
        assert.equal(validateResult(result), true, op + ' result');
        return result;
      };
      if (op === 'load') return reply({ok: true, envelope: rows[scope].envelope, etag: rows[scope].etag});
      if (op === 'save') {
        if (payload.expectedEtag !== rows[scope].etag) throw Error('conflict');
        rows[scope] = {envelope: payload.envelope, etag: scope + Math.random().toString(36).slice(2)};
        return reply({ok: true, etag: rows[scope].etag});
      }
      if (op === 'code-status') return reply({ok: true, status: status()});
      if (op === 'code-set') {
        server.sets++;
        server.code = {...payload.code, attempts: 0, disabled: false};
        return reply({ok: true, status: status()});
      }
      if (op === 'code-unlock') {
        server.unlocks++;
        if (!server.code) throw fail('no-code', 10);
        if (server.code.disabled) throw fail('disabled', 0);
        if (payload.auth !== server.code.auth) {
          server.code.attempts++;
          if (server.code.attempts >= 10) { server.code.disabled = true; throw fail('disabled', 0); }
          throw fail('wrong', 10 - server.code.attempts);
        }
        server.code.attempts = 0;
        return reply({ok: true, opened: {share: server.code.share, wrappedKey: server.code.wrappedKey, vaultId: server.code.vaultId}});
      }
      throw Error('invalid');
    }};
  return host;
}

test('createBook sets the code; right code unlocks; the code never crosses the bridge', async () => {
  const host = fakeHost(), session = createBookSession(host);
  await session.load('personal');
  const made = await session.createBook('123456');
  assert.equal(made.filename, 'passport-recovery.json');
  const recovery = JSON.parse(await made.recoveryFile.text());
  assert.equal(recovery.format, 'passport-recovery-v1');
  assert.ok(session.getState('personal').document);
  assert.equal(JSON.stringify(host.server.code).includes('123456'), false);
  assert.deepEqual(await session.codeStatus(), {hasBook: true, codeSet: true, locked: false, attemptsLeft: 10, disabled: false});
  await session.lockAll();
  assert.equal(session.getState('personal').document, null);
  assert.deepEqual(await session.unlockWithCode('123456'), {ok: true});
  assert.equal(session.getState('personal').document.vaultId, recovery.vaultId);
  // Business is a label on the one book, not a second book.
  assert.equal(session.getState('business').document.vaultId, recovery.vaultId);
});

test('wrong codes count down, the 10th turns the code off, recovery file opens and a new code resets', async () => {
  const host = fakeHost(), session = createBookSession(host);
  await session.load('personal');
  const made = await session.createBook('246802');
  await session.lockAll();
  const first = await session.unlockWithCode('000000');
  assert.deepEqual(first, {ok: false, reason: 'wrong', attemptsLeft: 9});
  assert.equal((await session.codeStatus()).attemptsLeft, 9);
  // A malformed code is refused locally and uses no try.
  const unlocksBefore = host.server.unlocks;
  assert.equal((await session.unlockWithCode('12ab')).reason, 'wrong');
  assert.equal(host.server.unlocks, unlocksBefore);
  for (let i = 0; i < 8; i++) assert.equal((await session.unlockWithCode('111111')).reason, 'wrong');
  assert.deepEqual(await session.unlockWithCode('222222'), {ok: false, reason: 'disabled', attemptsLeft: 0});
  assert.equal((await session.codeStatus()).disabled, true);
  // Even the right code no longer opens it.
  assert.equal((await session.unlockWithCode('246802')).reason, 'disabled');
  assert.equal(session.getState('personal').document, null);
  const opened = await session.unlockWithRecoveryFile(made.recoveryFile);
  assert.deepEqual(opened, {ok: true, needsCode: true});
  assert.ok(session.getState('personal').document);
  assert.deepEqual(await session.setCode('135790'), {ok: true});
  assert.deepEqual(await session.codeStatus(), {hasBook: true, codeSet: true, locked: false, attemptsLeft: 10, disabled: false});
  await session.lockAll();
  assert.equal((await session.unlockWithCode('246802')).reason, 'wrong');
  assert.deepEqual(await session.unlockWithCode('135790'), {ok: true});
});

test('existing book without a code: open with recovery once, then pick a code', async () => {
  const vault = await createVault(), host = fakeHost({personal: vault.envelope}), session = createBookSession(host);
  await session.load('personal');
  assert.deepEqual(await session.codeStatus(), {hasBook: true, codeSet: false, locked: true, attemptsLeft: 10, disabled: false});
  assert.equal((await session.unlockWithCode('123456')).reason, 'no-code');
  assert.equal((await session.setCode('123456')).reason, 'locked');
  assert.equal((await session.unlockWithRecoveryFile({format: 'passport-vault-v1'})).reason, 'backup-file');
  const other = await createVault();
  assert.equal((await session.unlockWithRecoveryFile(await exportRecovery(other.key, other.document.vaultId))).reason, 'wrong-book');
  assert.equal((await session.unlockWithRecoveryFile(await exportRecovery(vault.key, vault.document.vaultId))).ok, true);
  assert.deepEqual(await session.setCode('123456'), {ok: true});
  await session.lockAll();
  assert.deepEqual(await session.unlockWithCode('123456'), {ok: true});
});

test('stays open on this device for this login; a new login nonce asks for the code again; Lock ends it', async () => {
  const host = fakeHost(), store = storage(), device = createDeviceMemory(store);
  const first = createBookSession(host, device);
  await first.load('personal');
  await first.createBook('864209');
  // Same login, new page: opens without the code.
  const again = createBookSession(host, device);
  await again.load('personal');
  assert.ok(again.getState('personal').document);
  // New login: the server issues a new nonce, so the old wrapper no longer fits.
  host.server.loginNonce = nonce();
  const relogin = createBookSession(host, device);
  await relogin.load('personal');
  assert.equal(relogin.getState('personal').document, null);
  assert.deepEqual(await relogin.unlockWithCode('864209'), {ok: true});
  // Only one live wrapper remains, bound to the new login.
  assert.equal([...store.records.keys()].filter(k => k.startsWith('vault2:')).length, 1);
  const reopened = createBookSession(host, device);
  await reopened.load('personal');
  assert.ok(reopened.getState('personal').document);
  await reopened.lockAll();
  assert.equal([...store.records.keys()].some(k => k.startsWith('vault2:')), false);
  const afterLock = createBookSession(host, device);
  await afterLock.load('personal');
  assert.equal(afterLock.getState('personal').document, null);
  assert.deepEqual(await afterLock.unlockWithCode('864209'), {ok: true});
});

test('a legacy Business book merges once with labels and its ciphertext is left alone', async () => {
  const personal = await createVault();
  let business = await createVault();
  let bdoc = addEntry(business.document, {kind: 'note', title: 'Company story', fields: {content: 'We make tea.'}});
  bdoc = addEntry(bdoc, {id: bdoc.entries[0].id, kind: 'note', title: 'Company story', fields: {content: 'We make green tea.'}});
  const {sealVault} = await import('../src/toll_passport/web/vault.mjs');
  const businessEnvelope = await sealVault(bdoc, business.key);
  const host = fakeHost({personal: personal.envelope, business: businessEnvelope}), session = createBookSession(host);
  await session.load('personal');
  assert.equal(session.legacyStatus().present, true);
  // The older book cannot move in until the one book is open.
  assert.equal((await session.unlockWithRecoveryFile(await exportRecovery(business.key, business.document.vaultId))).reason, 'open-book-first');
  await session.unlockWithRecoveryFile(await exportRecovery(personal.key, personal.document.vaultId));
  assert.equal(session.legacyStatus().pending, true);
  const moved = await session.unlockWithRecoveryFile(await exportRecovery(business.key, business.document.vaultId));
  assert.deepEqual(moved, {ok: true, merged: true});
  const doc = session.getState('personal').document;
  const story = doc.entries.find(e => e.versions.at(-1).title === 'Company story');
  assert.equal(story.versions.length, 2);
  assert.deepEqual(story.versions.map(v => v.labels), [{book: 'business'}, {book: 'business'}]);
  assert.equal(hasMerged(doc, business.document.vaultId), true);
  assert.equal(session.legacyStatus().pending, false);
  assert.equal(host.rows.business.envelope, businessEnvelope);
  // A second merge is a no-op, and new versions keep their entry's label.
  assert.equal(mergeLegacyBook(doc, bdoc), doc);
  const edited = addEntry(doc, {id: story.id, kind: 'note', title: 'Company story', fields: {content: 'Tea.'}});
  assert.deepEqual(edited.entries.find(e => e.id === story.id).versions.at(-1).labels, {book: 'business'});
});

test('an older remembered Business wrapper moves in silently after the code opens the book', async () => {
  const business = await createVault(), store = storage(), device = createDeviceMemory(store);
  const legacyName = `vault:${owner.parentOrigin}:${owner.ownerBinding}:business:${business.document.vaultId}`;
  // Simulate a pre-code "Remember this device" wrapper (v1 format).
  const deviceKey = await crypto.subtle.generateKey({name: 'AES-GCM', length: 256}, false, ['encrypt', 'decrypt']);
  await store.add(`key:${owner.parentOrigin}:${owner.ownerBinding}`, deviceKey);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const raw = new Uint8Array(await crypto.subtle.exportKey('raw', business.key));
  const aad = new TextEncoder().encode(JSON.stringify(['passport-device-wrap-v1', owner.parentOrigin, owner.ownerBinding, 'business', business.document.vaultId]));
  const ct = new Uint8Array(await crypto.subtle.encrypt({name: 'AES-GCM', iv, additionalData: aad, tagLength: 128}, deviceKey, raw));
  const b64 = bytes => btoa(String.fromCharCode(...bytes));
  await store.put(legacyName, {format: 'passport-device-wrap-v1', nonce: b64(iv), ciphertext: b64(ct)});
  const host = fakeHost({business: business.envelope}), session = createBookSession(host, device);
  await session.load('personal');
  await session.createBook('909090');
  const doc = session.getState('personal').document;
  assert.equal(hasMerged(doc, business.document.vaultId), true);
});

test('bridge accepts only exact code messages', () => {
  const base = {protocol: PROTOCOL, type: 'request', nonce: crypto.randomUUID(), capability: 'a'.repeat(32), id: crypto.randomUUID(), scope: 'personal'};
  assert.equal(validateRequest({...base, op: 'code-status'}), true);
  assert.equal(validateRequest({...base, op: 'code-status', scope: 'business'}), false);
  assert.equal(validateRequest({...base, op: 'code-status', code: '123456'}), false);
  assert.equal(validateRequest({...base, op: 'code-unlock', auth: btoa('x'.repeat(32))}), true);
  assert.equal(validateRequest({...base, op: 'code-unlock', auth: '123456'}), false);
  assert.equal(validateRequest({...base, op: 'code-unlock', auth: btoa('x'.repeat(32)), key: 'secret'}), false);
  const result = {...base, type: 'result', op: 'code-unlock'};
  assert.equal(validateResult({...result, ok: false, error: 'wrong', attemptsLeft: 4}), true);
  assert.equal(validateResult({...result, ok: false, error: 'wrong'}), false);
  assert.equal(validateResult({...result, ok: false, error: 'wrong', attemptsLeft: 11}), false);
  assert.equal(validateResult({...base, type: 'result', op: 'load', ok: false, error: 'wrong', attemptsLeft: 1}), false);
  assert.equal(validateCodeStatus({hasCode: false, vaultId: null, salt: null, iterations: null, attemptsLeft: 10, disabled: false, loginNonce: null}), true);
  assert.equal(validateCodeStatus({hasCode: true, vaultId: null, salt: null, iterations: null, attemptsLeft: 10, disabled: false, loginNonce: null}), false);
});
