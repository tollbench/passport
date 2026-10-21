// Copyright 2026 Steven Ochs and Tollbench. SPDX-License-Identifier: Apache-2.0
import { addEntry } from './vault.mjs';
import { findAnswerCandidates } from './answers.mjs';

/** The only state that authorizes release is a successfully persisted, exact local answer version. */
export class QuestionAnswer {
  constructor(channel, state, save) {
    this.channel = channel; this.state = state; this.save = save; this.prepared = null; this.receipt = null; this.generation = 0;
  }
  current(allowExpired = false) {
    const value = this.state(), context = this.channel.context;
    if (!value.document || value.scope !== context.scope) throw Error('locked');
    if (!allowExpired && Date.now() >= context.expiresAt) throw Error('expired');
    return value.document;
  }
  candidates() {
    const context = this.channel.context;
    return findAnswerCandidates(this.current(), { label: context.label, subject: context.subject,
      taskId: context.taskId, scope: 'task' }).filter(item => item.answer.length <= 2000);
  }
  validPrepared(answer, allowExpired = false) {
    const doc = this.current(allowExpired), value = this.prepared;
    if (!value || value.answer !== answer || value.vaultId !== doc.vaultId) return false;
    const latest = doc.entries.find(entry => entry.id === value.entryId)?.versions.at(-1);
    return latest?.version === value.version && latest.fields.answer === value.answer;
  }
  async prepare(answer, reusable = false, source = null) {
    if (typeof answer !== 'string' || !answer.trim() || answer.length > 2000) throw Error('invalid');
    if (this.prepared?.reusable === reusable && this.validPrepared(answer, this.canRetry(answer))) return this.prepared;
    this.prepared = null; this.receipt = null;
    const generation = ++this.generation;
    const doc = this.current(), context = this.channel.context;
    // Provenance remains encrypted. Candidate IDs are never passed to the host's question channel.
    const candidate = source && this.candidates().find(item => item.provenance.entryId === source.entryId &&
      item.provenance.version === source.version && item.answer === answer);
    const next = addEntry(doc, { kind: 'answer', title: context.question.title,
      fields: { question: context.question.title, answer, subject: context.subject,
        scope: reusable ? 'reusable' : 'task', taskId: context.taskId, label: context.label || '',
        ...(candidate ? { reusedFrom: { entryId: source.entryId, version: source.version } } : {}) },
      tags: context.label ? [context.label] : [] });
    const entry = next.entries.at(-1), version = entry.versions.at(-1);
    await this.save(next); // A failed/conflicted save can never enable an answer release.
    if (generation !== this.generation) throw Error('conflict');
    this.prepared = { answer, reusable, vaultId: next.vaultId, entryId: entry.id, version: version.version,
      approvalId: crypto.randomUUID() };
    if (!this.validPrepared(answer)) { this.prepared = null; throw Error('conflict'); }
    return this.prepared;
  }
  canRetry(answer) {
    return !!this.prepared && this.prepared.attempted === true && this.prepared.answer === answer;
  }
  async release(answer) {
    if (!this.validPrepared(answer, this.canRetry(answer))) throw Error('conflict');
    if (this.receipt) return this.receipt;
    const generation = this.generation;
    this.prepared.attempted = true;
    const receipt = await this.channel.release(answer, this.prepared.approvalId);
    if (generation !== this.generation || !this.validPrepared(answer, true)) throw Error('conflict');
    this.receipt = receipt; return receipt;
  }
  clear() { this.generation++; this.prepared = null; this.receipt = null; }
}

