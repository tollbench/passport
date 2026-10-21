import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createVault, addEntry } from '../src/toll_passport/web/vault.mjs';
import { QUESTION_PROTOCOL, validateQuestionContext, validateAnswerRelease, validateAnswerReceipt } from '../src/toll_passport/web/question-channel.mjs';
import { QuestionAnswer } from '../src/toll_passport/web/question-answer.mjs';
const context = () => ({ requestId: randomUUID(), token: 'signed-context-fixture', scope: 'business',
  subject: 'owner:one:business', taskId: 'deal:one:step:one', question: { id: randomUUID(), digest: 'a'.repeat(64), title: 'Founder biography?', format: 'short_answer' },
  recipient: { id: 'agent-one', name: 'Agent One' }, label: 'founder_bio', expiresAt: Date.now()+60000 });
async function fixture() {
  let document = (await createVault()).document, scope = 'business', failSave = false, failSend = false;
  const request = context(), sent = [];
  const session = new QuestionAnswer({ context: request, release: async (answer, approvalId) => {
    sent.push({ answer, approvalId }); if (failSend) throw Error('unavailable'); return { receiptId: 'receipt-one' };
  } }, () => ({ document, scope }), async next => { if (failSave) throw Error('conflict'); document = next; });
  return { session, request, sent, get document() { return document; }, set document(value) { document=value; },
    set scope(value) { scope=value; }, set failSave(value) { failSave=value; }, set failSend(value) { failSend=value; } };
}
test('question context is exact, text-only, bounded and separate from storage protocol', () => {
  assert.equal(validateQuestionContext(context()), true);
  for (const change of [{ subject: '' }, { label: 'founder bio' }, { scope: 'another-owner' }, { token: 'x'.repeat(8193) }, { expiresAt: Infinity }, { vault: {} }])
    assert.equal(validateQuestionContext({ ...context(), ...change }), false);
  for (const format of ['multiple_choice', 'upload', 'contact_picker']) {
    const c=context(); c.question.format=format; assert.equal(validateQuestionContext(c), false);
  }
  for (const label of [null, 'future_key']) assert.equal(validateQuestionContext({ ...context(), label }), true);
});
test('release accepts only one bounded answer, never draft metadata or a vault envelope', () => {
  const release={protocol:QUESTION_PROTOCOL,type:'release',nonce:randomUUID(),capability:'b'.repeat(64),id:randomUUID(),token:'signed',approvalId:randomUUID(),answer:'Selected answer'};
  assert.equal(validateAnswerRelease(release),true);
  for (const change of [{ answer: '' }, { answer:'x'.repeat(2001) }, { recipient:'other' }, { envelope:{} }, { sourceEntryId:'private' }]) assert.equal(validateAnswerRelease({...release,...change}),false);
  assert.equal(validateAnswerReceipt({protocol:QUESTION_PROTOCOL,type:'receipt',nonce:release.nonce,capability:release.capability,id:release.id,ok:true,receiptId:'one'}),true);
});
test('save failure blocks release and a successful save precedes exact answer delivery', async () => {
  const f=await fixture(); f.failSave=true;
  await assert.rejects(f.session.prepare('Private draft'),/conflict/);
  await assert.rejects(f.session.release('Private draft'),/conflict/);
  assert.deepEqual(f.sent,[]); f.failSave=false;
  await f.session.prepare('Private draft'); assert.deepEqual(f.sent,[]);
  assert.equal(f.document.entries[0].versions[0].fields.subject,f.request.subject);
  assert.equal(f.document.entries[0].versions[0].fields.scope,'task');
  await f.session.release('Private draft'); await f.session.release('Private draft');
  assert.equal(f.sent.length,1); assert.deepEqual(Object.keys(f.sent[0]).sort(),['answer','approvalId']);
});
test('retry retains one approval id; edits, lock, scope switch and changed saved version cannot use old approval', async () => {
  const f=await fixture(); await f.session.prepare('Answer'); f.failSend=true;
  await assert.rejects(f.session.release('Answer'),/unavailable/); f.failSend=false; await f.session.release('Answer');
  assert.equal(f.sent[0].approvalId,f.sent[1].approvalId);
  await assert.rejects(f.session.release('Edited'),/conflict/);
  f.scope='personal'; await assert.rejects(f.session.release('Answer'),/locked/); f.scope='business';
  const entry=f.document.entries[0]; f.document=addEntry(f.document,{id:entry.id,kind:'answer',title:'Changed',fields:{answer:'Changed'}});
  await assert.rejects(f.session.release('Answer'),/conflict/);
  f.document=null; await assert.rejects(f.session.release('Answer'),/locked/);
});
test('subject/task/age matching remains local; unknown labels allow manual answers without guessed migration', async () => {
  const f=await fixture();
  f.document=addEntry(f.document,{kind:'answer',title:'Legacy',fields:{answer:'Do not auto-rebind',label:'founder_bio',subject:'person:me',scope:'reusable'}});
  assert.deepEqual(f.session.candidates(),[]);
  f.request.label='unknown_key'; await f.session.prepare('Manual answer'); assert.deepEqual(f.session.candidates(),[]);
  assert.equal(f.document.entries.at(-1).versions.at(-1).fields.label,'unknown_key');
  f.request.expiresAt=Date.now()-1; await assert.rejects(f.session.release('Manual answer'),/expired/);
});

