import test from 'node:test';
import assert from 'node:assert/strict';
import {BATCH_PROTOCOL,connectBatchHost,validateBatchDraft} from '../src/toll_passport/web/question-batch-channel.mjs';
const context=()=>({requestId:crypto.randomUUID(),token:'signed-current',scope:'personal',subject:'owner:personal',taskId:'live-task',purpose:'Answer current questions',recipient:{id:'one',name:'One'},questions:[{id:'q1',digest:'a'.repeat(64),title:'Name?',format:'short_answer',label:null,options:[]}],expiresAt:Date.now()+60000});
async function fixture(){
 let handler;const sent=[],parent={postMessage:data=>sent.push(data)},win={parent,addEventListener:(_,f)=>handler=f,removeEventListener:()=>handler=null};
 const pending=connectBatchHost(win,{timeout:100,expectedOrigins:['https://host.test']});
 const c=context(),nonce=sent[0].nonce,capability='b'.repeat(64),emit=(data,over={})=>handler?.({source:parent,origin:'https://host.test',data,...over});
 emit({protocol:BATCH_PROTOCOL,type:'init',nonce,capability,context:c});const channel=await pending;
 const message=(generation=1)=>({protocol:BATCH_PROTOCOL,type:'draft',nonce,capability,id:crypto.randomUUID(),token:c.token,generation,answers:[{id:'q1',value:'Manual draft'}]});
 return {channel,c,sent,emit,message};
}
test('inbound draft binds signed live context, source, origin, nonce, capability and question IDs',async()=>{
 const f=await fixture();let accepted=0;f.channel.setDraftHandler(()=>{accepted++;return true;});
 for(const [change,over] of [[{token:'stale'},{}],[{nonce:crypto.randomUUID()},{}],[{capability:'c'.repeat(64)},{}],[{answers:[{id:'other',value:'x'}]},{}],[{}, {source:{}}],[{}, {origin:'https://wrong.test'}]])f.emit({...f.message(),...change},over);
 assert.equal(accepted,0);f.emit(f.message());assert.equal(accepted,1);assert.deepEqual(Object.keys(f.sent.at(-1)).sort(),['capability','id','nonce','ok','protocol','type']);assert(!JSON.stringify(f.sent).includes('Manual draft'));f.channel.close();
});
test('lost ACK retries use fresh sequence; stale and duplicate generations cannot replace edits',async()=>{
 const f=await fixture();let values=[];f.channel.setDraftHandler(a=>{values.push(a[0].value);return true;});
 f.emit(f.message(1));f.emit({...f.message(1),answers:[{id:'q1',value:'stale replacement'}]});assert.deepEqual(values,['Manual draft']);
 f.emit(f.message(2));assert.equal(values.length,2);assert.equal(f.sent.at(-1).ok,true);
 f.channel.setDraftHandler(()=>false);f.emit(f.message(3));assert.equal(f.sent.at(-1).ok,false);assert.equal(values.length,2);
 f.c.expiresAt=1;f.emit(f.message(4));assert.equal(values.length,2);f.channel.close();
});
test('drafts bound text, choices, generations, exact shape and complete question coverage',async()=>{
 const f=await fixture(),m=f.message();assert(validateBatchDraft(m,f.c));
 for(const change of [{generation:0},{generation:1000001},{answers:[]},{answers:[{id:'q1',value:'x'.repeat(2001)}]},{answers:[{id:'q1',value:[]}]},{answers:[{id:'q1',value:'x',files:[]}]},{extra:true}])assert(!validateBatchDraft({...m,...change},f.c));
 f.c.questions[0].format='multiple_choice';f.c.questions[0].options=[{value:'a',label:'A'}];
 assert(validateBatchDraft({...m,answers:[{id:'q1',value:[]}]},f.c));assert(!validateBatchDraft({...m,answers:[{id:'q1',value:['forged']}]},f.c));f.channel.close();
});
