// Copyright 2026 Steven Ochs and Tollbench. SPDX-License-Identifier: Apache-2.0
// Transport validation only. Cryptography remains in vault.mjs.
import { MAX_VAULT_BYTES } from './vault.mjs';
export const PROTOCOL = 'passport-hosted-v1';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const token = v => typeof v === 'string' && /^[A-Za-z0-9_-]{32,128}$/.test(v);
const etag = v => typeof v === 'string' && /^[\x21-\x7e]{1,256}$/.test(v);
const scope = v => ['personal', 'business'].includes(v);
const isHttpsOrigin = v => {
  try { const u = new URL(v); return u.protocol === 'https:' && u.origin === v; } catch { return false; }
};
export const validateStorageIdentity = v => exact(v, ['ownerBinding', 'parentOrigin']) &&
  typeof v.ownerBinding === 'string' && /^[A-Za-z0-9_-]{22,128}$/.test(v.ownerBinding) &&
  isHttpsOrigin(v.parentOrigin);
const exact = (v, fields) => v !== null && typeof v === 'object' && !Array.isArray(v) &&
  Object.keys(v).length === fields.length && fields.every(k => Object.hasOwn(v, k));
const baseFields = ['protocol', 'type', 'nonce', 'capability', 'id', 'op', 'scope'];
const base = v => v?.protocol === PROTOCOL && uuid.test(v.nonce) && token(v.capability) &&
  uuid.test(v.id) && ['load', 'save', 'delete'].includes(v.op) && scope(v.scope);
const binary = (v, max, min = 0) => {
  if (typeof v !== 'string' || v.length > Math.ceil(max / 3) * 4 || v.length % 4 ||
      !/^[A-Za-z0-9+/]*={0,2}$/.test(v)) return false;
  const bytes = v.length / 4 * 3 - (v.endsWith('==') ? 2 : v.endsWith('=') ? 1 : 0);
  return bytes >= min && bytes <= max;
};
export const validateEnvelope = v => exact(v, ['format', 'vaultId', 'revision', 'nonce', 'ciphertext']) &&
  v.format === 'passport-vault-v1' && uuid.test(v.vaultId) && Number.isSafeInteger(v.revision) &&
  v.revision > 0 && binary(v.nonce, 12, 12) && binary(v.ciphertext, MAX_VAULT_BYTES, 16);
export const validateReady = v => exact(v, ['protocol', 'type', 'nonce']) &&
  v.protocol === PROTOCOL && v.type === 'ready' && uuid.test(v.nonce);
export const validateControl = v => v?.protocol === PROTOCOL && v.type === 'control' &&
  uuid.test(v.nonce) && token(v.capability) && uuid.test(v.id) &&
  (v.command === 'lock-all' && exact(v,
    ['protocol','type','nonce','capability','id','command']) ||
    v.command === 'open-panel' && exact(v,
      ['protocol','type','nonce','capability','id','command','panel']) &&
      ['information','goals','sharing'].includes(v.panel));
export const validateInit = v => (exact(v, ['protocol', 'type', 'nonce', 'capability', 'scopes', 'scope']) ||
  exact(v, ['protocol', 'type', 'nonce', 'capability', 'scopes', 'scope', 'storageIdentity']) &&
    validateStorageIdentity(v.storageIdentity)) &&
  v.protocol === PROTOCOL && v.type === 'init' && uuid.test(v.nonce) && token(v.capability) &&
  Array.isArray(v.scopes) && v.scopes.length >= 1 && v.scopes.length <= 2 &&
  new Set(v.scopes).size === v.scopes.length && v.scopes.every(scope) && v.scopes.includes(v.scope);
export function validateRequest(v) {
  if (!base(v) || v.type !== 'request') return false;
  if (v.op === 'load') return exact(v, baseFields);
  if (v.op === 'delete') return exact(v, [...baseFields, 'expectedEtag']) && etag(v.expectedEtag);
  return exact(v, [...baseFields, 'expectedEtag', 'envelope']) &&
    (v.expectedEtag === null || etag(v.expectedEtag)) && validateEnvelope(v.envelope);
}
export function validateResult(v) {
  if (!base(v) || v.type !== 'result') return false;
  if (v.ok === false) return exact(v, [...baseFields, 'ok', 'error']) &&
    ['conflict', 'unauthorized', 'unavailable', 'invalid', 'quota'].includes(v.error);
  if (v.ok !== true) return false;
  if (v.op === 'load') return exact(v, [...baseFields, 'ok', 'etag', 'envelope']) &&
    ((v.envelope === null && v.etag === null) || (validateEnvelope(v.envelope) && etag(v.etag)));
  return exact(v, [...baseFields, 'ok', 'etag']) && (v.op === 'delete' ? v.etag === null : etag(v.etag));
}