import { connectQuestionHost } from '../src/toll_passport/web/question-channel.mjs';
const tick = () => new Promise(resolve => setImmediate(resolve));
function transport(timeout=100) {
  let handler; const sent=[];
  const parent={postMessage:(value,origin)=>sent.push({value,origin})};
  const win={parent,addEventListener:(_n,fn)=>handler=fn,removeEventListener:()=>{handler=null;}};
  const emit=(value,extra={})=>handler?.({source:parent,origin:'https://host.example',data:value,...extra});
  const pending=connectQuestionHost(win,{timeout,releaseTimeout:timeout}), nonce=sent[0].value.nonce;
  const init={protocol:QUESTION_PROTOCOL,type:'init',nonce,capability:'b'.repeat(64),context:context()};
  return {pending,sent,parent,emit,init,get listening(){return !!handler;}};
}
test('question transport pins parent, origin, nonce and capability; no draft exits before explicit release', async () => {
  const f=transport();
  f.emit(f.init,{source:{}}); f.emit({...f.init,nonce:randomUUID()}); f.emit(f.init,{origin:'null'});
  await tick(); assert.equal(f.sent.length,1);
  f.emit(f.init); const channel=await f.pending; assert.equal(channel.context.subject,f.init.context.subject);
  assert.equal(f.sent.length,1);
  const result=channel.release('OWNER_APPROVED',randomUUID()), request=f.sent.at(-1).value;
  assert.equal(f.sent.at(-1).origin,'https://host.example');
  const receipt={protocol:QUESTION_PROTOCOL,type:'receipt',nonce:request.nonce,capability:request.capability,id:request.id,ok:true,receiptId:'receipt'};
  let resolved=false; result.then(()=>resolved=true);
  f.emit(receipt,{source:{}}); f.emit(receipt,{origin:'https://other.example'});
  f.emit({...receipt,nonce:randomUUID()}); f.emit({...receipt,capability:'a'.repeat(64)}); f.emit({...receipt,id:randomUUID()});
  await tick(); assert.equal(resolved,false);
  f.emit(receipt); assert.equal((await result).receiptId,'receipt');
  f.emit({...receipt,receiptId:'duplicate'}); await tick(); assert.equal(f.sent.length,2); channel.close();
});
test('optional channel timeout, close and late receipts cannot activate or resolve stale requests', async () => {
  const missing=transport(5); assert.equal(await missing.pending,null); assert.equal(missing.listening,false);
  const f=transport(5); f.emit(f.init); const channel=await f.pending;
  const pending=channel.release('Approved',randomUUID()); await assert.rejects(pending,/unavailable/);
  const request=f.sent.at(-1).value;
  f.emit({protocol:QUESTION_PROTOCOL,type:'receipt',nonce:request.nonce,capability:request.capability,id:request.id,ok:true,receiptId:'late'});
  const second=channel.release('Approved',randomUUID()); channel.close(); await assert.rejects(second,/unavailable/);
  assert.equal(f.listening,false); await assert.rejects(channel.release('Approved',randomUUID()),/unavailable/);
});
test('late save or release after locking cannot restore an old approval', async () => {
  let document=(await createVault()).document, finish;
  const c=context(); const session=new QuestionAnswer({context:c,release:()=>new Promise(resolve=>finish=resolve)},()=>({document,scope:'business'}),async next=>{document=next;});
  await session.prepare('Answer'); const pending=session.release('Answer'); session.clear(); finish({receiptId:'late'});
  await assert.rejects(pending,/conflict/); assert.equal(session.receipt,null);
});

test('expired retry only checks the exact previously attempted approval and answer', async () => {
  const f=transport(5); f.emit(f.init); const channel=await f.pending, approval=randomUUID();
  await assert.rejects(channel.release('Approved',approval),/unavailable/);
  f.init.context.expiresAt=Date.now()-1;
  await assert.rejects(channel.release('Edited',approval),/expired/);
  await assert.rejects(channel.release('Approved',randomUUID()),/expired/);
  const retry=channel.release('Approved',approval), request=f.sent.at(-1).value;
  f.emit({protocol:QUESTION_PROTOCOL,type:'receipt',nonce:request.nonce,capability:request.capability,id:request.id,ok:true,receiptId:'existing'});
  assert.equal((await retry).receiptId,'existing'); channel.close();
  const saved=await fixture(); await saved.session.prepare('Answer'); saved.failSend=true;
  await assert.rejects(saved.session.release('Answer'),/unavailable/); saved.request.expiresAt=Date.now()-1;
  saved.failSend=false; await saved.session.prepare('Answer'); await saved.session.release('Answer');
  assert.equal(saved.sent[0].approvalId,saved.sent[1].approvalId);
});
