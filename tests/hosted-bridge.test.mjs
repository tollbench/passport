// Copyright 2026 Steven Ochs and Tollbench. SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import { createVault } from '../src/toll_passport/web/vault.mjs';
import { PROTOCOL, validateEnvelope, validateRequest, validateResult, validateInit,validateControl,connectHost } from '../src/toll_passport/web/hosted-bridge.mjs';
const nonce = crypto.randomUUID(), capability = 'a'.repeat(32);
const base = { protocol: PROTOCOL, type: 'request', nonce, capability, id: crypto.randomUUID(), op: 'load', scope: 'personal' };
const init = { protocol: PROTOCOL, type: 'init', nonce, capability, scopes: ['personal', 'business'], scope: 'personal' };
test('strict ciphertext-only protocol and scoped snapshot writes', async () => {
  const { envelope } = await createVault();
  assert.equal(validateEnvelope(envelope), true);
  assert.equal(validateInit(init), true);
  const identity={ownerBinding:'x'.repeat(32),parentOrigin:'https://owner.example'};
  assert.equal(validateInit({...init,storageIdentity:identity}),true);
  assert.equal(validateInit({...init,storageIdentity:{...identity,parentOrigin:'https://evil.example/path'}}),false);
  for (const v of [{...init,scopes:['personal','personal']},{...init,scope:'other'},{...init,key:'secret'}]) assert.equal(validateInit(v),false);
  const save = {...base,op:'save',expectedEtag:null,envelope};
  assert.equal(validateRequest(base),true);
  assert.equal(validateRequest(save),true);
  assert.equal(validateRequest({...base,op:'delete',expectedEtag:'"opaque-etag"'}),true);
  for (const v of [{...save,key:'secret'},{...save,envelope:{...envelope,answer:'private'}},{...save,expectedEtag:undefined},{...base,scope:'all'},{...base,op:'delete',expectedEtag:null},{...save,envelope:{...envelope,revision:0}},{...save,envelope:{...envelope,nonce:'bad'}},{...save,envelope:{...envelope,ciphertext:''}}]) assert.equal(validateRequest(v),false);
  const result = {...base,type:'result',ok:true,etag:'one',envelope};
  assert.equal(validateResult(result),true);
  assert.equal(validateResult({...result,etag:null,envelope:null}),true);
  for (const v of [{...result,etag:null},{...result,envelope:null},{...result,key:'secret'},{...result,ok:false,error:'arbitrary'}]) assert.equal(validateResult(v),false);
  assert.equal(validateResult({...base,type:'result',ok:false,error:'conflict'}),true);
});
test('dedicated origin requires exact independently configured parent and storage identity',async()=>{
  const f=fixture(),promise=connectHost(f.win,{timeout:100,expectedOrigins:['https://owner.example']});
  const handshake={...init,nonce:f.sent[0].data.nonce};
  f.emit(handshake);f.emit({...handshake,storageIdentity:{ownerBinding:'x'.repeat(32),parentOrigin:'https://evil.example'}});
  let settled=false;promise.then(()=>settled=true);await new Promise(r=>setTimeout(r,5));assert.equal(settled,false);
  f.emit({...handshake,storageIdentity:{ownerBinding:'x'.repeat(32),parentOrigin:'https://owner.example'}});
  const host=await promise;assert.equal(host.storageIdentity.ownerBinding,'x'.repeat(32));host.close();
});
test('view-ready, open-book and fixed panel controls carry no private data',async()=>{
  const f=fixture(),pending=connectHost(f.win,{timeout:100});
  f.emit({...init,nonce:f.sent[0].data.nonce});const host=await pending;
  host.reportViewReady('questions');host.openBook();
  assert.deepEqual(f.sent.at(-2).data,{protocol:PROTOCOL,type:'view-ready',nonce:f.sent[0].data.nonce,
    capability,view:'questions'});
  assert.deepEqual(f.sent.at(-1).data,{protocol:PROTOCOL,type:'open-book',nonce:f.sent[0].data.nonce,capability});
  host.setControlHandler(async(command,panel)=>command==='open-panel'&&panel==='goals');
  const good={protocol:PROTOCOL,type:'control',nonce:f.sent[0].data.nonce,capability,
    id:crypto.randomUUID(),command:'open-panel',panel:'goals'};
  assert.equal(validateControl(good),true);
  assert.equal(validateControl({...good,panel:'private-vault'}),false);
  f.emit({...good,panel:'private-vault'});f.emit(good,{},'https://owner.example');
  f.emit(good);await new Promise(r=>setTimeout(r,2));
  assert.deepEqual(f.sent.at(-1).data,{protocol:PROTOCOL,type:'control-result',nonce:good.nonce,
    capability,id:good.id,ok:true});host.close();
});
function fixture() {
  let listener;
  const sent = [];
  const parent = { postMessage: (data, origin) => sent.push({data,origin}) };
  const win = { parent, addEventListener: (type, fn) => { listener = fn; }, removeEventListener: () => { listener = undefined; } };
  return {win,sent, emit(data, source=parent, origin='https://owner.example') { listener?.({data,source,origin}); }};
}
test('handshake and replies reject wrong source, origin, nonce, capability, op, scope and extra fields', async () => {
  const f = fixture(), promise = connectHost(f.win,{timeout:200});
  const handshake = {...init,nonce:f.sent[0].data.nonce};
  f.emit(handshake,{}); f.emit({...handshake,nonce:crypto.randomUUID()}); f.emit(handshake,f.win.parent,'null');
  assert.equal(f.sent.length,1);
  f.emit(handshake);
  const host = await promise;
  const request = host.request('load','personal');
  const req = f.sent.at(-1).data;
  assert.equal(f.sent.at(-1).origin,'https://owner.example');
  const reply = {...req,type:'result',ok:true,envelope:null,etag:null};
  let resolved=false; request.then(()=>resolved=true);
  for (const bad of [{...reply,nonce:crypto.randomUUID()},{...reply,capability:'b'.repeat(32)},{...reply,scope:'business'},{...reply,op:'delete'},{...reply,plaintext:'secret'}]) f.emit(bad);
  f.emit(reply,{}); f.emit(reply,f.win.parent,'https://evil.example');
  await new Promise(r=>setTimeout(r,5)); assert.equal(resolved,false);
  f.emit(reply); assert.deepEqual(await request,reply);
  await assert.rejects(host.request('load','other'), /invalid/);
  host.close();
});
test('timeouts reject and late/replayed replies cannot resolve another operation', async () => {
  const f=fixture(), promise=connectHost(f.win,{timeout:20});
  f.emit({...init,nonce:f.sent[0].data.nonce}); const host=await promise;
  const first=host.request('load','personal'), old=f.sent.at(-1).data;
  await assert.rejects(first,/unavailable/);
  const second=host.request('load','personal'), current=f.sent.at(-1).data;
  f.emit({...old,type:'result',ok:true,envelope:null,etag:null});
  f.emit({...current,type:'result',ok:false,error:'conflict'});
  await assert.rejects(second,/conflict/);host.close();
});
test('ordinary question ready requires authenticated current-host capability acknowledgment',async()=>{
  const f=fixture(),pending=connectHost(f.win,{timeout:100});f.emit({...init,nonce:f.sent[0].data.nonce});const host=await pending;
  let ready=false;const support=host.reportQuestionUI().then(value=>{ready=value;return value;});
  const request=f.sent.at(-1).data,ack={...request,type:'question-ui-ack'};
  f.emit(ack,{});f.emit(ack,f.win.parent,'https://wrong.test');f.emit({...ack,capability:'b'.repeat(32)});f.emit({...ack,nonce:crypto.randomUUID()});f.emit({...ack,extra:true});
  await new Promise(r=>setImmediate(r));assert.equal(ready,false);
  f.emit(ack);assert.equal(await support,true);
  const unsupported=host.reportQuestionUI();host.close();assert.equal(await unsupported,false);
});
