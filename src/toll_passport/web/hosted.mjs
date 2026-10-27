// Copyright 2026 Steven Ochs and Tollbench. SPDX-License-Identifier: Apache-2.0
import {
  createVault,
  unlockVault,
  exportRecovery,
  sealVault,
  addEntry,
  removeEntry,
  selectRelease,
  encryptRelease,
  decryptRelease
} from './vault.mjs';
import { findAnswerCandidates } from './answers.mjs';
import { connectHost } from './hosted-bridge.mjs';
import { ALLOWED_PARENT_ORIGINS } from './client-policy.mjs';
import { createDeviceMemory, indexedDbDeviceStorage } from './device-memory.mjs';
import { createOwnerLockChannel } from './device-lock-channel.mjs';
import { BOOK_SCOPE, LEGACY_SCOPE, CODE_ATTEMPTS, readCodeStatus, unlockWithCode, setBookCode, codeFits,
  readRecoveryFile } from './code-lock.mjs';
import { mergeLegacyBook, hasMerged, isMergeMarker } from './book-merge.mjs';
import { mountCodeEntry } from './code-entry.mjs';
// A sandboxed opaque frame keeps the URL's origin in location.origin. The
// serialized browsing-context origin is null, which preserves the legacy host.
if (window.origin !== 'null' && !ALLOWED_PARENT_ORIGINS.length)
  throw Error('Dedicated Passport origin is not configured.');
import { connectQuestionHost } from './question-channel.mjs';
import { mountQuestionAnswer } from './question-answer.mjs';
import { connectBatchHost } from './question-batch-channel.mjs';
import { mountQuestionBatch } from './question-batch.mjs';
import {connectItemHost} from './item-share-channel.mjs';
import {mountItemPicker} from './item-picker.mjs';
let questionPanel, batchPanel, itemPanel;
const panels = new Map();
let pendingPanel = /^#panel-[a-z][a-z0-9-]{0,63}$/.test(location.hash) ? location.hash.slice(1) : null;
const $ = id => document.getElementById(id);
let key, doc, envelope, host, device, lockSignal, scope, etag = null, pendingCreation, loaded = false, sharing, receivedEnvelope, receivedRecovery, busy = false,
  recoverySaved = false, loadFailed = false, pendingRestore = null, libraryKind = 'all',
  shareGeneration = 0, vaultGeneration = 0,
  filledAnswer = null, renderedAnswerSignature = null,
  // One book: `scope` is only the label the host asked for; storage is always BOOK_SCOPE.
  codeState = null, legacyEnvelope = null, backupNotice = false, codeSetupOpen = false, recoveryOpen = false,
  createFirst = null, setupFirst = null, unlockEntry = null, createEntry = null, setupEntry = null;
const MAX_FILE = 25 * 1024 * 1024,
  MAX_IMPORT = 145 * 1024 * 1024;

/** Trusted fixed modules inside this isolated page only; never a URL/plugin loader.
 * No encryption key or parent-window access is exposed by this local API.
 */
export function registerPanel({ id, label, mount }) {
  if (!/^[a-z][a-z0-9-]{0,63}$/.test(id) || panels.has(id) || typeof label !== 'string' ||
      !label.trim() || label.length > 100 || typeof mount !== 'function') throw Error('invalid');
  const root = document.createElement('section'); root.id = `panel-${id}`; root.className = 'extension-panel';
  const link = document.createElement('a'); link.href = `#${root.id}`; link.textContent = label;
  root.tabIndex = -1; $('extension-panels').append(root); document.querySelector('.book-contents').append(link);
  const api = { root, getState: () => ({ document: key ? doc : null, scope }), run,
    save: (next, expected) => {
      if (!expected || expected.vaultId !== doc?.vaultId || expected.revision !== doc?.revision || expected.scope !== scope || !key) return Promise.reject(Error('conflict'));
      return save(next, expected);
    } };
  const panel = { root, controller: mount(api) || {} }; panels.set(id, panel);
  refreshPanels();
  if (key && pendingPanel === root.id) activatePendingPanel();
}
function activatePendingPanel() {
  const panel = [...panels.values()].find(p => p.root.id === pendingPanel);
  if (!key || !panel) return false;
  pendingPanel = null; panel.controller.activate?.(); panel.root.focus({ preventScroll: true }); panel.root.scrollIntoView({ block: 'start', behavior: 'instant' }); return true;
}
function refreshPanels() {
  for (const panel of panels.values()) {
    panel.root.hidden = !key;
    try { panel.controller.refresh?.(); if (!key) panel.root.replaceChildren(); }
    catch { panel.root.replaceChildren(); panel.root.hidden = true; }
  }
}

function invalidateShare() {
  shareGeneration++;
  $('share-preview').replaceChildren();
}

function clearTransient() {
  clearRestore();
  invalidateShare();
  libraryKind = 'all';
  $('library-search').value = '';
  $('information-editor').open = false;
  $('answer-editor').open = false;
  renderedAnswerSignature = null;
  filledAnswer = null;
  $('answer-suggestions').replaceChildren();
  $('answer-suggestions').hidden = true;
  $('answer-source').textContent = '';
  $('task-reference').hidden = false;
  sharing = null;
  receivedEnvelope = null;
  receivedRecovery = null;
  $('received').replaceChildren();
  $('share-fields').replaceChildren();
  $('share').hidden = true;
  document.querySelectorAll('form').forEach(f => f.reset());
  document.querySelectorAll('input[type=file]').forEach(f => f.value = '');
}

function status(message) {
  $('status').textContent = message;
}

function revealBook() {
  if (itemPanel?.focus() || batchPanel?.focus() || questionPanel?.focus()) return;
  if (activatePendingPanel()) return;
  for (const panel of panels.values()) if (!panel.root.hidden && panel.controller.focus?.()) return;
  const heading = $('book-heading');
  heading.focus({ preventScroll: true });
  heading.closest('.book-open-heading').scrollIntoView({ block: 'start', behavior: 'instant' });
}

