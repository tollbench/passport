// Copyright 2026 Steven Ochs and Tollbench. SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import {createVault,addEntry} from '../src/toll_passport/web/vault.mjs';
import {questionScope,questionSubject,propagateExact,savedDraft,exactSuggestions,entitySuggestions} from '../src/toll_passport/web/unified-question-model.mjs';
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
  rows[0].value='revised';
  assert.deepEqual(propagateExact(context,rows,rows[0]),[rows[1]]);
  assert.equal(rows[1].value,'revised');
  rows[1].edited=true;rows[1].propagatedFrom=null;rows[1].value='my own answer';
  rows[0].value='third version';
  assert.deepEqual(propagateExact(context,rows,rows[0]),[]);
  assert.equal(rows[1].value,'my own answer');
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
test('legacy library text answers remain exact suggestions without treating unrecorded choices as safe',async()=>{
  const question=q('one'),base=(await createVault()).document;
  const document=addEntry(base,{kind:'answer',title:question.title,fields:{question:question.title,
    answer:'Older private answer',subject:'business-subject',scope:'reusable'}});
  const hits=exactSuggestions(document,context,question,'business');
  assert.equal(hits.length,1);
  assert.equal(hits[0].value,'Older private answer');
  assert.equal(hits[0].source.question,question.title);
  assert.equal(exactSuggestions(document,context,question,'personal').length,0);
  assert.equal(exactSuggestions(document,context,{...question,title:'Different question'},'business').length,0);
  assert.equal(exactSuggestions(document,context,{...question,format:'single_choice',
    options:[{value:'Older private answer',label:'Older private answer'}]},'business').length,0);
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
  assert.deepEqual(propagateExact(ctx,unknown,unknown[0]),[unknown[1]]);
  assert.equal(unknown[1].value,'');
  const different=[{...rows[0]},{...rows[1],entityId:crypto.randomUUID()}];
  assert.deepEqual(propagateExact(ctx,different,different[0]),[different[1]]);
  assert.equal(different[1].value,'');
  const cleared=addEntry(doc,{id:doc.entries.at(-1).id,kind:'answer',title:one.title,
    fields:{question:one.title,subject:'business-subject',value:'',answerOptions:one.options,
      scope:'task',taskId:'task'}});
  assert.equal(exactSuggestions(cleared,ctx,two,'business',{entityId}).length,0);
});
test('company description suggestions name exact organizations before entity selection',async()=>{
  const first={...q('one'),title:'Describe your company'},second={...q('two'),
    digest:'b'.repeat(64),title:'What does the business do?'},third={...q('three'),title:'Project description'};
  const ctx={...context,matching:{allowedRequestTypes:['organization.description','project.description','person.biography'],
    requests:[{questionId:'one',requestType:'organization.description',contextKey:'profile'},
      {questionId:'two',requestType:'organization.description',contextKey:'profile'},
      {questionId:'three',requestType:'project.description',contextKey:'profile'}]}};
  let doc=(await createVault()).document;
  const entities=[];
  for(const [kind,name] of [['organization','Tollbench'],['organization','Other Co'],
    ['project','Tollbench'],['person','Tollbench']]){
    doc=addEntry(doc,{kind:'passport.entity',title:name,fields:{entityKind:kind,name}});
    entities.push(doc.entries.at(-1).id);
  }
  for(const [id,value] of [[entities[0],'Plans work'],[entities[1],'Makes music']]){
    doc=addEntry(doc,{kind:'answer',title:first.title,fields:{question:first.title,
      subject:'business-subject',value,answer:value,answerOptions:[],scope:'reusable',
      classification:{catalogVersion:'1',entityId:id,requestType:'organization.description',
        topic:'description',valueType:'string',answerFormat:'short_answer',contextKey:'profile',
        taskBinding:{scope:'reusable'}}}});
  }
  const hits=entitySuggestions(doc,ctx,second,'business');
  assert.deepEqual(hits.map(hit=>[hit.entity.name,hit.value]),[['Tollbench','Plans work'],['Other Co','Makes music']]);
  assert.equal(entitySuggestions(doc,ctx,second,'business',{entityId:entities[0]}).length,1);
  assert.equal(entitySuggestions(doc,ctx,second,'personal').length,0);
  assert.equal(entitySuggestions(doc,ctx,third,'business').length,0);
  const rows=[{q:first,scope:'business',entityId:entities[0],topicChoice:'organization.description',
      value:'Plans work',edited:true},{q:second,scope:'business',entityId:entities[0],
      topicChoice:'organization.description',value:'',edited:false},
    {q:second,scope:'business',entityId:entities[1],topicChoice:'organization.description',
      value:'',edited:false},{q:second,scope:'business',entityId:'',topicChoice:'organization.description',
      value:'',edited:false}];
  assert.deepEqual(propagateExact(ctx,rows,rows[0]),[rows[1]]);
  assert.equal(rows[2].value,'');assert.equal(rows[3].value,'');
  const otherTopic=[{...rows[0],topicChoice:'person.biography'},{...rows[1],value:''}];
  assert.deepEqual(propagateExact(ctx,otherTopic,otherTopic[0]),[]);
  const invalid=[{...rows[0],topicChoice:'organization.unknown'},{...rows[1],value:''}];
  assert.deepEqual(propagateExact(ctx,invalid,invalid[0]),[]);
});
