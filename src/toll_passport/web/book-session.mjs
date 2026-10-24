// Copyright 2026 Steven Ochs and Tollbench. SPDX-License-Identifier: Apache-2.0
// Two independent encrypted books behind one private client session.
import {unlockVault, sealVault, validateDocument} from './vault.mjs';
import {validateEnvelope} from './hosted-bridge.mjs';
import {createOwnerLockChannel} from './device-lock-channel.mjs';

const scopes = ['personal','business'];
const copy = value => JSON.parse(JSON.stringify(value));

export function createBookSession(host, device = null, onChange = () => {}) {
  if (!host || typeof host.request !== 'function') throw Error('invalid');
  const books = new Map(scopes.map(scope => [scope, {scope,loaded:false,envelope:null,etag:null,
    key:null,document:null,uncertain:false,error:false,generation:0,queue:Promise.resolve()}]));
  const notify = scope => onChange(scope);
  function dropUnlocked() {
    for (const b of books.values()) {b.generation++;b.key=null;b.document=null;b.uncertain=false;notify(b.scope);}
  }
  const lockSignal=host.storageIdentity&&typeof window!=='undefined'?
    createOwnerLockChannel(host.storageIdentity,dropUnlocked):null;
  if(lockSignal&&typeof window!=='undefined')window.addEventListener('pagehide',()=>lockSignal.close(),{once:true});
  const book = scope => { if (!host.scopes.includes(scope) || !books.has(scope)) throw Error('invalid'); return books.get(scope); };
  const state = scope => { const b=book(scope); return {scope,document:b.key?b.document:null,
    vaultId:b.envelope?.vaultId||null,loaded:b.loaded,uncertain:b.uncertain,error:b.error}; };
  async function load(scope, {autoUnlock=true} = {}) {
    const b=book(scope), generation=++b.generation;
    b.loaded=false;b.key=null;b.document=null;b.uncertain=false;b.error=false;notify(scope);
    let result;
    try {result=await host.request('load',scope);} catch(error){b.error=true;notify(scope);throw error;}
    if (generation!==b.generation) throw Error('conflict');
    if (result.envelope !== null && !validateEnvelope(result.envelope)) throw Error('invalid');
    b.envelope=result.envelope;b.etag=result.etag;b.loaded=true;notify(scope);
    if (autoUnlock && result.envelope && device && host.storageIdentity) {
      try {
        const opened=await device.restore(host.storageIdentity,scope,result.envelope);
        if (generation!==b.generation) throw Error('conflict');
        if (opened) {b.key=opened.key;b.document=opened.document;notify(scope);}
      } catch (error) {
        if (generation!==b.generation) throw Error('conflict');
        // A missing/evicted/tampered wrapper never replaces recovery or a saved envelope.
        if (error.message !== 'device-unlock-failed' && error.message !== 'device-storage-unavailable') throw error;
      }
    }
    return state(scope);
  }
  async function unlock(scope,recovery) {
    const b=book(scope);
    if (!b.loaded || !b.envelope || b.uncertain) throw Error('unavailable');
    const generation=b.generation, opened=await unlockVault(b.envelope,recovery);
    if (generation!==b.generation) throw Error('conflict');
    b.key=opened.key;b.document=opened.document;notify(scope);return state(scope);
  }
  async function rememberDevice(scope) {
    const b=book(scope);
    if (!device || !host.storageIdentity || !b.key || !b.document || b.uncertain) throw Error('unavailable');
    await device.remember(host.storageIdentity,scope,b.document.vaultId,b.key);
  }
  async function forgetDevice() {
    if (!device || !host.storageIdentity) throw Error('unavailable');
    dropUnlocked();
    try {await device.forget(host.storageIdentity);}
    finally {lockSignal?.broadcast();}
  }
  async function saveDocument(scope,next,expected) {
    const b=book(scope);
    const operation=async()=>{
      if (!b.key || !b.document || !b.loaded || b.uncertain || !expected ||
          expected.scope!==scope || expected.vaultId!==b.document.vaultId ||
          expected.revision!==b.document.revision) throw Error('conflict');
      validateDocument(next);
      if (next.vaultId!==b.document.vaultId || next.revision<=b.document.revision) throw Error('conflict');
      const generation=b.generation, etag=b.etag, sealed=await sealVault(next,b.key);
      if (generation!==b.generation || etag!==b.etag) throw Error('conflict');
      try {
        const result=await host.request('save',scope,{envelope:sealed,expectedEtag:etag});
        if (generation!==b.generation || etag!==b.etag) throw Error('conflict');
        b.etag=result.etag;b.envelope=sealed;b.document=next;notify(scope);
        return state(scope);
      } catch(error) {
        // A timeout can mean the host committed. Never retry with a stale etag.
        b.uncertain=true;notify(scope);throw error;
      }
    };
    const pending=b.queue.then(operation);b.queue=pending.catch(()=>{});return pending;
  }
  async function saveToScope(scope,mutator) {
    if (typeof mutator!=='function') throw Error('invalid');
    const b=book(scope);
    const operation=async()=>{
      const snapshot=state(scope);
      if (!snapshot.document || b.uncertain) throw Error('locked');
      const next=mutator(copy(snapshot.document));
      validateDocument(next);
      if (next.vaultId!==snapshot.document.vaultId || next.revision<=snapshot.document.revision) throw Error('conflict');
      const generation=b.generation,etag=b.etag,sealed=await sealVault(next,b.key);
      if (generation!==b.generation || etag!==b.etag) throw Error('conflict');
      try {
        const result=await host.request('save',scope,{envelope:sealed,expectedEtag:etag});
        if (generation!==b.generation || etag!==b.etag) throw Error('conflict');
        b.etag=result.etag;b.envelope=sealed;b.document=next;notify(scope);return state(scope);
      } catch(error) {b.uncertain=true;notify(scope);throw error;}
    };
    const pending=b.queue.then(operation);b.queue=pending.catch(()=>{});return pending;
  }
  async function lockAll() {
    dropUnlocked();
    try {if (device && host.storageIdentity) await device.lock(host.storageIdentity);}
    finally {lockSignal?.broadcast();}
  }
  async function unlockDevice() {
    if (!device || !host.storageIdentity) throw Error('unavailable');
    await device.unlockDevice(host.storageIdentity);
    return Promise.all(host.scopes.map(scope=>load(scope)));
  }
  return {getState:state,load,unlock,saveDocument,saveToScope,rememberDevice,forgetDevice,lockAll,unlockDevice};
}