document.querySelector('.book-contents').addEventListener('click', event => {
  const link = event.target.closest('a');
  if (!link) return;
  event.preventDefault();
  const targetId = link.hash.slice(1);
  for (const panel of panels.values()) {
    if (panel.root.id === targetId) panel.controller.activate?.();
    else panel.controller.deactivate?.();
  }
  const heading = $(targetId);
  if (!heading) return;
  heading.focus({ preventScroll: true });
  heading.scrollIntoView({ block: 'start', behavior: 'instant' });
});

function node(tag, text, cls) {
  const n = document.createElement(tag);
  if (text !== undefined) n.textContent = text;
  if (cls) n.className = cls;
  return n;
}

function button(text, fn, cls = 'secondary') {
  const b = node('button', text, cls);
  b.type = 'button';
  b.addEventListener('click', () => run(fn));
  return b;
}
// Native confirm() is unavailable without allow-modals. Keep consent inside the frame.
function ask(message) {
  return new Promise(resolve => {
    const dialog = node('dialog');
    dialog.append(node('p', message));
    const finish = value => { dialog.close(); dialog.remove(); resolve(value); };
    const yes = node('button', 'Continue'), no = node('button', 'Cancel', 'secondary');
    yes.addEventListener('click', () => finish(true));
    no.addEventListener('click', () => finish(false));
    dialog.addEventListener('cancel', e => { e.preventDefault(); finish(false); });
    dialog.append(yes, no); document.body.append(dialog); dialog.showModal(); no.focus();
  });
}
async function run(fn) {
  if (busy) return;
  busy = true;
  document.querySelectorAll('form').forEach(f => f.inert = true);
  $('vault-scope').disabled = true;
  document.querySelectorAll('button,input[type=file]').forEach(b => b.disabled = true);
  try {
    await fn();
  } catch (err) {
    const unlockErrors = {
      'unlock-file': 'Choose a valid Passport recovery file. Nothing was changed.',
      'unlock-backup': 'This is an encrypted backup of your book, not its key. Choose the recovery file instead. Nothing was changed.',
      'unlock-wrong-book': 'This recovery file belongs to a different book. Your book is still locked. Nothing was changed.',
      'unlock-legacy': 'This is the recovery file for your older Business book. Open your book first, then move the Business book in.',
      'merge-wrong-book': 'This recovery file is not for your older Business book. Nothing was changed.',
      'unlock-failed': 'This recovery file could not open your book. Its key may be wrong or the saved book may be damaged. Nothing was changed.',
      'unlock-changed': 'Your book changed while opening. Try again. Nothing was changed.',
      'code-unavailable': 'Codes are not available right now. Your book is safe. Try again in a moment.'
    };
    status(unlockErrors[err.message] || (err.message === 'conflict' ?
      'Save not confirmed: this vault changed elsewhere. Your input is still here. Export a backup if needed, then reload the saved vault and unlock again.' :
      err.message === 'quota' ? 'Save not confirmed: host storage quota reached. Your input is still here.' :
      'Action not confirmed. Check your recovery file or host connection. A timed-out write may have reached storage; reload before retrying.'));
    $('status').focus({ preventScroll: true });
    $('status').scrollIntoView({ block: 'start', behavior: 'instant' });
  } finally {
    busy = false;
    document.querySelectorAll('form').forEach(f => f.inert = false);
    document.querySelectorAll('button,input[type=file]').forEach(b => b.disabled = false);
    $('vault-scope').disabled = !host || !!pendingCreation;
    questionPanel?.refresh(); batchPanel?.refresh(); itemPanel?.refresh(); refreshPanels();
  }
}

async function readSaved() {
  return host.request('load', BOOK_SCOPE);
}
async function readLegacy() {
  if (!host.scopes.includes(LEGACY_SCOPE)) return null;
  try { return (await host.request('load', LEGACY_SCOPE)).envelope; } catch { return null; }
}
async function persist(next) {
  const result = await host.request(next ? 'save' : 'delete', BOOK_SCOPE,
    next ? { envelope: next, expectedEtag: etag } : { expectedEtag: etag });
  etag = result.etag;
}
async function save(next, expected = null) {
  if (!key || !doc || next.vaultId !== doc.vaultId || next.revision <= doc.revision ||
      expected && (expected.vaultId !== doc.vaultId || expected.revision !== doc.revision || expected.scope !== scope)) throw Error('conflict');
  const before = { key, doc, scope, etag };
  const unchanged = () => key === before.key && doc === before.doc && scope === before.scope && etag === before.etag;
  const sealed = await sealVault(next, before.key);
  if (!unchanged()) throw Error('conflict');
  const result = await host.request('save', BOOK_SCOPE, { envelope: sealed, expectedEtag: before.etag });
  if (!unchanged()) throw Error('conflict');
  etag = result.etag; doc = next; envelope = sealed;
  clearTransient(); render();
  status('Saved privately. Your information is in your book.'); revealBook();
}

