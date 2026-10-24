// Copyright 2026 Steven Ochs and Tollbench. SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import {createVault,addEntry} from '../src/toll_passport/web/vault.mjs';
import {createDeviceMemory} from '../src/toll_passport/web/device-memory.mjs';
import {createBookSession} from '../src/toll_passport/web/book-session.mjs';

const owner={ownerBinding:'x'.repeat(32),parentOrigin:'https://app.example'};
const other={...owner,ownerBinding:'y'.repeat(32)};
const storage=()=>{
  const records=new Map();
  return {records,get:async k=>records.get(k),add:async(k,v)=>{if(records.has(k))throw Error('exists');records.set(k,v);},
    put:async(k,v)=>{records.set(k,v);},delete:async k=>{records.delete(k);},keys:async()=>[...records.keys()]};
};
test('opt-in wrapping remembers only exact owner, origin, book, vault; explicit lock survives remount',async()=>{
  const store=storage(),device=createDeviceMemory(store),vault=await createVault();
  assert.equal(await device.restore(owner,'personal',vault.envelope),null);
  await device.remember(owner,'personal',vault.document.vaultId,vault.key);
  const key=[...store.records.values()].find(x=>x?.type==='secret');
  assert.equal(key.extractable,false);
  assert.deepEqual((await device.restore(owner,'personal',vault.envelope)).document,vault.document);
  assert.equal(await device.restore(other,'personal',vault.envelope),null);
  assert.equal(await device.restore({...owner,parentOrigin:'https://another.example'},'personal',vault.envelope),null);
  assert.equal(await device.restore(owner,'business',vault.envelope),null);
  await device.lock(owner);
  assert.equal(await device.restore(owner,'personal',vault.envelope),null);
  await device.unlockDevice(owner);
  assert.deepEqual((await device.restore(owner,'personal',vault.envelope)).document,vault.document);
  await device.forget(owner);
  assert.equal(await device.restore(owner,'personal',vault.envelope),null);
});
test('tampered wrapping record does not unlock or expose a vault key',async()=>{
  const store=storage(),device=createDeviceMemory(store),vault=await createVault();
  await device.remember(owner,'personal',vault.document.vaultId,vault.key);
  const name=[...store.records.keys()].find(k=>k.startsWith('vault:'));
  const old=store.records.get(name);store.records.set(name,{...old,ciphertext:old.ciphertext.replace(/^./,'A')});
  await assert.rejects(device.restore(owner,'personal',vault.envelope),/device-unlock-failed/);
});
test('Forget waits for an in-flight Remember and leaves no wrapper or device key',async()=>{
  const store=storage(),vault=await createVault();
  let reached,release;
  const entered=new Promise(resolve=>{reached=resolve;});
  const held=new Promise(resolve=>{release=resolve;});
  const original=store.put;
  store.put=async(name,value)=>{if(name.startsWith('vault:')){reached();await held;}return original(name,value);};
  const device=createDeviceMemory(store);
  const remembering=device.remember(owner,'personal',vault.document.vaultId,vault.key);
  await entered;
  const forgetting=device.forget(owner);
  release();
  await Promise.allSettled([remembering,forgetting]);
  assert.equal([...store.records.keys()].some(name=>name.includes(owner.ownerBinding)),false);
  assert.equal(await device.restore(owner,'personal',vault.envelope),null);
});
test('Lock cancels an in-flight restore before it can return an open book',async()=>{
  const store=storage(),vault=await createVault(),device=createDeviceMemory(store);
  await device.remember(owner,'personal',vault.document.vaultId,vault.key);
  let reached,release;
  const entered=new Promise(resolve=>{reached=resolve;});
  const held=new Promise(resolve=>{release=resolve;});
  const original=store.get;
  store.get=async name=>{if(name.startsWith('vault:')){reached();await held;}return original(name);};
  const restoring=device.restore(owner,'personal',vault.envelope);
  await entered;
  await device.lock(owner);
  release();
  assert.equal(await restoring,null);
});
test('separate book saves serialize, CAS failures stop further writes and preserve local document',async()=>{
  const personal=await createVault(),business=await createVault();
  const records={personal:{envelope:personal.envelope,etag:'p1'},business:{envelope:business.envelope,etag:'b1'}};
  let fail=false,saves=[];
  const host={scopes:['personal','business'],storageIdentity:null,async request(op,scope,payload){
    const row=records[scope];if(op==='load')return {...row};
    saves.push(scope);if(fail||payload.expectedEtag!==row.etag)throw Error('conflict');
    row.envelope=payload.envelope;row.etag=`${scope}-${saves.length}`;return {etag:row.etag};
  }};
  const session=createBookSession(host);await Promise.all([session.load('personal'),session.load('business')]);
  await session.unlock('personal',await (await import('../src/toll_passport/web/vault.mjs')).exportRecovery(personal.key,personal.document.vaultId));
  await session.unlock('business',await (await import('../src/toll_passport/web/vault.mjs')).exportRecovery(business.key,business.document.vaultId));
  const add=title=>doc=>addEntry(doc,{kind:'note',title,fields:{content:title}});
  await Promise.all([session.saveToScope('personal',add('one')),session.saveToScope('personal',add('two')),
    session.saveToScope('business',add('three'))]);
  assert.equal(session.getState('personal').document.entries.length,2);
  assert.equal(session.getState('business').document.entries.length,1);
  fail=true;const before=session.getState('business').document.revision;
  await assert.rejects(session.saveToScope('business',add('four')),/conflict/);
  assert.equal(session.getState('business').document.revision,before);
  await assert.rejects(session.saveToScope('business',add('five')),/locked/);
  assert.equal(session.getState('personal').document.entries.length,2);
});
