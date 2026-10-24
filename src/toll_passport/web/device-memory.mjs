// Copyright 2026 Steven Ochs and Tollbench. SPDX-License-Identifier: Apache-2.0
// Device storage is opt-in. This module never sends a key or plaintext to the host.
import {validateStorageIdentity, validateEnvelope} from './hosted-bridge.mjs';
import {unlockVaultWithKey} from './vault.mjs';

const encoder = new TextEncoder();
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const b64 = bytes => btoa(String.fromCharCode(...bytes));
const raw = value => Uint8Array.from(atob(value), c => c.charCodeAt(0));
const keyName = identity => `key:${identity.parentOrigin}:${identity.ownerBinding}`;
const lockName = identity => `lock:${identity.parentOrigin}:${identity.ownerBinding}`;
const wrapName = (identity, scope, vaultId) =>
  `vault:${identity.parentOrigin}:${identity.ownerBinding}:${scope}:${vaultId}`;
const aad = (identity, scope, vaultId) => encoder.encode(JSON.stringify([
  'passport-device-wrap-v1', identity.parentOrigin, identity.ownerBinding, scope, vaultId
]));
function check(identity, scope, vaultId) {
  if (!validateStorageIdentity(identity) || !['personal','business'].includes(scope) ||
      typeof vaultId !== 'string' || !uuid.test(vaultId)) throw Error('invalid');
}

/** Storage adapter values include nonextractable CryptoKey objects. */
export function createDeviceMemory(storage) {
  if (!storage || !['get','add','put','delete','keys'].every(k => typeof storage[k] === 'function')) throw Error('invalid');
  const generations = new Map(), mutations = new Map();
  const identityKey = identity => `${identity.parentOrigin}:${identity.ownerBinding}`;
  const generation = identity => generations.get(identityKey(identity)) || 0;
  const invalidate = identity => generations.set(identityKey(identity), generation(identity) + 1);
  function mutate(identity, action) {
    const name = identityKey(identity), prior = mutations.get(name) || Promise.resolve();
    const next = prior.catch(() => {}).then(action);
    mutations.set(name, next);
    void next.finally(() => { if (mutations.get(name) === next) mutations.delete(name); }).catch(() => {});
    return next;
  }
  async function deviceKey(identity) {
    const name = keyName(identity);
    let key = await storage.get(name);
    if (!key) {
      const candidate = await crypto.subtle.generateKey({name:'AES-GCM',length:256}, false,
        ['encrypt','decrypt']);
      try { await storage.add(name, candidate); key = candidate; }
      catch { key = await storage.get(name); if (!key) throw Error('device-storage-unavailable'); }
    }
    if (key?.type !== 'secret' || key.extractable || key.algorithm?.name !== 'AES-GCM' ||
        key.algorithm?.length !== 256) throw Error('device-storage-invalid');
    return key;
  }
  return {
    async remember(identity, scope, vaultId, vaultKey) {
      check(identity, scope, vaultId);
      if (vaultKey?.type !== 'secret' || !vaultKey.extractable ||
          vaultKey.algorithm?.name !== 'AES-GCM' || vaultKey.algorithm?.length !== 256) throw Error('invalid');
      const started = generation(identity);
      return mutate(identity, async () => {
      if (generation(identity) !== started) throw Error('device-operation-canceled');
      const wrappingKey = await deviceKey(identity), nonce = crypto.getRandomValues(new Uint8Array(12));
      let bytes;
      try {
        bytes = new Uint8Array(await crypto.subtle.exportKey('raw', vaultKey));
        const ciphertext = new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv:nonce,
          additionalData:aad(identity,scope,vaultId),tagLength:128}, wrappingKey, bytes));
        if (generation(identity) !== started) throw Error('device-operation-canceled');
        await storage.put(wrapName(identity,scope,vaultId),
          {format:'passport-device-wrap-v1',nonce:b64(nonce),ciphertext:b64(ciphertext)});
      } finally { bytes?.fill(0); }
      });
    },
    async restore(identity, scope, envelope) {
      if (!validateEnvelope(envelope)) throw Error('invalid');
      check(identity,scope,envelope.vaultId);
      const started = generation(identity);
      if (await storage.get(lockName(identity))) return null;
      const [key, wrapper] = await Promise.all([
        storage.get(keyName(identity)), storage.get(wrapName(identity,scope,envelope.vaultId))
      ]);
      if (!key || !wrapper) return null;
      if (key.extractable || key.type !== 'secret' || key.algorithm?.name !== 'AES-GCM' ||
          wrapper.format !== 'passport-device-wrap-v1' || typeof wrapper.nonce !== 'string' ||
          typeof wrapper.ciphertext !== 'string') throw Error('device-storage-invalid');
      let bytes;
      try {
        if (!/^[A-Za-z0-9+/]{16}$/.test(wrapper.nonce) ||
            !/^[A-Za-z0-9+/]{64}$/.test(wrapper.ciphertext)) throw Error('invalid');
        const nonce=raw(wrapper.nonce);
        if (nonce.length !== 12) throw Error('invalid');
        bytes = new Uint8Array(await crypto.subtle.decrypt({name:'AES-GCM',iv:nonce,
          additionalData:aad(identity,scope,envelope.vaultId),tagLength:128},key,raw(wrapper.ciphertext)));
        if (bytes.length !== 32) throw Error('invalid');
        const vaultKey=await crypto.subtle.importKey('raw',bytes,{name:'AES-GCM'},true,['encrypt','decrypt']);
        const opened = await unlockVaultWithKey(envelope,vaultKey);
        if (generation(identity) !== started || await storage.get(lockName(identity))) return null;
        return opened;
      } catch { throw Error('device-unlock-failed'); }
      finally { bytes?.fill(0); }
    },
    async forget(identity) {
      if (!validateStorageIdentity(identity)) throw Error('invalid');
      invalidate(identity);
      return mutate(identity, async () => {
      const prefix=`vault:${identity.parentOrigin}:${identity.ownerBinding}:`;
      for (const name of await storage.keys()) if (name.startsWith(prefix)) await storage.delete(name);
      await storage.delete(keyName(identity));
      await storage.delete(lockName(identity));
      });
    },
    async lock(identity) {
      if (!validateStorageIdentity(identity)) throw Error('invalid');
      invalidate(identity);
      return mutate(identity, () => storage.put(lockName(identity), true));
    },
    async unlockDevice(identity) {
      if (!validateStorageIdentity(identity)) throw Error('invalid');
      return mutate(identity, () => storage.delete(lockName(identity)));
    },
    async isLocked(identity) {
      if (!validateStorageIdentity(identity)) throw Error('invalid');
      return !!await storage.get(lockName(identity));
    },
    async remembered(identity,scope,vaultId) {
      check(identity,scope,vaultId);
      return !!await storage.get(wrapName(identity,scope,vaultId));
    }
  };
}