function download(data, name, type = 'application/json') {
  const blob = data instanceof Blob ? data : new Blob([JSON.stringify(data, null, 2)], {
    type
  });
  const url = URL.createObjectURL(blob),
    a = node('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
async function jsonFile(file) {
  if (!file || file.size > MAX_IMPORT) throw Error('Invalid file');
  return JSON.parse(await file.text());
}

function b64(bytes) {
  let out = '';
  for (let i = 0; i < bytes.length; i += 32768) out += String.fromCharCode(...bytes.subarray(i, i +
    32768));
  return btoa(out);
}
async function filesValue(files) {
  const out = [];
  let sum = 0;
  for (const f of files) {
    if (f.size > MAX_FILE) throw Error('File too large');
    sum += f.size;
    if (sum > 75 * 1024 * 1024) throw Error('Batch too large');
    out.push({
      name: f.name,
      type: f.type || 'application/octet-stream',
      data: b64(new Uint8Array(await f.arrayBuffer()))
    });
  }
  return out;
}

function downloadFile(f) {
  const raw = atob(f.data),
    bytes = Uint8Array.from(raw, c => c.charCodeAt(0));
  download(new Blob([bytes], {
    type: 'application/octet-stream'
  }), f.name.replace(/[\\/\x00-\x1f]/g, '_'));
}

function libraryEntries() {
  return (doc?.entries || []).filter(entry => !isMergeMarker(entry) &&
    ![...panels.values()].some(p => p.controller.ownsEntry?.(entry)));
}
function renderLibrary() {
  const list = $('entries');
  list.replaceChildren();
  const entries = key ? libraryEntries() : [];
  const search = $('library-search').value.trim().toLocaleLowerCase();
  document.querySelectorAll('[data-library-kind]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.libraryKind === libraryKind)));
  if (!key) { $('library-results').textContent = ''; return; }
  const kind = entry => ['file', 'answer'].includes(entry.versions.at(-1).kind) ? entry.versions.at(-1).kind : 'note';
  const matching = entries.filter(entry => {
    const v = entry.versions.at(-1);
    return (libraryKind === 'all' || libraryKind === kind(entry)) &&
      (!search || [v.title, ...(v.tags || []), ...Object.values(v.labels || {})].some(text => text.toLocaleLowerCase().includes(search)));
  });
  $('library-results').textContent = entries.length ? `${matching.length} of ${entries.length} ${entries.length === 1 ? 'item' : 'items'}` : '';
  if (!entries.length) {
    const empty = node('div', undefined, 'library-empty');
    empty.append(node('h3', 'Your library starts here.'), node('p', 'Add a note about yourself or your business, or upload a document. What you save will appear here.'));
    list.append(empty);
  } else if (!matching.length) {
    list.append(node('p', 'No items match. Try another title or tag, or choose All.', 'book-empty'));
  }
  for (const entry of matching) {
    const v = entry.versions.at(-1), card = node('article', undefined, 'record library-record'),
      details = node('details'), summary = node('summary'), body = node('div', undefined, 'record-body'),
      type = { file: 'File', answer: 'Saved answer', note: 'Note' }[kind(entry)];
    summary.append(node('span', type, 'record-type'));
    if (v.labels?.book === 'business') summary.append(node('span', 'Business', 'record-label'));
    summary.append(node('strong', v.title, 'record-title'));
    const preview = typeof v.fields.content === 'string' ? v.fields.content : typeof v.fields.answer === 'string' ? v.fields.answer : '';
    if (preview) summary.append(node('span', preview.replace(/\s+/g, ' ').slice(0, 120) + (preview.length > 120 ? '…' : ''), 'record-preview'));
    const tags = node('div', undefined, 'record-tags');
    for (const t of v.tags || []) tags.append(node('span', t, 'tag'));
    if (tags.childNodes.length) summary.append(tags);
    body.append(node('p', `Version ${v.version} · ${new Date(v.createdAt).toLocaleDateString()}`, 'muted'));
    for (const [field, value] of Object.entries(v.fields)) {
      body.append(node('p', `${field === 'content' ? '' : field + ': '}${typeof value === 'string' ? value : JSON.stringify(value)}`));
    }
    for (const f of v.files || []) body.append(button(`Download ${f.name}`, () => downloadFile(f)));
    const actions = node('div', undefined, 'record-actions');
    actions.append(button('Choose what to share', () => startShare(entry.id, v)), button('Remove', async () => {
      if (await ask('Remove this record and its versions from this hosted vault? Existing exports and shared copies remain.')) await save(removeEntry(doc, entry.id));
    }, 'danger'));
    body.append(actions); details.append(summary, body); card.append(details); list.append(card);
  }
}
$('library-search').addEventListener('input', renderLibrary);
for (const b of document.querySelectorAll('[data-library-kind]')) b.addEventListener('click', () => {
  libraryKind = b.dataset.libraryKind; renderLibrary();
});
$('add-information').addEventListener('click', () => {
  $('information-editor').open = true;
  $('entry-form').elements.title.focus({ preventScroll: true });
  $('information-editor').scrollIntoView({ block: 'start', behavior: 'instant' });
});
function render() {
  questionPanel?.refresh(); batchPanel?.refresh(); itemPanel?.refresh(); refreshPanels();
  const unlocked = !!key, state = unlocked ? 'open' : pendingCreation ? 'recovery' : !loaded ? loadFailed ? 'error' : 'loading' : envelope ? 'locked' : 'empty';
  const fits = codeFits(codeState, envelope), disabled = fits && !!codeState.disabled;
  document.body.dataset.bookState = state;
  $('intro-heading').textContent = 'Your book.';
  $('intro-description').textContent = state === 'loading' ? 'Finding your saved book…' : state === 'error' ? host ? 'Your saved book could not be loaded. Choose Reload saved book to try again.' : 'The book connection is unavailable. Close this book and open it again, or refresh the page.' :
    'Your story, your business, your files and saved answers, together in one private book.';
  $('welcome').hidden = state !== 'empty';
  const noDoor = state === 'empty' && !codeState;
  $('create').hidden = !noDoor;
  $('create-code').hidden = noDoor;
  if (noDoor) $('welcome-text').textContent = 'Your browser creates a new encryption key for you. Save its recovery file; it opens your book.';
  else if (!createFirst) $('welcome-text').textContent = legacyEnvelope ?
    'Pick a 6-digit code to start your one book. Your older Business book can move in right after.' :
    'Pick a 6-digit code. You will use it to open your book on any device where you are logged in.';
  $('reload-vault').hidden = !host || state === 'loading';
  $('locked').hidden = state !== 'locked';
  // Locked: the code is the way in; the recovery file is the backup.
  const codeDoor = state === 'locked' && fits && !disabled && !recoveryOpen;
  $('unlock-code').hidden = !codeDoor;
  $('recovery-door').hidden = state !== 'locked' || codeDoor;
  $('use-recovery').hidden = state !== 'locked' || !fits || disabled;
  $('use-recovery').textContent = recoveryOpen ? 'Use my code instead' : 'Use recovery file';
  const left = fits ? codeState.attemptsLeft : CODE_ATTEMPTS;
  $('locked-heading').textContent = disabled ? 'Your code is turned off.' : codeDoor ? 'Enter your 6-digit code.' :
    fits ? 'Open your book with its recovery file.' : 'Open your book with its recovery file.';
  $('locked-text').textContent = disabled ? 'There were 10 wrong tries. Open your book with its recovery file, then pick a new code.' :
    codeDoor ? (left < CODE_ATTEMPTS ? `Type the code you picked for your book. ${left} ${left === 1 ? 'try' : 'tries'} left.` : 'Type the code you picked for your book.') :
    fits ? 'Choose the recovery file you saved when you made your book.' :
    codeState ? 'This one time, use the recovery file you saved. Then you can pick a 6-digit code.' :
    'Use the recovery file you saved when you made your book.';
  $('unlock-device').hidden = true;
  $('remember-device').hidden = true;
  $('forget-device').hidden = !unlocked || !device || !host?.storageIdentity;
  // A host without the code door keeps the old order: save the key, then the first write.
  $('creation').hidden = !(state === 'recovery' || unlocked && backupNotice);
  $('creation-heading').textContent = state === 'recovery' ? 'Keep the key to your book.' : 'Your book is ready.';
  $('creation-text').textContent = state === 'recovery' ?
    'Your browser has offered a recovery file. Save it somewhere safe: it is the key you will use to open this book again. It cannot be reset for you.' :
    'Your browser offered a recovery file. Keep it somewhere safe. If you ever forget your code, that file opens your book.';
  $('confirm-create').textContent = state === 'recovery' ? 'I saved my key, open my book' : 'Done';
  $('cancel-create').hidden = state !== 'recovery';
  const needsCode = unlocked && !!codeState && (!fits || disabled);
  $('code-setup').hidden = !(needsCode || unlocked && codeSetupOpen && !!codeState);
  $('cancel-code-setup').hidden = needsCode;
  $('code-setup-heading').textContent = needsCode && !disabled && !fits ? 'Pick a 6-digit code.' : 'Pick a new 6-digit code.';
  $('code-setup-text').textContent = disabled ? 'Your old code was turned off. A new code works right away.' :
    needsCode ? 'Next time, you open your book with this code instead of the file.' :
    'Your old code stops working once the new one is set.';
  $('change-code').hidden = !unlocked || !fits || disabled || codeSetupOpen;
  $('legacy-merge').hidden = !unlocked || !legacyEnvelope || hasMerged(doc, legacyEnvelope.vaultId);
  $('book').hidden = !unlocked;
  $('book-intro').hidden = unlocked;
  $('book-map').hidden = unlocked || !loaded || !!pendingCreation;
  if (!unlocked) {
    $('book-count').textContent = '';
    $('usage').textContent = '';
    renderLibrary();
    $('received').replaceChildren();
    $('share').hidden = true;
    $('share-preview').replaceChildren();
    $('share-fields').replaceChildren();
    return;
  }
  $('usage').textContent = `${doc.entries.length} records · ${(envelope.ciphertext.length*3/4/1024/1024).toFixed(2)} MiB encrypted · Recovery file ${recoverySaved ? 'download requested' : 'kept as your backup'}`;
  $('book-heading').textContent = 'Your book';
  const count = libraryEntries().length;
  $('book-count').textContent = count ? `${count} saved ${count === 1 ? 'item' : 'items'} · Only in your book until you share` : 'Your book is open. Add information to make it yours.';
  renderLibrary();
}
// Stays open on this device until Lock, Forget or a new login (a new login nonce).
async function keepOpen() {
  if (!device || !host?.storageIdentity || !key || !doc || !codeState?.loginNonce) return;
  try {
    await device.unlockDevice(host.storageIdentity);
    await device.remember(host.storageIdentity, BOOK_SCOPE, doc.vaultId, key, codeState.loginNonce);
  } catch { /* Device storage is optional; the code still works next time. */ }
}
// Someone who used "Remember this device" for an older Business book moves it in silently.
async function mergeFromDevice() {
  if (!key || !legacyEnvelope || hasMerged(doc, legacyEnvelope.vaultId) || !device || !host?.storageIdentity) return;
  try {
    const opened = await device.restoreLegacy(host.storageIdentity, LEGACY_SCOPE, legacyEnvelope);
    if (!opened || !key || hasMerged(doc, legacyEnvelope.vaultId)) return;
    await save(mergeLegacyBook(doc, opened.document));
    status('Your Business book moved in. Its items carry a Business label.');
  } catch { /* The recovery file can still move it in. */ }
}
function opened(result, message = 'Your book is open.') {
  key = result.key; doc = result.document;
  recoveryOpen = false;
  render(); status(message); revealBook();
}
const codeMessages = {
  wrong: n => `That code is not right. ${n} ${n === 1 ? 'try' : 'tries'} left.${n <= 3 ? ' After that, you will need your recovery file.' : ''}`,
  disabled: () => 'That was the 10th wrong try, so the code is turned off. Open your book with its recovery file, then pick a new code.',
  rate: () => 'Too many tries in a row. Wait a minute, then try again.',
  'no-code': () => 'This book has no code yet. Open it with its recovery file.',
  'no-book': () => 'There is no saved book yet.'
};
async function tryCode(value) {
  const pending = { envelope, generation: vaultGeneration };
  $('unlock-feedback').textContent = 'Checking your code…';
  unlockEntry.setDisabled(true);
  try {
    const fresh = await readCodeStatus(host);
    if (!fresh) throw Error('code-unavailable');
    codeState = fresh;
    const result = await unlockWithCode(host, pending.envelope, value, fresh);
    if (vaultGeneration !== pending.generation || envelope !== pending.envelope) throw Error('unlock-changed');
    unlockEntry.clear();
    if (!result.ok) {
      if (result.reason === 'wrong' || result.reason === 'disabled')
        codeState = { ...codeState, attemptsLeft: result.attemptsLeft, disabled: codeState.disabled || result.reason === 'disabled' };
      $('unlock-feedback').textContent = (codeMessages[result.reason] || codeMessages.wrong)(result.attemptsLeft);
      render(); unlockEntry.shake();
      return;
    }
    $('unlock-feedback').textContent = '';
    codeState = { ...codeState, attemptsLeft: CODE_ATTEMPTS, disabled: false };
    opened(result);
    await keepOpen();
    await mergeFromDevice();
  } finally { unlockEntry.setDisabled(false); if (!key) unlockEntry.focus(); }
}
async function createStep(value) {
  if (!createFirst) {
    createFirst = value; createEntry.clear();
    $('welcome-heading').textContent = 'Enter it again.';
    $('create-feedback').textContent = 'Type the same 6 digits again so we know you have it.';
    $('create-restart').hidden = false; createEntry.focus(); return;
  }
  const first = createFirst;
  createFirst = null; createEntry.clear();
  $('welcome-heading').textContent = 'Start your book.'; $('create-restart').hidden = true;
  if (value !== first) {
    $('create-feedback').textContent = 'Those codes did not match. Pick a 6-digit code again.';
    createEntry.shake(); createEntry.focus(); return;
  }
  await create(value);
}
async function setupStep(value) {
  if (!setupFirst) {
    setupFirst = value; setupEntry.clear();
    $('setup-feedback').textContent = 'Enter the same code again.';
    setupEntry.focus(); return;
  }
  const first = setupFirst;
  setupFirst = null; setupEntry.clear();
  if (value !== first) {
    $('setup-feedback').textContent = 'Those codes did not match. Pick a 6-digit code again.';
    setupEntry.shake(); setupEntry.focus(); return;
  }
  const generation = vaultGeneration;
  $('setup-feedback').textContent = 'Saving your code…';
  const result = await setBookCode(host, key, doc?.vaultId, value);
  if (generation !== vaultGeneration) throw Error('conflict');
  if (!result.ok) { $('setup-feedback').textContent = 'Your code could not be set. Try again.'; return; }
  codeState = result.status; codeSetupOpen = false;
  $('setup-feedback').textContent = '';
  await keepOpen();
  render(); status('Your code is set. Use it next time you open your book.');
}
async function create(value) {
  if (!loaded) throw Error('unavailable');
  if (envelope) throw Error('Already exists');
  clearRestore();
  const generation = vaultGeneration;
  $('create-feedback').textContent = 'Making your book…';
  const created = await createVault();
  // The code is stored first, so a failed save never leaves a book nobody can open.
  const set = await setBookCode(host, created.key, created.document.vaultId, value);
  if (!set.ok) throw Error('code-unavailable');
  if (generation !== vaultGeneration) throw Error('conflict');
  await persist(created.envelope);
  if (generation !== vaultGeneration) throw Error('conflict');
  envelope = created.envelope; codeState = set.status; backupNotice = true;
  $('create-feedback').textContent = '';
  download(await exportRecovery(created.key, created.document.vaultId), 'passport-recovery.json');
  recoverySaved = true;
  opened(created, 'Your book is ready. Save the recovery file your browser offered as a backup.');
  $('creation-heading').focus({ preventScroll: true });
  await keepOpen();
  await mergeFromDevice();
}
$('retry-recovery').addEventListener('click', () => run(async () => {
  if (!pendingCreation) return recovery();
  download(await exportRecovery(pendingCreation.key, pendingCreation.document.vaultId), 'passport-recovery.json');
  status('Recovery download requested. Confirm you saved it before the first hosted write.');
}));
$('confirm-create').addEventListener('click', () => run(async () => {
  if (!pendingCreation) { backupNotice = false; render(); revealBook(); return; }
  const generation = vaultGeneration, creation = pendingCreation;
  await persist(creation.envelope);
  if (generation !== vaultGeneration || creation !== pendingCreation) throw Error('conflict');
  envelope = creation.envelope; pendingCreation = null; recoverySaved = true;
  opened(creation, 'Passport created. Only its encrypted snapshot was saved to the host.');
}));
$('cancel-create').addEventListener('click', () => run(() => {
  pendingCreation = null; clearTransient(); render(); status('Creation canceled. No save was requested by canceling.');
}));
// A host without the code door still gets a book, opened by its recovery file.
$('create').addEventListener('click', () => run(async () => {
  if (!loaded || envelope || pendingCreation) throw Error('unavailable');
  clearRestore();
  pendingCreation = await createVault();
  download(await exportRecovery(pendingCreation.key, pendingCreation.document.vaultId), 'passport-recovery.json');
  render();
  status('Recovery download requested. Confirm you saved it before the first hosted write.');
  $('creation-heading').focus({ preventScroll: true });
  $('creation').scrollIntoView({ block: 'start', behavior: 'instant' });
}));
$('create-restart').addEventListener('click', () => {
  createFirst = null; createEntry.clear(); $('create-restart').hidden = true;
  $('welcome-heading').textContent = 'Start your book.'; $('create-feedback').textContent = ''; createEntry.focus();
});
$('use-recovery').addEventListener('click', () => { recoveryOpen = !recoveryOpen; render(); if (!recoveryOpen) unlockEntry.focus(); });
$('change-code').addEventListener('click', () => {
  codeSetupOpen = true; setupFirst = null; setupEntry.clear(); $('setup-feedback').textContent = ''; render();
  $('code-setup-heading').focus({ preventScroll: true }); $('code-setup').scrollIntoView({ block: 'start', behavior: 'instant' });
});
$('cancel-code-setup').addEventListener('click', () => { codeSetupOpen = false; setupFirst = null; setupEntry.clear(); render(); });
async function recovery() {
  download(await exportRecovery(key, doc.vaultId), 'passport-recovery.json');
  recoverySaved = true;
  render();
  status(
    'Recovery-file download requested. Keep it safe and separate from your encrypted backups.');
}

function lock() {
  vaultGeneration++;
  clearTransient();
  key = null;
  doc = null;
  sharing = null;
  receivedEnvelope = null;
  receivedRecovery = null;
  document.querySelectorAll('form').forEach(f => f.reset());
  document.querySelectorAll('input[type=file]').forEach(f => f.value = '');
  codeSetupOpen = false; setupFirst = null; backupNotice = false; recoveryOpen = false;
  setupEntry?.clear(); unlockEntry?.clear();
  render();
  status(codeFits(codeState, envelope) && !codeState.disabled ? 'Your book is locked. Enter your code to open it.' :
    'Your book is locked. Use its recovery file to open it.');
}
async function lockEverywhere() {
  lock();
  try {if(device&&host?.storageIdentity)await device.lock(host.storageIdentity);}
  finally {lockSignal?.broadcast();}
}
function clearRestore() {
  pendingRestore = null;
  $('restore-pending').hidden = true;
  for (const id of ['restore', 'restore-open', 'restore-recovery']) $(id).value = '';
}
async function restore(file) {
  if (!file) return;
  if (!loaded) throw Error('unavailable');
  clearRestore();
  const before = { scope, etag, envelope, generation:vaultGeneration };
  const candidate = await jsonFile(file);
  if (!candidate || candidate.format !== 'passport-vault-v1') throw Error('Not a backup');
  if (scope !== before.scope || etag !== before.etag || envelope !== before.envelope ||
      vaultGeneration!==before.generation) throw Error('conflict');
  pendingRestore = { ...before, candidate };
  $('restore-pending').hidden = false;
  status('Backup selected. Choose its recovery file below.');
  $('restore-heading').focus({ preventScroll: true });
  $('restore-pending').scrollIntoView({ block: 'start', behavior: 'instant' });
}
$('cancel-restore').addEventListener('click', () => run(() => {
  clearRestore();
  status('Restore canceled. Your saved book has not changed.');
}));
$('restore-recovery').addEventListener('change', event => run(async () => {
  const pending = pendingRestore, file = event.target.files[0];
  event.target.value = '';
  if (!pending || !file) return;
  const unchanged = () => pendingRestore === pending && scope === pending.scope && etag === pending.etag &&
    envelope === pending.envelope && vaultGeneration===pending.generation;
  const recovered = await unlockVault(pending.candidate, await jsonFile(file));
  if (!unchanged()) throw Error('conflict');
  if (envelope && !await ask('Replace this hosted vault with this backup? Export your current backup first if needed.')) {
    clearRestore(); status('Restore canceled. Your saved book has not changed.'); return;
  }
  if (!unchanged()) throw Error('conflict');
  const result = await host.request('save', BOOK_SCOPE, { envelope: pending.candidate, expectedEtag: pending.etag });
  if (!unchanged()) throw Error('conflict');
  etag = result.etag;
  envelope = pending.candidate;
  key = recovered.key;
  doc = recovered.document;
  recoverySaved = true;
  clearTransient(); render();
  status('Backup restored and unlocked.'); revealBook();
}));

function startShare(id, v) {
  invalidateShare();
  sharing = {
    entryId: id,
    version: v.version
  };
  $('share-fields').replaceChildren();
  $('share-preview').replaceChildren();
  $('share-form').reset();
  for (const name of [...Object.keys(v.fields), '$title', '$tags', ...(v.files.length ? ['$files'] :
      [])]) {
    const l = node('label');
    const c = node('input');
    c.type = 'checkbox';
    c.name = 'field';
    c.value = name;
    l.append(c, document.createTextNode(' ' + ({
      '$title': 'Title',
      '$tags': 'Labels',
      '$files': 'Attached files'
    } [name] || name)));
    $('share-fields').append(l);
  }
  $('share').hidden = false;
  $('share').scrollIntoView({
    behavior: 'instant'
  });
}
$('recovery').addEventListener('click', () => run(recovery));
$('backup').addEventListener('click', () => run(() => download(envelope,
  'passport-encrypted-backup.json')));
$('lock').addEventListener('click', () => run(async () => {
  if (!recoverySaved && !codeFits(codeState, envelope) && !await ask(
      'You have no code and no saved recovery file yet. If you lock now, you may not get back in. Lock anyway?')) return;
  await lockEverywhere();
}));
$('remember-device').addEventListener('click',()=>run(async()=>{
  if (!key || !doc || !device || !host?.storageIdentity) throw Error('unavailable');
  await keepOpen();
  status('Your book stays open on this device until you lock it or log out.');
}));
$('forget-device').addEventListener('click',()=>run(async()=>{
  if (!device || !host?.storageIdentity) throw Error('unavailable');
  lock();
  try {await device.forget(host.storageIdentity);}
  finally {lockSignal?.broadcast();}
  status('This device forgot your book. Enter your code to open it again.');
}));
$('unlock-device').addEventListener('click',()=>run(async()=>{
  if (!device || !host?.storageIdentity) throw Error('unavailable');
  await device.unlockDevice(host.storageIdentity);
  await reloadVault();
}));
$('unlock').addEventListener('change', e => {
  const file = e.target.files[0];
  // Clear every selection so the same file can be chosen after a failed attempt.
  e.target.value = '';
  if (!file) return;
  void run(async () => {
    const pending = { envelope, etag, generation:vaultGeneration };
    const parsed = await readRecoveryFile(file);
    if (!parsed.ok) throw Error(parsed.reason === 'backup-file' ? 'unlock-backup' : 'unlock-file');
    const recovery = parsed.recovery;
    if (legacyEnvelope && recovery.vaultId === legacyEnvelope.vaultId) throw Error('unlock-legacy');
    if (recovery.vaultId !== pending.envelope?.vaultId) throw Error('unlock-wrong-book');
    let result;
    try { result = await unlockVault(pending.envelope, recovery); } catch { throw Error('unlock-failed'); }
    if (envelope !== pending.envelope || etag !== pending.etag ||
        vaultGeneration!==pending.generation) throw Error('unlock-changed');
    recoverySaved = true;
    codeState = await readCodeStatus(host).catch(() => null) || codeState;
    opened(result, codeFits(codeState, envelope) && !codeState.disabled ? 'Your book is open.' :
      'Your book is open. Pick a 6-digit code below so next time is quicker.');
    await keepOpen();
    await mergeFromDevice();
  });
});
$('legacy-recovery').addEventListener('change', e => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  void run(async () => {
    const parsed = await readRecoveryFile(file);
    if (!parsed.ok) throw Error(parsed.reason === 'backup-file' ? 'unlock-backup' : 'unlock-file');
    if (!key || !legacyEnvelope || parsed.recovery.vaultId !== legacyEnvelope.vaultId) throw Error('merge-wrong-book');
    const pending = { generation: vaultGeneration, legacy: legacyEnvelope };
    let legacy;
    try { legacy = await unlockVault(pending.legacy, parsed.recovery); } catch { throw Error('unlock-failed'); }
    if (vaultGeneration !== pending.generation || legacyEnvelope !== pending.legacy) throw Error('unlock-changed');
    if (hasMerged(doc, legacy.document.vaultId)) return;
    await save(mergeLegacyBook(doc, legacy.document));
    status('Your Business book moved in. Its items carry a Business label. The old copy was not deleted.');
  });
});
for (const id of ['restore', 'restore-open']) $(id).addEventListener('change', e => run(() =>
  restore(e.target.files[0])));
$('entry-form').addEventListener('submit', e => {
  e.preventDefault();
  run(async () => {
    const f = new FormData(e.target);
    await save(addEntry(doc, {
      kind: 'note',
      title: f.get('title'),
      fields: {
        content: f.get('content')
      },
      tags: f.get('tag') ? [f.get('tag')] : [],
      files: []
    }));
    e.target.reset();
  });
});
function answerContext() {
  const f = $('question-form').elements;
  return { label: f.tag.value, subject: f.subject.value, scope: f.scope.value,
    taskId: f.taskId.value };
}

function suggestAnswers() {
  const form = $('question-form'), context = answerContext();
  const signature = JSON.stringify(context);
  if (filledAnswer && filledAnswer.signature !== signature) {
    if (form.elements.answer.value === filledAnswer.answer) form.elements.answer.value = '';
    filledAnswer = null;
    $('answer-source').textContent = '';
  }
  $('task-reference').hidden = context.scope !== 'task';
  const container = $('answer-suggestions');
  if (renderedAnswerSignature === signature) return;
  renderedAnswerSignature = signature;
  container.replaceChildren();
  const candidates = key ? findAnswerCandidates(doc, context) : [];
  container.hidden = !candidates.length;
  if (!candidates.length) return;
  container.append(node('h3', 'Use a saved answer'), node('p',
    'Review an answer, then use it to fill this form privately.'));
  for (const candidate of candidates) {
    const { provenance: p, reviewReasons } = candidate;
    const card = node('article', undefined, 'record');
    const source = `${p.question} · Version ${p.version} · ${new Date(p.createdAt).toLocaleDateString()}`;
    card.append(node('p', source, 'muted'), node('p', candidate.answer));
    if (reviewReasons.length) card.append(node('p', reviewReasons.map(reason => ({
      dated: 'Saved more than 180 days ago: check that it is still current.',
      'future-date': 'Saved date is in the future: check this answer.',
      'multiple-candidates': 'Several answers match: choose the one that applies.'
    }[reason])).join(' '), 'notice'));
    card.append(button('Use this answer', () => {
      // Recheck context when used; a suggestion never authorizes a release.
      if (JSON.stringify(answerContext()) !== signature) return;
      form.elements.answer.value = candidate.answer;
      filledAnswer = { signature, answer: candidate.answer,
        reusedFrom: { entryId: p.entryId, version: p.version } };
      $('answer-source').textContent = `Filled from ${source}. Review before saving.`;
    }));
    container.append(card);
  }
}
for (const event of ['input', 'change']) $('question-form').addEventListener(event, e => {
  if (e.target.name === 'answer' && filledAnswer && e.target.value !== filledAnswer.answer) {
    filledAnswer = null;
    $('answer-source').textContent = '';
  }
  if (['tag', 'subject', 'scope', 'taskId'].includes(e.target.name)) suggestAnswers();
});
$('question-form').addEventListener('submit', e => {
  e.preventDefault();
  run(async () => {
    const f = new FormData(e.target);
    await save(addEntry(doc, {
      kind: 'answer',
      title: f.get('question'),
      fields: {
        question: f.get('question'),
        answer: f.get('answer'),
        subject: f.get('subject'),
        scope: f.get('scope'),
        label: f.get('tag'),
        ...(filledAnswer && filledAnswer.signature === JSON.stringify(answerContext()) &&
          filledAnswer.answer === f.get('answer') ? { reusedFrom: filledAnswer.reusedFrom } : {}),
        ...(f.get('scope') === 'task' && f.get('taskId') ? { taskId: f.get('taskId') } : {})
      },
      tags: f.get('tag') ? [f.get('tag')] : [],
      files: await filesValue(e.target.elements.files.files)
    }));
    e.target.reset();
  });
});
$('upload').addEventListener('change', e => run(async () => {
  const files = await filesValue(e.target.files);
  let next = doc;
  for (const f of files) next = addEntry(next, {
    kind: 'file',
    title: f.name,
    fields: {},
    tags: [],
    files: [f]
  });
  await save(next);
  e.target.value = '';
}));
for (const event of ['input', 'change']) $('share-form').addEventListener(event, invalidateShare);
$('cancel-share').addEventListener('click', () => {
  invalidateShare();
  $('share').hidden = true;
  $('share-preview').replaceChildren();
  sharing = null;
});
$('share-form').addEventListener('submit', e => {
  e.preventDefault();
  run(async () => {
    if (!sharing) throw Error('No selection');
    const generation = ++shareGeneration;
    const f = new FormData(e.target),
      fields = f.getAll('field');
    if (!fields.length) {
      status('Choose at least one field to share.');
      return;
    }
    const selected = selectRelease(doc, {
      ...sharing,
      fields,
      recipient: f.get('recipient'),
      purpose: f.get('purpose')
    });
    const preview = $('share-preview');
    preview.replaceChildren(node('h3', 'Exactly what this package contains'), node('pre',
      JSON.stringify(selected, null, 2)));
    const bundle = await encryptRelease(selected);
    if (generation !== shareGeneration) return;
    preview.append(button('Download encrypted package', () => download(bundle.envelope,
      'passport-shared-package.json')), button('Download separate package key', () =>
      download(bundle.recovery, 'passport-shared-key.json')));
  });
});
$('receive').addEventListener('change', e => run(async () => {
  receivedEnvelope = null;
  $('received').replaceChildren();
  receivedEnvelope = await jsonFile(e.target.files[0]);
  status('Shared package selected. Choose its separate key.');
}));
$('receive-key').addEventListener('change', e => run(async () => {
  receivedRecovery = null;
  $('received').replaceChildren();
  receivedRecovery = await jsonFile(e.target.files[0]);
  status('Package key selected. Preview to decrypt locally.');
}));
$('open-release').addEventListener('click', () => run(async () => {
  const r = await decryptRelease(receivedEnvelope, receivedRecovery);
  $('received').replaceChildren(node('pre', JSON.stringify(r, null, 2)), button(
    'Save received information privately', async () => {
      await save(addEntry(doc, {
        kind: 'received',
        title: r.title || 'Received information',
        fields: {
          receivedFields: r.fields,
          provenance: {
            recipient: r.recipient,
            purpose: r.purpose
          }
        },
        tags: r.tags || [],
        files: r.files || []
      }));
      $('received').replaceChildren(node('p', 'Saved in your vault.'));
    }));
}));
$('delete-vault').addEventListener('click', () => run(async () => {
  if (!await ask(
      'Remove this vault from hosted storage? You need an exported backup and recovery file to restore it. Downloaded and shared copies are unaffected.'
      )) return;
  await persist(null);
  envelope = null;
  await lockEverywhere();
  status('Hosted vault removed. Existing backups, downloads and shared copies remain.');
}));
async function reloadVault() {
  loaded = false; loadFailed = false; lock(); envelope = null; etag = null; legacyEnvelope = null; render();
  const generation=vaultGeneration;
  status('Finding your saved book…');
  let saved, fresh, legacy;
  // The book first; the code door and the older Business book never delay or replace it.
  try { saved = await readSaved(); [fresh, legacy] = await Promise.all([readCodeStatus(host).catch(() => null), readLegacy()]); }
  catch (error) { if (vaultGeneration===generation) {loadFailed = true; render();} throw error; }
  if (vaultGeneration!==generation) return;
  envelope=saved.envelope; etag=saved.etag; codeState=fresh; legacyEnvelope=legacy;
  loaded = true;
  if (envelope && device && host?.storageIdentity && codeState?.loginNonce) {
    try {
      const opened=await device.restore(host.storageIdentity,BOOK_SCOPE,envelope,codeState.loginNonce);
      if (vaultGeneration!==generation) return;
      if (opened) {key=opened.key;doc=opened.document;}
    } catch { /* The code and recovery file remain available after storage loss or an invalid wrapper. */ }
  }
  if (vaultGeneration!==generation) return;
  render();
  status('');
  if (key) await mergeFromDevice();
  else if (!$('locked').hidden && !$('unlock-code').hidden) unlockEntry.focus();
}
$('reload-vault').addEventListener('click', () => run(async () => {
  if (await ask('Reload and lock this vault? Any unsaved form input will be cleared.')) await reloadVault();
}));
// Sandbox intentionally has no allow-forms. Dispatch local form actions without navigation.
for (const form of document.querySelectorAll('form')) {
  const submit = () => { if (!busy && form.reportValidity()) form.dispatchEvent(new Event('submit', { cancelable: true })); };
  for (const b of form.querySelectorAll('button:not([type]),button[type="submit"]')) {
    b.type = 'button'; b.addEventListener('click', submit);
  }
  form.addEventListener('keydown', e => {
    if (e.key === 'Enter' && e.target.tagName === 'INPUT') { e.preventDefault(); submit(); }
  });
}
unlockEntry = mountCodeEntry($('unlock-code'), { label: 'Your 6-digit code', onComplete: code => run(() => tryCode(code)) });
createEntry = mountCodeEntry($('create-code'), { label: 'Pick a 6-digit code', onComplete: code => run(() => createStep(code)) });
setupEntry = mountCodeEntry($('setup-code'), { label: 'Pick a 6-digit code', onComplete: code => run(() => setupStep(code)) });
render();
await run(async () => {
  try { host = await connectHost(window,{expectedOrigins:ALLOWED_PARENT_ORIGINS}); }
  catch (error) { loadFailed = true; render(); throw error; }
  scope = host.scope;
  if (host.storageIdentity) {
    try {device=createDeviceMemory(indexedDbDeviceStorage());} catch {device=null;}
    lockSignal=createOwnerLockChannel(host.storageIdentity,()=>lock());
    window.addEventListener('pagehide',()=>lockSignal.close(),{once:true});
  }
  host.setControlHandler(async(command,panel)=>{
    if (command==='lock-all') {await lockEverywhere();return true;}
    if (command!=='open-panel'||!key)return false;
    const target=panel==='information'?$('information-chapter'):
      panel==='goals'?$('panel-goals'):panel==='sharing'&&!$('share').hidden?$('share'):null;
    if (!target||target.hidden)return false;
    target.focus?.({preventScroll:true});target.scrollIntoView({block:'start',behavior:'instant'});
    return true;
  });
  host.onUnauthorized?.(() => lock());
  await reloadVault();
});

// The optional question channel is independent of ciphertext storage and does not delay opening a book.
void connectQuestionHost(window,{expectedOrigins:ALLOWED_PARENT_ORIGINS}).then(channel => {
  if (!channel) return;
  questionPanel = mountQuestionAnswer($('agent-question'), channel, {
    state: () => ({ document: key ? doc : null, scope }), save, run
  });
  questionPanel.refresh();
}).catch(() => {});

// Batch release is optional and never exposes private drafts through the storage bridge.
void connectBatchHost(window,{expectedOrigins:ALLOWED_PARENT_ORIGINS}).then(channel => {
  if (!channel) return;
  batchPanel = mountQuestionBatch($('agent-question-batch'), channel, {
    state: () => ({ document: key ? doc : null, scope }), save, run, filesValue
  });
  batchPanel.refresh();
}).catch(() => {});

// Optional item copies have their own approval channel; storage stays ciphertext-only.
void connectItemHost(window,{expectedOrigins:ALLOWED_PARENT_ORIGINS}).then(channel => {
  if (!channel) return;
  itemPanel = mountItemPicker($('item-sharing'), channel, {
    state: () => ({document: key ? doc : null, scope}), save, run, filesValue
  });
  itemPanel.refresh();
}).catch(() => {});
