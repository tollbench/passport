// Copyright 2026 Steven Ochs and Tollbench. SPDX-License-Identifier: Apache-2.0
import {
  addEntry
} from './vault.mjs';
import {
  snapshotItems,
  manifestDigest,
  canonical,
  collectionMembers,
  makeCollection,
  fileSize,
  shareField
} from './item-selection.mjs';
const clone = v => JSON.parse(JSON.stringify(v));
const binding = c => canonical({
  requestId: c.requestId,
  scope: c.scope,
  recipient: c.recipient,
  accessScope: c.accessScope,
  purpose: c.purpose,
  grantExpiresAt: c.grantExpiresAt
});
export class ItemShareSession {
  constructor(channel, {
    state,
    save
  }) {
    this.channel = channel;
    this.contextSignature = canonical(channel.context);
    this.state = state;
    this.save = save;
    this.generation = 0;
    this.prepared = null;
  }
  current() {
    const s = this.state();
    if (canonical(this.channel.context) !== this.contextSignature || !s.document || s.scope !==
      this.channel.context.scope) throw Error('conflict');
    return s.document;
  }
  clear() {
    this.generation++;
    this.prepared = null;
  }
  async preview(selections) {
    const doc = this.current(),
      items = snapshotItems(doc, selections, this.channel.context.limits),
      digest = await manifestDigest(items);
    if (this.current() !== doc) throw Error('conflict');
    return {
      items,
      digest,
      selections: clone(selections),
      vaultId: doc.vaultId,
      revision: doc.revision,
      approvalId: crypto.randomUUID()
    };
  }
  restore() {
    const doc = this.current(),
      matches = doc.entries.filter(e => {
        const v = e.versions.at(-1);
        return v.kind === 'passport.share-intent' && v.fields.binding === binding(this.channel
          .context) && !v.fields.receipt;
      });
    if (matches.length !== 1) return null;
    const e = matches[0],
      f = e.versions.at(-1).fields;
    let items;
    try {
      items = snapshotItems(doc, f.preview.selections, this.channel.context.limits);
      if (items.length !== f.preview.memberIds.length) return null;
      items.forEach((item, index) => item.id = f.preview.memberIds[index]);
    } catch {
      return null;
    }
    return {
      ...clone(f.preview),
      items,
      vaultId: doc.vaultId,
      revision: doc.revision,
      intentId: e.id
    };
  }
  async approve(preview) {
    const doc = this.current(),
      generation = this.generation,
      c = this.channel.context;
    if (doc.vaultId !== preview.vaultId || doc.revision !== preview.revision ||
      await manifestDigest(preview.items) !== preview.digest) throw Error('conflict');
    // Recompute selected source bytes; the approved member identifiers are opaque and stable for retries.
    const selected = snapshotItems(doc, preview.selections, c.limits);
    if (canonical(selected.map(({
        id,
        ...v
      }) => v)) !== canonical(preview.items.map(({
        id,
        ...v
      }) => v))) throw Error('conflict');
    if (Date.now() >= c.expiresAt || Date.now() >= c.grantExpiresAt) throw Error('expired');
    const next = addEntry(doc, {
      ...(preview.intentId ? {
        id: preview.intentId
      } : {}),
      kind: 'passport.share-intent',
      title: c.purpose,
      fields: {
        binding: binding(c),
        context: {
          scope: c.scope,
          recipient: c.recipient,
          accessScope: c.accessScope,
          purpose: c.purpose,
          grantExpiresAt: c.grantExpiresAt
        },
        preview: {
          approvalId: preview.approvalId,
          selections: clone(preview.selections),
          memberIds: preview.items.map(item => item.id),
          digest: preview.digest
        }
      }
    });
    await this.save(next);
    if (generation !== this.generation || this.current() !== next) throw Error('conflict');
    this.prepared = {
      preview,
      intentId: preview.intentId || next.entries.at(-1).id,
      revision: next.revision,
      vaultId: next.vaultId,
      attempted: false
    };
    return this.send();
  }
  async send() {
    const p = this.prepared,
      doc = this.current(),
      generation = this.generation;
    if (!p || doc.vaultId !== p.vaultId || doc.revision !== p.revision) throw Error('conflict');
    p.attempted = true;
    const result = p.receipt || await this.channel.release({
      approvalId: p.preview.approvalId,
      savedRevision: p.revision,
      manifestDigest: p.preview.digest,
      items: p.preview.items
    });
    if (generation !== this.generation || this.current() !== doc) throw Error('conflict');
    p.receipt = result;
    const entry = doc.entries.find(e => e.id === p.intentId),
      v = entry.versions.at(-1);
    try {
      const next = addEntry(doc, {
        id: entry.id,
        kind: v.kind,
        title: v.title,
        fields: {
          ...v.fields,
          receipt: {
            grantId: result.grantId,
            receiptId: result.receiptId
          }
        }
      });
      await this.save(next);
      if (generation !== this.generation || this.current() !== next) throw Error('conflict');
      p.revision = next.revision;
      return {
        ...result,
        privateReceiptSaved: true
      };
    } catch {
      return {
        ...result,
        privateReceiptSaved: false
      };
    }
  }
}
const node = (tag, text) => {
  const e = document.createElement(tag);
  if (text !== undefined) e.textContent = text;
  return e;
};
export function mountItemPicker(root, channel, {
  state,
  save,
  run,
  filesValue
}) {
  const c = channel.context,
    session = new ItemShareSession(channel, {
      state,
      save
    });
  let signature = null,
    rows = [],
    preview = null,
    busy = false;
  const heading = node('h2', 'Choose information to share');
  heading.tabIndex = -1;
  const notice = node('p', `${c.recipient.name} · ${c.accessScope.label}`),
    purpose = node('p', c.purpose),
    privacy = node('p',
      `Approved copies can be read by this host and ${c.recipient.name}. Access expires ${new Date(c.grantExpiresAt).toLocaleString()}. Stop sharing can block future reads, but cannot erase copies already downloaded.`
    ),
    status = node('p'),
    body = node('div'),
    review = node('section');
  status.setAttribute('role', 'status');
  root.replaceChildren(heading, notice, purpose, privacy, status, body, review);
  const approve = node('button', `Approve sharing with ${c.recipient.name}`),
    choose = node('button', 'Preview selected information');
  choose.className = 'secondary';

  function clearReview() {
    preview = null;
    review.replaceChildren();
  }

  function selected() {
    return rows.filter(r => r.check.checked).map(r => ({
      entryId: r.id,
      version: r.version,
      fields: r.fields.filter(x => x.input.checked).map(x => x.key),
      files: r.files.filter(x => x.input.checked).map(x => x.index)
    }));
  }

  function showPreview(value) {
    preview = value;
    review.replaceChildren(node('h3', 'Exactly what will be shared'),
      node('p', `${c.recipient.name} · ${c.accessScope.label}`),
      node('p', `${c.purpose}. Access until ${new Date(c.grantExpiresAt).toLocaleString()}.`));
    for (const i of value.items) {
      review.append(node('h4', `${i.title} · Version ${i.sourceVersion}`));
      const entries = Object.entries(i.fields);
      for (const [label, value] of entries) {
        if (entries.length > 1) review.append(node('strong', label));
        const content = node('p', value);
        content.className = 'item-preview-text';
        review.append(content);
      }
      for (const f of i.files) review.append(node('p',
        `${f.name} · ${fileSize(f)} bytes · ${f.type}`));
    }
    review.append(approve);
    review.scrollIntoView({
      block: 'start'
    });
    approve.focus();
  }

  function build(doc) {
    body.replaceChildren();
    rows = [];
    clearReview();
    const list = node('div');
    list.className = 'item-picker-list';
    for (const e of doc.entries) {
      const v = e.versions.at(-1);
      if (!['note', 'file'].includes(v.kind)) continue;
      const box = node('fieldset'),
        legend = node('legend'),
        check = node('input');
      check.type = 'checkbox';
      legend.append(check, document.createTextNode(` ${v.title} · Version ${v.version}`));
      box.append(legend);
      const row = {
        id: e.id,
        version: v.version,
        check,
        fields: [],
        files: [],
        box
      };
      for (const key of Object.keys(v.fields).filter(k => !['source', 'classification', 'subject',
          'taskId', 'reusedFrom', '__proto__', 'constructor', 'prototype'
        ].includes(k))) {
        const label = node('label'),
          input = node('input');
        input.type = 'checkbox';
        input.disabled = !shareField(key, v.fields[key]);
        label.append(input, document.createTextNode(
          ` ${key}${input.disabled?' · stays private: structured or unsupported field':''}`));
        box.append(label);
        row.fields.push({
          key,
          input
        });
      }
      v.files.forEach((f, index) => {
        const label = node('label'),
          input = node('input'),
          size = fileSize(f);
        input.type = 'checkbox';
        input.disabled = size === null || size > c.limits.maxFileBytes;
        label.append(input, document.createTextNode(
          ` ${f.name}${input.disabled?' · stays private: exceeds sharing size or filename limits':''}`
        ));
        box.append(label);
        row.files.push({
          index,
          input
        });
      });
      box.addEventListener('change', clearReview);
      rows.push(row);
      list.append(box);
    }
    body.append(list);
    const folders = node('div');
    for (const e of doc.entries) {
      const v = e.versions.at(-1);
      if (v.kind !== 'passport.collection') continue;
      const button = node('button', `Select folder: ${v.title}`);
      button.className = 'secondary';
      button.addEventListener('click', () => run(async () => {
        const refs = collectionMembers(state().document, e.id, v.version);
        for (const row of rows) {
          if (row.pinned) row.box.remove();
          else {
            row.check.checked = false;
            row.check.disabled = false;
          }
        }
        rows = rows.filter(row => !row.pinned);
        for (const r of refs) {
          let row = rows.find(x => x.id === r.entryId && x.version === r.version);
          if (!row) {
            status.textContent =
              'This folder pins an older version. Its files remain private; select that version through the folder snapshot below.';
            const old = state().document.entries.find(x => x.id === r.entryId)?.versions
              .find(v => v.version === r.version);
            if (!old) throw Error('conflict');
            row = addPinnedRow(r, old, list);
          }
          row.check.checked = true;
        }
        clearReview();
        status.textContent =
          'Folder snapshot selected. Choose the fields and files to include.';
      }));
      folders.append(button);
    }
    body.append(folders);
    const collection = node('details'),
      summary = node('summary', 'Create a folder from selected items'),
      label = node('label', 'Folder name'),
      name = node('input'),
      create = node('button', 'Save folder privately');
    name.maxLength = 4096;
    label.append(name);
    collection.append(summary, label, create);
    create.addEventListener('click', () => run(async () => {
      const before = state().document,
        next = makeCollection(before, name.value, selected().map(({
          entryId,
          version
        }) => ({
          entryId,
          version
        })));
      await save(next);
      status.textContent = 'Folder saved privately. Sharing has not started.';
    }));
    body.insertBefore(collection, list);
    const uploadLabel = node('label', 'Upload files into this book'),
      upload = node('input');
    upload.type = 'file';
    upload.multiple = true;
    uploadLabel.append(upload);
    body.append(uploadLabel, node('p',
      'Uploads save privately first. Choose a file and approve its exact copy to share. Private files may be up to 25 MiB; this sharing request allows at most 2 MiB per file and 5 MiB total, including encoded contents.'
    ));
    upload.addEventListener('change', () => run(async () => {
      const files = await filesValue(upload.files);
      let next = state().document;
      const added = [];
      for (const f of files) {
        next = addEntry(next, {
          kind: 'file',
          title: f.name,
          fields: {},
          files: [f]
        });
        added.push(next.entries.at(-1).id);
      }
      await save(next);
      const current = state();
      if (current.document !== next || current.scope !== c.scope) throw Error('conflict');
      let eligible = 0;
      for (const row of rows)
        if (added.includes(row.id) && row.files[0] && !row.files[0].input.disabled) {
          row.check.checked = true;
          row.files[0].input.checked = true;
          eligible++;
        }
      if (!eligible) {
        clearReview();
        status.textContent =
          'Files saved privately. They exceed this sharing request’s size or filename limits and remain unshared.';
        return;
      }
      try {
        showPreview(await session.preview(selected()));
        status.textContent =
          `Files saved privately. Review and approve the eligible copies.${eligible < added.length ? ' Other uploaded files exceed sharing limits and remain private.' : ''}`;
      } catch (error) {
        clearReview();
        status.textContent =
          'Files saved privately, but this selection exceeds the total sharing limit. Remove files from the selection and preview again. Nothing has been shared.';
        throw error;
      }
    }));
    body.append(choose);
    const pending = session.restore();
    if (pending) {
      status.textContent =
        'A saved sharing request is pending. Review the exact copy before retrying.';
      showPreview(pending);
    }
  }

  function addPinnedRow(ref, v, list) {
    const box = node('fieldset'),
      legend = node('legend'),
      check = node('input');
    check.type = 'checkbox';
    legend.append(check, document.createTextNode(` ${v.title} · Pinned version ${v.version}`));
    box.append(legend);
    const row = {
      id: ref.entryId,
      version: ref.version,
      check,
      fields: [],
      files: [],
      box,
      pinned: true
    };
    const current = rows.find(x => x.id === ref.entryId);
    if (current) {
      current.check.checked = false;
      current.check.disabled = true;
    }
    for (const key of Object.keys(v.fields).filter(k => !['source', 'classification', 'subject',
        'taskId', 'reusedFrom'
      ].includes(k))) {
      const label = node('label'),
        input = node('input');
      input.type = 'checkbox';
      input.disabled = !shareField(key, v.fields[key]);
      label.append(input, document.createTextNode(
        ` ${key}${input.disabled?' · stays private: structured or unsupported field':''}`));
      box.append(label);
      row.fields.push({
        key,
        input
      });
    }
    v.files.forEach((f, index) => {
      const label = node('label'),
        input = node('input');
      input.type = 'checkbox';
      const n = fileSize(f);
      input.disabled = n === null || n > c.limits.maxFileBytes;
      label.append(input, document.createTextNode(
        ` ${f.name}${input.disabled?' · private only':''}`));
      box.append(label);
      row.files.push({
        index,
        input
      });
    });
    box.addEventListener('change', clearReview);
    rows.push(row);
    list.append(box);
    return row;
  }
  choose.addEventListener('click', () => run(async () => {
    try {
      showPreview(await session.preview(selected()));
      status.textContent =
        'Review this copy, its recipient and scope. Nothing has been shared.';
    } catch (error) {
      clearReview();
      status.textContent = error.message === 'quota' ?
        'This selection exceeds sharing limits. Remove items or files; nothing was truncated or shared.' :
        'Choose at least one supported item and its fields or files.';
      throw error;
    }
  }));
  approve.addEventListener('click', () => run(async () => {
    busy = true;
    body.inert = review.inert = true;
    status.textContent = 'Saving your sharing request privately…';
    try {
      const receipt = session.prepared?.attempted ? await session.send() : await session
        .approve(preview);
      status.textContent =
        `Shared with ${c.recipient.name}. Grant ${receipt.grantId}. Receipt ${receipt.receiptId}.${receipt.privateReceiptSaved?'':' The grant succeeded, but its private receipt was not saved.'}`;
      review.replaceChildren();
      preview = null;
      heading.focus();
    } catch (error) {
      status.textContent = session.prepared?.attempted ?
        'Delivery is not confirmed. Retry the same approved copy to check its receipt.' :
        'This attempt was not sent. Your saved book is unchanged by sending; check sharing status for any earlier attempt before retrying.';
      throw error;
    } finally {
      busy = false;
      signature = state().document ?
        `${state().document.vaultId}:${state().document.revision}` : null;
      body.inert = review.inert = false;
    }
  }));

  function refresh() {
    const s = state();
    root.hidden = false;
    if (!s.document || s.scope !== c.scope) {
      session.clear();
      signature = null;
      rows = [];
      clearReview();
      body.replaceChildren();
      status.textContent = `Unlock the ${c.scope} book to select information.`;
      return;
    }
    const sig = `${s.document.vaultId}:${s.document.revision}`;
    if (sig !== signature && !busy) {
      session.clear();
      signature = sig;
      build(s.document);
      if (!preview) status.textContent =
        'Choose the fields and files to share. Everything stays private until approval.';
    }
  }
  return {
    refresh,
    focus() {
      if (!state().document || state().scope !== c.scope) return false;
      heading.focus({
        preventScroll: true
      });
      root.scrollIntoView({
        block: 'start'
      });
      return true;
    }
  };
}