/** One parent, pinned origin, one capability, correlated replies. No data network access. */
export function connectHost(win = window, { timeout = 30000, expectedOrigins = [] } = {}) {
  return new Promise((resolve, reject) => {
    if (win.parent === win) { reject(Error('embedding-required')); return; }
    if (!Array.isArray(expectedOrigins) || expectedOrigins.some(v => !isHttpsOrigin(v))) {
      reject(Error('invalid-origin-policy')); return;
    }
    const nonce = crypto.randomUUID(), pending = new Map();
    let origin, capability, scopes, closed = false, controlHandler = null, questionUI = null;
    const send = message => win.parent.postMessage(message, origin || '*');
    const close = () => {
      closed = true;
      if(questionUI){clearTimeout(questionUI.timer);questionUI.resolve(false);questionUI=null;}
      win.removeEventListener('message', receive);
      clearTimeout(timer);
      for (const p of pending.values()) { clearTimeout(p.timer); p.reject(Error('unavailable')); }
      pending.clear();
    };
    const receive = event => {
      if (closed || event.source !== win.parent) return;
      const v = event.data;
      if (!capability) {
        if (!validateInit(v) || v.nonce !== nonce || !/^https?:\/\//.test(event.origin) ||
            expectedOrigins.length && (!expectedOrigins.includes(event.origin) ||
              !v.storageIdentity || v.storageIdentity.parentOrigin !== event.origin)) return;
        origin = event.origin; capability = v.capability; scopes = [...v.scopes];
        clearTimeout(timer);
        resolve({ scopes, scope: v.scope, storageIdentity: v.storageIdentity || null, close,
          reportViewReady(view) {
            if (closed || view !== 'questions') throw Error('invalid');
            send({protocol:PROTOCOL,type:'view-ready',nonce,capability,view});
          },
          reportQuestionUI() {
            if(closed)throw Error('unavailable');
            if(questionUI)return questionUI.promise;
            let finish;const promise=new Promise(resolve=>{finish=resolve;});
            const timer=setTimeout(()=>{questionUI=null;finish(false);},2000);
            questionUI={promise,resolve:finish,timer};
            send({protocol:PROTOCOL,type:'question-ui',nonce,capability,version:1});
            return promise;
          },
          reportConnected(connected) {
            if (closed || typeof connected!=='boolean') throw Error('invalid');
            send({protocol:PROTOCOL,type:'connection-state',nonce,capability,connected});
          },
          openBook() {
            if (closed) throw Error('unavailable');
            send({protocol:PROTOCOL,type:'open-book',nonce,capability});
          },
          setControlHandler(handler) { if (typeof handler !== 'function') throw Error('invalid'); controlHandler=handler; },
          request(op, scope, payload = {}) {
          if (closed) return Promise.reject(Error('unavailable'));
          const message = { protocol: PROTOCOL, type: 'request', nonce, capability,
            id: crypto.randomUUID(), op, scope, ...payload };
          if (!scopes.includes(scope) || !validateRequest(message)) return Promise.reject(Error('invalid'));
          return new Promise((resolve, reject) => {
            const timer = setTimeout(() => { pending.delete(message.id); reject(Error('unavailable')); }, timeout);
            pending.set(message.id, { resolve, reject, timer, op, scope });
            send(message);
          });
        }});
        return;
      }
      if(event.origin===origin&&exact(v,['protocol','type','nonce','capability','version'])&&
         v.protocol===PROTOCOL&&v.type==='question-ui-ack'&&v.nonce===nonce&&v.capability===capability&&v.version===1){
        if(questionUI){clearTimeout(questionUI.timer);questionUI.resolve(true);questionUI=null;}return;
      }
      if (event.origin === origin && validateControl(v) && v.nonce === nonce &&
          v.capability === capability) {
        Promise.resolve().then(()=>controlHandler ? controlHandler(v.command,v.panel) : false)
          .then(ok=>send({protocol:PROTOCOL,type:'control-result',nonce,capability,id:v.id,ok:ok===true}),
            ()=>send({protocol:PROTOCOL,type:'control-result',nonce,capability,id:v.id,ok:false}));
        return;
      }
      if (event.origin !== origin || !validateResult(v) || v.nonce !== nonce || v.capability !== capability) return;
      const p = pending.get(v.id);
      if (!p || p.op !== v.op || p.scope !== v.scope) return;
      clearTimeout(p.timer); pending.delete(v.id);
      if (v.ok) p.resolve(v); else p.reject(Error(v.error));
    };
    const timer = setTimeout(() => { close(); reject(Error('unavailable')); }, timeout);
    win.addEventListener('message', receive);
    send({ protocol: PROTOCOL, type: 'ready', nonce });
  });
}
