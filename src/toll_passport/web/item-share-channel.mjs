// Copyright 2026 Steven Ochs and Tollbench. SPDX-License-Identifier: Apache-2.0
import {
  exact,
  uuid,
  validLimits,
  validateItems
} from './item-selection.mjs';
export const ITEM_PROTOCOL = 'passport-item-share-v1';
const text = (v, n) => typeof v === 'string' && !!v.trim() && v.length <= n;
const cap = v => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
export function validateItemContext(v) {
  return exact(v, ['requestId', 'token', 'scope', 'recipient', 'accessScope', 'purpose',
      'expiresAt', 'grantExpiresAt', 'limits'
    ]) && uuid(v.requestId) && text(v.token, 32768) && ['personal', 'business'].includes(v.scope) &&
    exact(v.recipient, ['id', 'name']) && text(v.recipient.id, 100) && text(v.recipient.name,
      200) && exact(v.accessScope, ['id', 'label']) && text(v.accessScope.id, 200) && text(v
      .accessScope.label, 500) && text(v.purpose, 500) && Number.isSafeInteger(v.expiresAt) && v
    .expiresAt > 0 && Number.isSafeInteger(v.grantExpiresAt) && v.grantExpiresAt > 0 && validLimits(
      v.limits);
}
export const validateItemReady = v => exact(v, ['protocol', 'type', 'nonce']) && v.protocol ===
  ITEM_PROTOCOL && v.type === 'ready' && uuid(v.nonce);
export const validateItemInit = v => exact(v, ['protocol', 'type', 'nonce', 'capability',
  'context'
]) && v.protocol === ITEM_PROTOCOL && v.type === 'init' && uuid(v.nonce) && cap(v
  .capability) && (v.context === null || validateItemContext(v.context));
const base = v => v?.protocol === ITEM_PROTOCOL && uuid(v.nonce) && cap(v.capability) && uuid(v.id);
export const validateItemRelease = v => exact(v, ['protocol', 'type', 'nonce', 'capability', 'id',
    'token', 'approvalId', 'savedRevision', 'manifestDigest', 'items'
  ]) && base(v) && v.type === 'release' && text(v.token, 32768) && uuid(v.approvalId) && Number
  .isSafeInteger(v.savedRevision) && v.savedRevision > 0 && cap(v.manifestDigest) && validateItems(v
    .items);
export function validateItemReceipt(v) {
  if (!base(v) || v.type !== 'receipt') return false;
  return v.ok === true ? exact(v, ['protocol', 'type', 'nonce', 'capability', 'id', 'ok', 'grantId',
    'receiptId'
  ]) && text(v.grantId, 100) && text(v.receiptId, 100) : v.ok === false && exact(v, ['protocol',
    'type', 'nonce', 'capability', 'id', 'ok', 'error'
  ]) && ['invalid', 'unauthorized', 'conflict', 'expired', 'unavailable', 'quota'].includes(v
    .error);
}
export function connectItemHost(win = window, {
  timeout = 10000,
  releaseTimeout = 30000,
  expectedOrigins = []
} = {}) {
  return new Promise(resolve => {
    if (win.parent === win) {
      resolve(null);
      return;
    }
    const nonce = crypto.randomUUID(),
      pending = new Map(),
      attempted = new Map();
    let origin, capability, context, closed = false;
    const close = () => {
      closed = true;
      clearTimeout(timer);
      win.removeEventListener('message', receive);
      for (const p of pending.values()) {
        clearTimeout(p.timer);
        p.reject(Error('unavailable'));
      }
      pending.clear();
    };
    const receive = event => {
      if (closed || event.source !== win.parent) return;
      const v = event.data;
      if (!capability) {
        if (!validateItemInit(v) || v.nonce !== nonce || !/^https?:\/\//.test(event.origin) ||
            expectedOrigins.length && !expectedOrigins.includes(event.origin))
          return;
        origin = event.origin;
        capability = v.capability;
        context = v.context;
        clearTimeout(timer);
        if (!context) {
          close();
          resolve(null);
          return;
        }
        resolve({
          context,
          close,
          release(payload) {
            if (closed || !exact(payload, ['approvalId', 'savedRevision',
                'manifestDigest', 'items'
              ]) || !validateItems(payload.items, context.limits)) return Promise.reject(
              Error('invalid'));
            const signature = JSON.stringify([payload.manifestDigest, payload.items]);
            if ((Date.now() >= context.expiresAt || Date.now() >= context
                .grantExpiresAt) && attempted.get(payload.approvalId) !== signature)
              return Promise.reject(Error('expired'));
            const message = {
              protocol: ITEM_PROTOCOL,
              type: 'release',
              nonce,
              capability,
              id: crypto.randomUUID(),
              token: context.token,
              ...payload
            };
            if (!validateItemRelease(message)) return Promise.reject(Error('invalid'));
            return new Promise((resolve, reject) => {
              const timer = setTimeout(() => {
                pending.delete(message.id);
                reject(Error('unavailable'));
              }, releaseTimeout);
              pending.set(message.id, {
                resolve,
                reject,
                timer
              });
              attempted.set(payload.approvalId, signature);
              win.parent.postMessage(message, origin);
            });
          }
        });
        return;
      }
      if (event.origin !== origin || !validateItemReceipt(v) || v.nonce !== nonce || v
        .capability !== capability) return;
      const p = pending.get(v.id);
      if (!p) return;
      clearTimeout(p.timer);
      pending.delete(v.id);
      v.ok ? p.resolve(v) : p.reject(Error(v.error));
    };
    const timer = setTimeout(() => {
      close();
      resolve(null);
    }, timeout);
    win.addEventListener('message', receive);
    win.parent.postMessage({
      protocol: ITEM_PROTOCOL,
      type: 'ready',
      nonce
    }, '*');
  });
}
