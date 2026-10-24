// Copyright 2026 Steven Ochs and Tollbench. SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import {createVault,addEntry} from '../src/toll_passport/web/vault.mjs';
import {questionScope,questionSubject,propagateExact,savedDraft,exactSuggestions} from '../src/toll_passport/web/unified-question-model.mjs';
const digest='a'.repeat(64),requestId=crypto.randomUUID();
const context={scope:'personal',subject:'personal-subject',bookSubjects:{personal:'personal-subject',business:'business-subject'},
  requestId,taskId:'task',recipient:{id:'maker',name:'Maker'},matching:{requests:[{questionId:'one',requestType:null},{questionId:'two',requestType:null},
    {questionId:'three',requestType:null}]}};
const q=id=>({id,digest,title:'Same exact question',format:'short_answer',options:[]});
test('per-row scope keeps original per-book subject and never infers from prose',()=>{
  assert.equal(questionScope(context,{...q('one'),bookScope:'business'}),'business');
  assert.equal(questionSubject(context,'business'),'business-subject');
  assert.throws(()=>questionScope({...context,bookSubjects:null},q('one'),'business'),/invalid/);
});
test('exact compatible blanks propagate; edits, conflicts and other books remain untouched',()=>{
  const rows=[{q:q('one'),scope:'business',entityId:'',value:'new answer',edited:true},
    {q:q('two'),scope:'business',entityId:'',value:'',edited:false},
    {q:q('three'),scope:'business',entityId:'',value:'old answer',edited:false},
    {q:q('three'),scope:'personal',entityId:'',value:'',edited:false}];
  assert.deepEqual(propagateExact(context,rows,rows[0]),[rows[1]]);
  assert.equal(rows[1].value,'new answer');assert.equal(rows[2].value,'old answer');
  assert.equal(rows[3].value,'');
});
test('private draft and source suggestion require exact scope, subject, digest and options',async()=>{
  const vault=await createVault(),question=q('one');
  let document=addEntry(vault.document,{kind:'answer_draft',title:question.title,fields:{requestId,
    taskId:'task',questionId:'one',questionDigest:digest,answerFormat:'short_answer',answerOptions:[],
    subject:'business-subject',bookScope:'business',value:'private',selected:true}});
  assert.equal(savedDraft(document,context,question,'business').fields.value,'private');
  assert.equal(savedDraft(document,{...context,requestId:crypto.randomUUID()},question,'business').fields.value,'private');
  assert.equal(savedDraft(document,context,question,'personal'),null);
  document=addEntry(document,{kind:'answer',title:question.title,fields:{subject:'business-subject',
    questionDigest:digest,value:'source',answerOptions:[],scope:'reusable',question:question.title}});
  assert.equal(exactSuggestions(document,context,question,'business').length,1);
  assert.equal(exactSuggestions(document,context,question,'personal').length,0);
  assert.equal(exactSuggestions(document,context,{...question,title:'Different question'},'business').length,0);
});
test('canonical topic reuses different wording and digest only for same entity, subject and options',async()=>{
  const ctx={...context,matching:{allowedRequestTypes:['person.food_preference','pet.diet'],
    requests:[{questionId:'one',requestType:'person.food_preference',contextKey:'diet'},
      {questionId:'two',requestType:'person.food_preference',contextKey:'diet'},
      {questionId:'three',requestType:'pet.diet',contextKey:'diet'}]}};
  const one={...q('one'),title:'What food do you like?',format:'single_choice',options:[{value:'jazz',label:'Jazz'}]};
  const two={...q('two'),digest:'b'.repeat(64),title:'Pick your food preference',format:'single_choice',options:one.options};
  const three={...q('three'),title:'What does the pet eat?',format:'single_choice',options:one.options};
  let doc=(await createVault()).document;
  doc=addEntry(doc,{kind:'passport.entity',title:'Steven',fields:{entityKind:'person',name:'Steven'}});
  const entityId=doc.entries.at(-1).id;
  doc=addEntry(doc,{kind:'answer',title:one.title,fields:{question:one.title,subject:'business-subject',
    questionDigest:one.digest,value:'jazz',answerOptions:one.options,scope:'reusable',
    classification:{catalogVersion:'1',entityId,requestType:'person.food_preference',
      topic:'food_preference',valueType:'string',answerFormat:'single_choice',contextKey:'diet',
      taskBinding:{scope:'reusable'}}}});
  assert.notEqual(one.digest,two.digest);
  assert.equal(exactSuggestions(doc,ctx,two,'business',{entityId}).length,1);
  assert.equal(exactSuggestions(doc,ctx,three,'business',{entityId}).length,0);
  const rows=[{q:one,scope:'business',entityId,value:'jazz',edited:true},
    {q:two,scope:'business',entityId,value:'',edited:false},
    {q:three,scope:'business',entityId,value:'',edited:false}];
  assert.deepEqual(propagateExact(ctx,rows,rows[0]),[rows[1]]);
  const unknown=[{...rows[0],entityId:''},{...rows[1],entityId:''}];
  assert.deepEqual(propagateExact(ctx,unknown,unknown[0]),[]);
  const different=[{...rows[0]},{...rows[1],entityId:crypto.randomUUID()}];
  assert.deepEqual(propagateExact(ctx,different,different[0]),[]);
});
