// Copyright 2026 Steven Ochs and Tollbench. SPDX-License-Identifier: Apache-2.0
// One encrypted book behind one private client session. "personal" is its
// storage scope; "business" is only a label now, and an older Business book
// moves into the one book the first time it can be opened here.
import {unlockVault, sealVault, validateDocument, createVault, exportRecovery} from './vault.mjs';
import {validateEnvelope} from './hosted-bridge.mjs';
import {createOwnerLockChannel} from './device-lock-channel.mjs';
import {BOOK_SCOPE, LEGACY_SCOPE, CODE_ATTEMPTS, readCodeStatus, unlockWithCode as codeUnlock,
  setBookCode, codeFits, readRecoveryFile, validCode} from './code-lock.mjs';
import {mergeLegacyBook, hasMerged} from './book-merge.mjs';

const labels = ['personal', 'business'];
const copy = value => JSON.parse(JSON.stringify(value));

export function createBookSession(host, device = null, onChange = () => {}) {
  if (!host || typeof host.request !== 'function' || !Array.isArray(host.scopes)) throw Error('invalid');
  const b = {loaded: false, envelope: null, etag: null, key: null, document: null, uncertain: false,
    error: false, generation: 0, queue: Promise.resolve(), loading: null};
  const legacy = {envelope: null, etag: null};
  let code = null;
  const identity = host.storageIdentity || null;
  const notify = () => { for (const scope of host.scopes) onChange(scope); };
  function dropUnlocked() { b.generation++; b.key = null; b.document = null; b.uncertain = false; notify(); }
  const lockSignal = identity && typeof window !== 'undefined' ? createOwnerLockChannel(identity, dropUnlocked) : null;
  if (lockSignal && typeof window !== 'undefined') window.addEventListener('pagehide', () => lockSignal.close(), {once: true});
  if (typeof host.onUnauthorized === 'function') host.onUnauthorized(dropUnlocked);
  const check = scope => { if (!labels.includes(scope) || !host.scopes.includes(scope)) throw Error('invalid'); };
  const state = scope => { check(scope); return {scope, document: b.key ? b.document : null,
    vaultId: b.envelope?.vaultId || null, loaded: b.loaded, uncertain: b.uncertain, error: b.error}; };
  const legacyPending = () => !!legacy.envelope && !(b.key && hasMerged(b.document, legacy.envelope.vaultId));

  async function keepOpen() {
    // Stays open on this device until Lock or a new login (new login nonce).
    if (!device || !identity || !b.key || !code?.loginNonce) return false;
    try {
      await device.unlockDevice(identity);
      await device.remember(identity, BOOK_SCOPE, b.document.vaultId, b.key, code.loginNonce);
      return true;
    } catch { return false; }
  }
  async function loadLegacy() {
    legacy.envelope = null; legacy.etag = null;
    if (!host.scopes.includes(LEGACY_SCOPE)) return;
    try {
      const result = await host.request('load', LEGACY_SCOPE);
      if (result.envelope && validateEnvelope(result.envelope)) { legacy.envelope = result.envelope; legacy.etag = result.etag; }
    } catch { /* The one book never depends on the older book loading. */ }
  }
  async function load(scope = BOOK_SCOPE, {autoUnlock = true} = {}) {
    check(scope);
    if (b.loading) { await b.loading; return state(scope); }
    const generation = ++b.generation;
    const run = (async () => {
      b.loaded = false; b.key = null; b.document = null; b.uncertain = false; b.error = false; notify();
      let result;
      try { result = await host.request('load', BOOK_SCOPE); }
      catch (error) { if (generation === b.generation) { b.error = true; notify(); } throw error; }
      if (generation !== b.generation) throw Error('conflict');
      if (result.envelope !== null && !validateEnvelope(result.envelope)) throw Error('invalid');
      b.envelope = result.envelope; b.etag = result.etag;
      code = await readCodeStatus(host).catch(() => null);
      await loadLegacy();
      if (generation !== b.generation) throw Error('conflict');
      b.loaded = true; notify();
      if (autoUnlock && b.envelope && device && identity && code?.loginNonce) {
        try {
          const opened = await device.restore(identity, BOOK_SCOPE, b.envelope, code.loginNonce);
          if (generation !== b.generation) throw Error('conflict');
          if (opened) { b.key = opened.key; b.document = opened.document; notify(); }
        } catch (error) {
          if (generation !== b.generation) throw Error('conflict');
          // A missing/evicted/tampered wrapper never replaces the code or recovery file.
          if (error.message !== 'device-unlock-failed' && error.message !== 'device-storage-unavailable') throw error;
        }
      }
      if (b.key) await mergeFromDevice().catch(() => false);
    })();
    b.loading = run;
    try { await run; } finally { if (b.loading === run) b.loading = null; }
    return state(scope);
  }
  async function ready() {
    if (b.loading) await b.loading.catch(() => {});
    else if (!b.loaded) await load(BOOK_SCOPE).catch(() => {});
  }
  async function mergeIn(legacyDocument) {
    if (!b.key || !legacy.envelope || legacyDocument.vaultId !== legacy.envelope.vaultId) throw Error('locked');
    if (hasMerged(b.document, legacyDocument.vaultId)) return state(BOOK_SCOPE);
    return saveBook(doc => mergeLegacyBook(doc, legacyDocument));
  }
  async function mergeFromDevice() {
    // Someone who used "Remember this device" for Business moves it in silently.
    if (!legacyPending() || !device || !identity) return false;
    const opened = await device.restoreLegacy(identity, LEGACY_SCOPE, legacy.envelope).catch(() => null);
    if (!opened) return false;
    await mergeIn(opened.document);
    return true;
  }

  async function codeStatus() {
    await ready();
    const fresh = await readCodeStatus(host);
    if (fresh) code = fresh;
    const fits = codeFits(code, b.envelope);
    return {hasBook: !!b.envelope, codeSet: fits, locked: !b.key,
      attemptsLeft: fits ? code.attemptsLeft : CODE_ATTEMPTS, disabled: fits && !!code.disabled};
  }
  async function unlockWithCode(value) {
    await ready();
    if (!b.envelope) return {ok: false, reason: 'no-book', attemptsLeft: CODE_ATTEMPTS};
    const generation = b.generation, envelope = b.envelope;
    const fresh = await readCodeStatus(host);
    if (fresh) code = fresh;
    const result = await codeUnlock(host, envelope, value, fresh);
    if (!result.ok) {
      if (code && codeFits(code, envelope)) {
        code = {...code, attemptsLeft: result.attemptsLeft, disabled: code.disabled || result.reason === 'disabled'};
        notify();
      }
      return {ok: false, reason: result.reason, attemptsLeft: result.attemptsLeft};
    }
    if (generation !== b.generation || envelope !== b.envelope) throw Error('conflict');
    b.key = result.key; b.document = result.document;
    code = {...code, attemptsLeft: CODE_ATTEMPTS, disabled: false};
    await keepOpen(); notify();
    await mergeFromDevice().catch(() => false);
    return {ok: true};
  }
  async function createBook(value) {
    if (!validCode(value)) throw Error('invalid');
    await ready();
    if (!b.loaded) throw Error('unavailable');
    if (b.envelope) throw Error('exists');
    const generation = b.generation, created = await createVault();
    // The code row is written first: a failed book save leaves no book and no lost key.
    const set = await setBookCode(host, created.key, created.document.vaultId, value);
    if (generation !== b.generation) throw Error('conflict');
    const saved = await host.request('save', BOOK_SCOPE, {envelope: created.envelope, expectedEtag: null});
    if (generation !== b.generation) throw Error('conflict');
    b.envelope = created.envelope; b.etag = saved.etag; b.key = created.key; b.document = created.document;
    code = set.status;
    await keepOpen(); notify();
    await mergeFromDevice().catch(() => false);
    const recovery = await exportRecovery(created.key, created.document.vaultId);
    return {recoveryFile: new Blob([JSON.stringify(recovery, null, 2)], {type: 'application/json'}),
      filename: 'passport-recovery.json'};
  }
  async function setCode(value) {
    if (!b.key || !b.document) return {ok: false, reason: 'locked'};
    if (!validCode(value)) return {ok: false, reason: 'invalid'};
    const generation = b.generation;
    const result = await setBookCode(host, b.key, b.document.vaultId, value);
    if (!result.ok) return result;
    if (generation !== b.generation) return {ok: false, reason: 'locked'};
    code = result.status;
    await keepOpen(); notify();
    return {ok: true};
  }
  async function unlockWithRecoveryFile(file) {
    const parsed = await readRecoveryFile(file);
    if (!parsed.ok) return parsed;
    await ready();
    const recovery = parsed.recovery;
    if (b.envelope && recovery.vaultId === b.envelope.vaultId) {
      const generation = b.generation, envelope = b.envelope;
      let opened;
      try { opened = await unlockVault(envelope, recovery); } catch { return {ok: false, reason: 'failed'}; }
      if (generation !== b.generation || envelope !== b.envelope) throw Error('conflict');
      b.key = opened.key; b.document = opened.document;
      const fresh = await readCodeStatus(host).catch(() => null);
      if (fresh) code = fresh;
      await keepOpen(); notify();
      await mergeFromDevice().catch(() => false);
      return {ok: true, needsCode: !codeFits(code, b.envelope) || !!code.disabled};
    }
    if (legacy.envelope && recovery.vaultId === legacy.envelope.vaultId) {
      if (!b.key) return {ok: false, reason: b.envelope ? 'open-book-first' : 'no-book'};
      let opened;
      try { opened = await unlockVault(legacy.envelope, recovery); } catch { return {ok: false, reason: 'failed'}; }
      await mergeIn(opened.document);
      return {ok: true, merged: true};
    }
    return {ok: false, reason: b.envelope ? 'wrong-book' : 'no-book'};
  }
  async function saveBook(mutator, label = BOOK_SCOPE) {
    if (typeof mutator !== 'function') throw Error('invalid');
    const operation = async () => {
      const snapshot = state(label);
      if (!snapshot.document || b.uncertain) throw Error('locked');
      const next = mutator(copy(snapshot.document));
      validateDocument(next);
      if (next.vaultId !== snapshot.document.vaultId || next.revision <= snapshot.document.revision) throw Error('conflict');
      const generation = b.generation, etag = b.etag, sealed = await sealVault(next, b.key);
      if (generation !== b.generation || etag !== b.etag) throw Error('conflict');
      try {
        const result = await host.request('save', BOOK_SCOPE, {envelope: sealed, expectedEtag: etag});
        if (generation !== b.generation || etag !== b.etag) throw Error('conflict');
        b.etag = result.etag; b.envelope = sealed; b.document = next; notify(); return state(label);
      } catch (error) {
        // A timeout can mean the host committed. Never retry with a stale etag.
        b.uncertain = true; notify(); throw error;
      }
    };
    const pending = b.queue.then(operation); b.queue = pending.catch(() => {}); return pending;
  }
  async function saveToScope(scope, mutator) { check(scope); return saveBook(mutator, scope); }
  async function saveDocument(scope, next, expected) {
    check(scope);
    if (!expected || expected.scope !== scope || expected.vaultId !== b.document?.vaultId ||
        expected.revision !== b.document?.revision) throw Error('conflict');
    return saveBook(current => {
      if (current.revision !== expected.revision) throw Error('conflict');
      return next;
    }, scope);
  }
  async function unlock(scope, recovery) {
    check(scope);
    const result = await unlockWithRecoveryFile(recovery);
    if (!result.ok) throw Error(result.reason === 'failed' ? 'Could not unlock Passport data.' : 'unavailable');
    return state(scope);
  }
  async function rememberDevice() {
    if (!device || !identity || !b.key || b.uncertain) throw Error('unavailable');
    if (!await keepOpen()) throw Error('unavailable');
  }
  async function forgetDevice() {
    if (!device || !identity) throw Error('unavailable');
    dropUnlocked();
    try { await device.forget(identity); } finally { lockSignal?.broadcast(); }
  }
  async function lockAll() {
    dropUnlocked();
    try { if (device && identity) await device.lock(identity); } finally { lockSignal?.broadcast(); }
  }
  async function unlockDevice() {
    if (!device || !identity) throw Error('unavailable');
    await device.unlockDevice(identity);
    return Promise.all(host.scopes.map(scope => load(scope)));
  }
  const legacyStatus = () => ({present: !!legacy.envelope, pending: legacyPending(),
    vaultId: legacy.envelope?.vaultId || null});
  return {getState: state, load, unlock, saveDocument, saveToScope, rememberDevice, forgetDevice, lockAll,
    unlockDevice, codeStatus, unlockWithCode, createBook, setCode, unlockWithRecoveryFile, legacyStatus,
    mergeLegacyFromRecovery: unlockWithRecoveryFile};
}
