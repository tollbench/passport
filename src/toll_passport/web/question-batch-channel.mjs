// Copyright 2026 Steven Ochs and Tollbench. SPDX-License-Identifier: Apache-2.0
// Explicit batch disclosure; independent of the unchanged ciphertext and single-question channels.
export const BATCH_PROTOCOL = 'passport-question-batch-v1';
export const RELEASE_FILE_BYTES = 2 * 1024 * 1024;
export const RELEASE_TOTAL_BYTES = 5 * 1024 * 1024;
const uuid = v => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const text = (v, max) => typeof v === 'string' && !!v.trim() && v.length <= max;
const exact = (v, keys) => v !== null && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === keys.length && keys.every(k => Object.hasOwn(v, k));
const formats = new Set(['short_answer', 'written_response', 'single_choice', 'multiple_choice', 'yes_no']);
const cap = v => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
export function fileBytes(file) {
  if (!exact(file, ['name', 'type', 'data']) || !text(file.name, 1024) || /[\x00-\x1f\x7f\\/]/.test(file.name) ||
      typeof file.type !== 'string' || file.type.length > 256 || !/^[a-zA-Z0-9!#$&^_.+-]+\/[a-zA-Z0-9!#$&^_.+-]+$/.test(file.type) ||
      typeof file.data !== 'string' || file.data.length > Math.ceil(RELEASE_FILE_BYTES / 3) * 4 ||
      file.data.length % 4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(file.data)) return null;
  try { const raw = atob(file.data), bytes = raw.length; return bytes <= RELEASE_FILE_BYTES && btoa(raw) === file.data ? bytes : null; } catch { return null; }
}
export function validateBatchContext(v) {
  if (!exact(v, ['requestId', 'token', 'scope', 'subject', 'taskId', 'purpose', 'recipient', 'questions', 'expiresAt']) ||
      !uuid(v.requestId) || !text(v.token, 32768) || !['personal', 'business'].includes(v.scope) ||
      !text(v.subject, 200) || !text(v.taskId, 200) || !text(v.purpose, 500) ||
      !exact(v.recipient, ['id', 'name']) || !text(v.recipient.id, 100) || !text(v.recipient.name, 200) ||
      !Number.isSafeInteger(v.expiresAt) || v.expiresAt <= 0 || !Array.isArray(v.questions) || v.questions.length < 1 || v.questions.length > 16) return false;
  const ids = new Set();
  for (const q of v.questions) {
    if (!exact(q, ['id', 'digest', 'title', 'format', 'label', 'options']) || !text(q.id, 100) || ids.has(q.id) ||
        !/^[a-f0-9]{64}$/.test(q.digest) || !text(q.title, 500) || !formats.has(q.format) ||
        !(q.label === null || typeof q.label === 'string' && /^[a-z][a-z0-9_]{0,63}$/.test(q.label)) || !Array.isArray(q.options)) return false;
    ids.add(q.id);
    if (['single_choice', 'multiple_choice'].includes(q.format)) {
      if (!q.options.length || q.options.length > 50) return false;
      const values = new Set();
      for (const o of q.options) {
        if (!exact(o, ['value', 'label']) || !text(o.value, 100) || !text(o.label, 200) || values.has(o.value)) return false;
        values.add(o.value);
      }
    } else if (q.options.length) return false;
  }
  return true;
}
export function validValue(question, value) {
  if (['short_answer', 'written_response'].includes(question.format)) return text(value, 2000);
  if (question.format === 'yes_no') return ['yes', 'no'].includes(value);
  const choices = new Set(question.options.map(o => o.value));
  if (question.format === 'single_choice') return typeof value === 'string' && choices.has(value);
  return Array.isArray(value) && value.length > 0 && value.length <= choices.size && new Set(value).size === value.length && value.every(v => choices.has(v));
}
export function validateBatchAnswers(answers, context = null) {
  if (!Array.isArray(answers) || answers.length > 16) return false;
  let count = 0, bytes = 0; const ids = new Set();
  for (const a of answers) {
    if (!exact(a, ['id', 'value', 'files']) || !text(a.id, 100) || ids.has(a.id) || !Array.isArray(a.files)) return false;
    ids.add(a.id);
    if (context) { const q = context.questions.find(q => q.id === a.id); if (!q || !validValue(q, a.value)) return false; }
    else if (!(text(a.value, 2000) || Array.isArray(a.value) && a.value.length <= 50 && a.value.every(v => text(v, 100)))) return false;
    for (const f of a.files) { const n = fileBytes(f); if (n === null) return false; bytes += n; count++; }
  }
  return count <= 3 && bytes <= RELEASE_TOTAL_BYTES;
}
export const validateBatchReady = v => exact(v, ['protocol', 'type', 'nonce']) && v.protocol === BATCH_PROTOCOL && v.type === 'ready' && uuid(v.nonce);
export const validateBatchInit = v => exact(v, ['protocol', 'type', 'nonce', 'capability', 'context']) && v.protocol === BATCH_PROTOCOL && v.type === 'init' && uuid(v.nonce) && cap(v.capability) && (v.context === null || validateBatchContext(v.context));
const base = v => v?.protocol === BATCH_PROTOCOL && uuid(v.nonce) && cap(v.capability) && uuid(v.id);
export const validateBatchRelease = v => exact(v, ['protocol', 'type', 'nonce', 'capability', 'id', 'token', 'approvalId', 'answers']) && base(v) && v.type === 'release' && text(v.token, 32768) && uuid(v.approvalId) && validateBatchAnswers(v.answers);
export function validateBatchReceipt(v) {
  if (!base(v) || v.type !== 'receipt') return false;
  return v.ok === true ? exact(v, ['protocol', 'type', 'nonce', 'capability', 'id', 'ok', 'receiptId']) && text(v.receiptId, 100) :
    v.ok === false && exact(v, ['protocol', 'type', 'nonce', 'capability', 'id', 'ok', 'error']) && ['invalid', 'unauthorized', 'conflict', 'expired', 'unavailable'].includes(v.error);
}
export function connectBatchHost(win = window, { timeout = 10000, releaseTimeout = 30000 } = {}) {
  return new Promise(resolve => {
    if (win.parent === win) { resolve(null); return; }
    const nonce = crypto.randomUUID(), pending = new Map(), attempted = new Map();
    let origin, capability, context, closed = false;
    const close = () => { closed = true; clearTimeout(timer); win.removeEventListener('message', receive); for (const p of pending.values()) { clearTimeout(p.timer); p.reject(Error('unavailable')); } pending.clear(); };
    const receive = event => {
      if (closed || event.source !== win.parent) return;
      const v = event.data;
      if (!capability) {
        if (!validateBatchInit(v) || v.nonce !== nonce || !/^https?:\/\//.test(event.origin)) return;
        origin = event.origin; capability = v.capability; context = v.context; clearTimeout(timer);
        if (!context) { close(); resolve(null); return; }
        resolve({context, close, release(answers, approvalId) {
          if (closed || !validateBatchAnswers(answers, context)) return Promise.reject(Error('invalid'));
          const signature = JSON.stringify(answers);
          if (Date.now() >= context.expiresAt && attempted.get(approvalId) !== signature) return Promise.reject(Error('expired'));
          const message = {protocol:BATCH_PROTOCOL,type:'release',nonce,capability,id:crypto.randomUUID(),token:context.token,approvalId,answers};
          if (!validateBatchRelease(message)) return Promise.reject(Error('invalid'));
          return new Promise((resolve,reject) => { const timer=setTimeout(()=>{pending.delete(message.id);reject(Error('unavailable'));},releaseTimeout); pending.set(message.id,{resolve,reject,timer});attempted.set(approvalId,signature);win.parent.postMessage(message,origin); });
        }}); return;
      }
      if (event.origin !== origin || !validateBatchReceipt(v) || v.nonce !== nonce || v.capability !== capability) return;
      const p=pending.get(v.id);if(!p)return;clearTimeout(p.timer);pending.delete(v.id);v.ok?p.resolve(v):p.reject(Error(v.error));
    };
    const timer=setTimeout(()=>{close();resolve(null);},timeout);win.addEventListener('message',receive);win.parent.postMessage({protocol:BATCH_PROTOCOL,type:'ready',nonce},'*');
  });
}
