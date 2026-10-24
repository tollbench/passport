// Copyright 2026 Steven Ochs and Tollbench. SPDX-License-Identifier: Apache-2.0
// Explicit answer release has its own channel. The ciphertext storage protocol is unchanged.
export const QUESTION_PROTOCOL = 'passport-question-v1';
const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const text = (value, max) => typeof value === 'string' && value.trim().length > 0 && value.length <= max;
const exact = (value, keys) => value !== null && typeof value === 'object' && !Array.isArray(value) &&
  Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const capability = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
export function validateQuestionContext(value) {
  const keys=['requestId', 'token', 'scope', 'subject', 'taskId', 'question', 'recipient', 'label', 'expiresAt'];
  return (exact(value,keys)||exact(value,[...keys,'bookSubjects'])) &&
    uuid(value.requestId) && text(value.token, 8192) && ['personal', 'business'].includes(value.scope) &&
    text(value.subject, 200) && text(value.taskId, 200) &&
    (exact(value.question, ['id', 'digest', 'title', 'format']) ||
      exact(value.question, ['id', 'digest', 'title', 'format','bookScope']) &&
        ['personal','business'].includes(value.question.bookScope) && Object.hasOwn(value,'bookSubjects')) &&
    (!Object.hasOwn(value,'bookSubjects') || exact(value.bookSubjects,['personal','business']) &&
      text(value.bookSubjects.personal,200) && text(value.bookSubjects.business,200) &&
      value.bookSubjects[value.scope]===value.subject) && text(value.question.id, 100) &&
    /^[a-f0-9]{64}$/.test(value.question.digest) && text(value.question.title, 500) &&
    ['short_answer', 'written_response'].includes(value.question.format) &&
    exact(value.recipient, ['id', 'name']) && text(value.recipient.id, 100) && text(value.recipient.name, 200) &&
    (value.label === null || typeof value.label === 'string' && /^[a-z][a-z0-9_]{0,63}$/.test(value.label)) &&
    Number.isSafeInteger(value.expiresAt) && value.expiresAt > 0;
}
export const validateQuestionReady = value => exact(value, ['protocol', 'type', 'nonce']) &&
  value.protocol === QUESTION_PROTOCOL && value.type === 'ready' && uuid(value.nonce);
export const validateQuestionInit = value => exact(value, ['protocol', 'type', 'nonce', 'capability', 'context']) &&
  value.protocol === QUESTION_PROTOCOL && value.type === 'init' && uuid(value.nonce) && capability(value.capability) &&
  (value.context === null || validateQuestionContext(value.context));
const base = value => value?.protocol === QUESTION_PROTOCOL && uuid(value.nonce) && capability(value.capability) && uuid(value.id);
export const validateAnswerRelease = value => exact(value, ['protocol', 'type', 'nonce', 'capability', 'id', 'token', 'approvalId', 'answer']) &&
  base(value) && value.type === 'release' && text(value.token, 8192) && uuid(value.approvalId) && text(value.answer, 2000);
export function validateAnswerReceipt(value) {
  if (!base(value) || value.type !== 'receipt') return false;
  if (value.ok === true) return exact(value, ['protocol', 'type', 'nonce', 'capability', 'id', 'ok', 'receiptId']) && text(value.receiptId, 100);
  return value.ok === false && exact(value, ['protocol', 'type', 'nonce', 'capability', 'id', 'ok', 'error']) &&
    ['invalid', 'unauthorized', 'conflict', 'expired', 'unavailable'].includes(value.error);
}

/** Optional host request. No draft or saved answer leaves until release() is called by owner UI. */
export function connectQuestionHost(win = window, { timeout = 10000, releaseTimeout = 30000,
  expectedOrigins = [] } = {}) {
  return new Promise((resolve, reject) => {
    if (win.parent === win) { resolve(null); return; }
    const nonce = crypto.randomUUID(), pending = new Map(), attempted = new Map();
    let origin, cap, context, closed = false;
    const close = () => {
      closed = true; clearTimeout(timer); win.removeEventListener('message', receive);
      for (const item of pending.values()) { clearTimeout(item.timer); item.reject(Error('unavailable')); }
      pending.clear();
    };
    const receive = event => {
      if (closed || event.source !== win.parent) return;
      const value = event.data;
      if (!cap) {
        if (!validateQuestionInit(value) || value.nonce !== nonce || !/^https?:\/\//.test(event.origin) ||
            expectedOrigins.length && !expectedOrigins.includes(event.origin)) return;
        origin = event.origin; cap = value.capability; context = value.context; clearTimeout(timer);
        if (!context) { close(); resolve(null); return; }
        resolve({ context, close, release(answer, approvalId) {
          if (closed) return Promise.reject(Error('unavailable'));
          if (Date.now() >= context.expiresAt && attempted.get(approvalId) !== answer) return Promise.reject(Error('expired'));
          const message = { protocol: QUESTION_PROTOCOL, type: 'release', nonce, capability: cap,
            id: crypto.randomUUID(), token: context.token, approvalId, answer };
          if (!validateAnswerRelease(message)) return Promise.reject(Error('invalid'));
          return new Promise((resolve, reject) => {
            const timer = setTimeout(() => { pending.delete(message.id); reject(Error('unavailable')); }, releaseTimeout);
            pending.set(message.id, { resolve, reject, timer });
            attempted.set(approvalId, answer);
            win.parent.postMessage(message, origin);
          });
        }});
        return;
      }
      if (event.origin !== origin || !validateAnswerReceipt(value) || value.nonce !== nonce || value.capability !== cap) return;
      const item = pending.get(value.id); if (!item) return;
      clearTimeout(item.timer); pending.delete(value.id);
      if (value.ok) item.resolve(value); else item.reject(Error(value.error));
    };
    const timer = setTimeout(() => { close(); resolve(null); }, timeout);
    win.addEventListener('message', receive);
    win.parent.postMessage({ protocol: QUESTION_PROTOCOL, type: 'ready', nonce }, '*');
  });
}