/** A dedicated HTTPS origin supplies this IndexedDB store; opaque origins cannot use it. */
export function indexedDbDeviceStorage(win = window) {
  if (win.location?.protocol !== 'https:' || win.origin === 'null' || !win.indexedDB) throw Error('device-storage-unavailable');
  const db = new Promise((resolve,reject) => {
    const request=win.indexedDB.open('toll-passport-device-v1',1);
    request.onupgradeneeded=()=>{request.result.createObjectStore('records');};
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(Error('device-storage-unavailable'));
    request.onblocked=()=>reject(Error('device-storage-unavailable'));
  });
  const operation=(mode,call)=>db.then(database=>new Promise((resolve,reject)=>{
    const tx=database.transaction('records',mode),store=tx.objectStore('records');
    let request, result;
    try { request=call(store); } catch { reject(Error('device-storage-unavailable')); return; }
    request.onsuccess=()=>{result=request.result;};
    tx.oncomplete=()=>resolve(result);
    tx.onerror=()=>reject(Error('device-storage-unavailable'));
    tx.onabort=()=>reject(Error('device-storage-unavailable'));
  }));
  return {
    get:name=>operation('readonly',s=>s.get(name)),
    add:(name,value)=>operation('readwrite',s=>s.add(value,name)),
    put:(name,value)=>operation('readwrite',s=>s.put(value,name)),
    delete:name=>operation('readwrite',s=>s.delete(name)),
    keys:()=>operation('readonly',s=>s.getAllKeys())
  };
}