export function mountQuestionAnswer(root, channel, { state, save, run }) {
  const session = new QuestionAnswer(channel, state, save), context = channel.context;
  let draft = '', source = null, vaultId = null, initialized = false, sent = false, cancelDialog;
  const find = selector => root.querySelector(selector);
  const heading = find('[data-question-title]'), recipient = find('[data-question-recipient]'),
    answer = find('textarea'), review = find('[data-question-review]'), feedback = find('[data-question-feedback]'),
    choices = find('[data-question-candidates]'), reusable = find('[data-question-reusable]');
  heading.textContent = context.question.title;
  recipient.textContent = `For ${context.recipient.name} · this work card · ${context.scope === 'business' ? 'Business' : 'Personal'} book`;
  find('[data-question-locked]').textContent = `Open your ${context.scope} book to use saved answers for this question. To choose another book, close it and flip the Passport card. Nothing is shared while locked.`;
  root.hidden = false;
  const use = candidate => {
    draft = candidate.answer; answer.value = draft; source = candidate.provenance;
    feedback.textContent = `Private suggestion · Version ${source.version} · ${new Date(source.createdAt).toLocaleDateString()}. Review before sharing.`;
    refresh();
  };
  const refresh = () => {
    const value = state(), available = !!value.document && value.scope === context.scope;
    find('[data-question-locked]').hidden = available;
    find('[data-question-editor]').hidden = !available;
    if (!available) {
      cancelDialog?.(); sent = false;
      draft = ''; source = null; initialized = false; vaultId = null; answer.value = '';
      choices.replaceChildren(); session.clear(); return;
    }
    if (vaultId !== value.document.vaultId) { initialized = false; draft = ''; source = null; session.clear(); vaultId = value.document.vaultId; }
    if (Date.now() >= context.expiresAt && !session.canRetry(draft)) {
      review.disabled = true; feedback.textContent = 'This request expired. Return to the work card and open its current question.'; return;
    }
    if (!initialized) {
      initialized = true; choices.replaceChildren();
      const candidates = session.candidates();
      if (candidates.length === 1 && candidates[0].reviewReasons.length === 0) use(candidates[0]);
      else for (const candidate of candidates) {
        const row = document.createElement('article'), text = document.createElement('p'), select = document.createElement('button');
        text.textContent = `${candidate.answer} — ${candidate.provenance.question}, version ${candidate.provenance.version}, ${new Date(candidate.provenance.createdAt).toLocaleDateString()} (review required)`;
        select.type = 'button'; select.className = 'secondary'; select.textContent = 'Use this saved answer';
        select.addEventListener('click', () => use(candidate)); row.append(text, select); choices.append(row);
      }
    }
    answer.value = draft;
    review.disabled = sent || !draft.trim() || (Date.now() >= context.expiresAt && !session.canRetry(draft));
    review.textContent = session.canRetry(draft) && !sent ? 'Check delivery of this answer' : 'Review answer for agent';
    if (Date.now() >= context.expiresAt && !session.canRetry(draft)) feedback.textContent = 'This request expired. Return to the work card and open its current question.';
  };
  answer.addEventListener('input', () => { draft = answer.value; source = null; sent = false; refresh(); });
  review.addEventListener('click', () => run(async () => {
    if (sent || !draft.trim()) return;
    const selected = draft;
    feedback.textContent = 'Saving privately. Nothing has been sent.';
    try { await session.prepare(selected, reusable.checked, source); }
    catch (error) { feedback.textContent = 'Sharing is paused. Your draft is still here. Check your book before retrying; nothing has been sent.'; throw error; }
    feedback.textContent = 'Saved privately. Nothing has been sent.';
    const dialog = document.createElement('dialog'), title = document.createElement('h2'), copy = document.createElement('p'), preview = document.createElement('pre'), yes = document.createElement('button'), no = document.createElement('button');
    title.textContent = `Send this answer to ${context.recipient.name}?`;
    copy.textContent = `Only this answer to “${context.question.title}” will be released for this work card. Tollbench and ${context.recipient.name} can read and retain the released copy. Your other information stays private.`;
    preview.textContent = selected; yes.textContent = 'Send this answer'; no.textContent = 'Keep private'; no.className = 'secondary';
    const approved = await new Promise(resolve => {
      const finish = value => { cancelDialog = null; dialog.close(); dialog.remove(); resolve(value); };
      cancelDialog = () => finish(false);
      yes.addEventListener('click', () => finish(true)); no.addEventListener('click', () => finish(false));
      dialog.addEventListener('cancel', event => { event.preventDefault(); finish(false); });
      dialog.append(title, copy, preview, yes, no); root.append(dialog); dialog.showModal(); no.focus();
    });
    if (!approved) return;
    try {
      const receipt = await session.release(selected); sent = true;
      feedback.textContent = `Answer sent to ${context.recipient.name}. Receipt ${receipt.receiptId}.`;
      heading.focus({ preventScroll: true }); root.scrollIntoView({ block: 'start', behavior: 'instant' });
    } catch (error) {
      feedback.textContent = error.message === 'unavailable' ? 'Delivery is not confirmed. Retry this same saved answer to check its receipt; do not create a new answer.' :
        'Not sent: this request may have changed, closed or expired. Return to the work card; your answer is saved privately.';
      throw error;
    }
  }));
  return { refresh, focus() {
    const value = state();
    if (!value.document || value.scope !== context.scope) return false;
    heading.focus({ preventScroll: true }); root.scrollIntoView({ block: 'start', behavior: 'instant' }); return true;
  } };
}
