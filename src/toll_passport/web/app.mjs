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
const $ = id => document.getElementById(id);
let key, doc, envelope, database, sharing, receivedEnvelope, receivedRecovery, busy = false,
  recoverySaved = false,
  shareGeneration = 0,
  filledAnswer = null;
const MAX_FILE = 25 * 1024 * 1024,
  MAX_IMPORT = 145 * 1024 * 1024;
const channel = typeof BroadcastChannel === 'function' ? new BroadcastChannel('passport-local-v1') :
  null;

function invalidateShare() {
  shareGeneration++;
  $('share-preview').replaceChildren();
}

function clearTransient() {
  invalidateShare();
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
async function run(fn) {
  if (busy) return;
  busy = true;
  document.querySelectorAll('button,input[type=file]').forEach(b => b.disabled = true);
  try {
    await fn();
  } catch (err) {
    status(
      'Could not complete this action. Check the file, available space and recovery key. Your previous saved vault is unchanged.'
      );
    console.error('Passport operation failed:', err?.name || 'Error');
  } finally {
    busy = false;
    document.querySelectorAll('button,input[type=file]').forEach(b => b.disabled = false);
  }
}

function openDB() {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open('passport-local-v1', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('vault');
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

function readSaved() {
  return new Promise((resolve, reject) => {
    const tx = database.transaction('vault');
    const r = tx.objectStore('vault').get('active');
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

function persist(next, expected) {
  return new Promise((resolve, reject) => {
    const tx = database.transaction('vault', 'readwrite'),
      s = tx.objectStore('vault'),
      r = s.get('active');
    let conflict = false;
    r.onsuccess = () => {
      const old = r.result;
      if ((old?.vaultId || null) !== (expected?.vaultId || null) || (old?.revision ??
        null) !== (expected?.revision ?? null) || (old?.ciphertext || null) !== (expected
          ?.ciphertext || null)) {
        conflict = true;
        tx.abort();
        return;
      }
      if (next) s.put(next, 'active');
      else s.delete('active');
    };
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(new Error(conflict ? 'Conflicting change' : 'Storage aborted'));
  });
}
async function save(next) {
  const sealed = await sealVault(next, key);
  await persist(sealed, envelope);
  doc = next;
  envelope = sealed;
  clearTransient();
  channel?.postMessage({
    changed: true
  });
  render();
  status('Saved privately in this browser. Export a backup to preserve these changes.');
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

function render() {
  const unlocked = !!key;
  $('welcome').hidden = !!envelope;
  $('locked').hidden = !envelope || unlocked;
  $('book').hidden = !unlocked;
  if (!unlocked) {
    $('entries').replaceChildren();
    $('received').replaceChildren();
    $('share').hidden = true;
    $('share-preview').replaceChildren();
    $('share-fields').replaceChildren();
    return;
  }
  $('usage').textContent =
    `${doc.entries.length} records · ${(envelope.ciphertext.length*3/4/1024/1024).toFixed(2)} MiB encrypted · Recovery file ${recoverySaved?'download requested':'needed for future unlocking'}`;
  const list = $('entries');
  list.replaceChildren();
  if (!doc.entries.length) list.append(node('p',
    'Your book is ready. Add information, an answer or files.', 'muted'));
  for (const entry of doc.entries) {
    const v = entry.versions.at(-1),
      card = node('article', undefined, 'record');
    card.append(node('h3', v.title), node('p',
      `Version ${v.version} · ${new Date(v.createdAt).toLocaleDateString()}`, 'muted'));
    for (const t of v.tags || []) card.append(node('span', t, 'tag'));
    for (const [field, value] of Object.entries(v.fields)) {
      card.append(node('p', `${field}: ${typeof value==='string'?value:JSON.stringify(value)}`));
    }
    for (const f of v.files || []) card.append(button(`Download ${f.name}`, () => downloadFile(f)));
    card.append(button('Choose what to share', () => startShare(entry.id, v)), button('Remove',
      async () => {
        if (confirm(
            'Remove this record and its versions from this browser vault? Existing exports and shared copies remain.'
            )) await save(removeEntry(doc, entry.id));
      }, 'danger'));
    list.append(card);
  }
}
async function create() {
  if (envelope) throw Error('Already exists');
  const made = await createVault();
  await persist(made.envelope, null);
  key = made.key;
  doc = made.document;
  envelope = made.envelope;
  recoverySaved = false;
  channel?.postMessage({
    changed: true
  });
  render();
  status(
    'Passport created. Save your recovery file now; it is needed after locking or reopening.');
  await recovery();
}
async function recovery() {
  download(await exportRecovery(key, doc.vaultId), 'passport-recovery.json');
  recoverySaved = true;
  render();
  status(
    'Recovery-file download requested. Keep it safe and separate from your encrypted backups.');
}

function lock() {
  clearTransient();
  key = null;
  doc = null;
  sharing = null;
  receivedEnvelope = null;
  receivedRecovery = null;
  document.querySelectorAll('form').forEach(f => f.reset());
  document.querySelectorAll('input[type=file]').forEach(f => f.value = '');
  render();
  status('Locked. Choose the recovery file to unlock again.');
}
async function restore(file) {
  const candidate = await jsonFile(file);
  if (!candidate || candidate.format !== 'passport-vault-v1') throw Error('Not a backup');
  const picker = document.createElement('input');
  picker.type = 'file';
  picker.accept = '.json,application/json';
  picker.addEventListener('change', () => run(async () => {
    const recovered = await unlockVault(candidate, await jsonFile(picker.files[0]));
    if (envelope && !confirm(
        'Replace this browser’s saved vault with this backup? Export your current backup first if needed.'
        )) return;
    await persist(candidate, envelope);
    envelope = candidate;
    key = recovered.key;
    doc = recovered.document;
    recoverySaved = true;
    clearTransient();
    channel?.postMessage({
      changed: true
    });
    render();
    status('Backup restored and unlocked.');
  }), {
    once: true
  });
  status('Now choose the recovery file for this backup.');
  picker.click();
}

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
    behavior: 'smooth'
  });
}
$('create').addEventListener('click', () => run(create));
$('recovery').addEventListener('click', () => run(recovery));
$('backup').addEventListener('click', () => run(() => download(envelope,
  'passport-encrypted-backup.json')));
$('lock').addEventListener('click', () => run(() => {
  if (!recoverySaved && !confirm(
      'Without a recovery file you cannot unlock this vault. Lock anyway?')) return;
  lock();
}));
$('unlock').addEventListener('change', e => run(async () => {
  const result = await unlockVault(envelope, await jsonFile(e.target.files[0]));
  key = result.key;
  doc = result.document;
  recoverySaved = true;
  e.target.value = '';
  render();
  status('Unlocked locally.');
}));
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
  if (!confirm(
      'Remove this vault from browser storage? You need an exported backup and recovery file to restore it. Downloaded and shared copies are unaffected.'
      )) return;
  await persist(null, envelope);
  envelope = null;
  lock();
  channel?.postMessage({
    changed: true
  });
  status('Vault removed from this browser.');
}));
channel?.addEventListener('message', () => {
  if (busy) return;
  run(async () => {
    const saved = await readSaved();
    if (saved?.ciphertext !== envelope?.ciphertext) {
      envelope = saved;
      lock();
      status(
        'The saved vault changed in another tab. Unlock its latest version to continue.'
        );
    }
  });
});
await run(async () => {
  database = await openDB();
  envelope = await readSaved();
  render();
  status(envelope ?
    'Your encrypted vault is saved here. Choose its recovery file to unlock.' :
    'Create a private book or restore an encrypted backup.');
});
