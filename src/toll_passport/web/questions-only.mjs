// Copyright 2026 Steven Ochs and Tollbench. SPDX-License-Identifier: Apache-2.0
// Questions live inside the isolated Passport origin. Only explicit release crosses to the host.
import {ALLOWED_PARENT_ORIGINS} from './client-policy.mjs';
import {connectHost} from './hosted-bridge.mjs';
import {connectBatchHost,validValue,validateBatchAnswers,fileBytes} from './question-batch-channel.mjs';
import {connectQuestionHost} from './question-channel.mjs';
import {createBookSession} from './book-session.mjs';
import {createDeviceMemory,indexedDbDeviceStorage} from './device-memory.mjs';
import {addEntry} from './vault.mjs';
import {classificationFor,localEntities,topicDescriptor} from './topic-catalog.mjs';
import {questionScope,questionSubject,propagateExact,savedDraft,exactSuggestions,entitySuggestions} from './unified-question-model.mjs';

document.body.classList.add('hosted-questions');
const main=document.querySelector('main');main.replaceChildren();
const el=(tag,text,cls)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e;};
const message=el('p','Loading questions…','question-intro');
main.append(message);
if (!ALLOWED_PARENT_ORIGINS.length) throw Error('Dedicated Passport origin is not configured.');
const hostPromise=connectHost(window,{expectedOrigins:ALLOWED_PARENT_ORIGINS});
const chosenPromise=Promise.any([
  connectBatchHost(window,{expectedOrigins:ALLOWED_PARENT_ORIGINS}).then(value=>{
    if (!value) throw Error('no-batch');return {kind:'batch',value};
  }),
  connectQuestionHost(window,{expectedOrigins:ALLOWED_PARENT_ORIGINS}).then(value=>{
    if (!value) throw Error('no-single');return {kind:'single',value};
  })
]).catch(()=>null);
const [host,chosen]=await Promise.all([hostPromise,chosenPromise]);
const singleMode=chosen?.kind==='single';
const channel=singleMode?{
  context:{...chosen.value.context,purpose:chosen.value.context.question.title,
    questions:[{...chosen.value.context.question,label:chosen.value.context.label,options:[]}]},
  release:(answers,approvalId)=>{
    if (answers.length!==1 || answers[0].files.length || typeof answers[0].value!=='string')
      throw Error('invalid');
    return chosen.value.release(answers[0].value,approvalId);
  }
}:chosen?.value||null;
if (!channel) {message.textContent='No current questions are available.';}
else {
  let device=null;
  try {device=createDeviceMemory(indexedDbDeviceStorage());} catch { /* Recovery remains available. */ }
  const context=channel.context,rows=[];
  if (!host.scopes.includes(context.scope) ||
      context.questions.some(q=>!host.scopes.includes(questionScope(context,q))))
    throw Error('Question book scope is unavailable.');
  const session=createBookSession(host,device,refresh);
  let prepared=null,sent=false,busy=false,lastConnected=null;
  message.remove();
  const books=el('section',undefined,'question-connect'),questions=el('section');
  const bookStatus=el('span','Passport'),connectBook=el('button','Connect Passport','secondary'),
    unlockBook=el('button','Unlock this device','secondary');
  connectBook.type='button';unlockBook.type='button';
  connectBook.addEventListener('click',()=>host.openBook());
  unlockBook.addEventListener('click',async()=>{
    try {await session.unlockDevice();feedback.textContent='Device unlocked. Nothing has been sent.';}
    catch {feedback.textContent='This device could not reopen Passport. Use your recovery file.';}
  });
  books.append(bookStatus,connectBook,unlockBook);
  const feedback=el('p','', 'question-feedback');feedback.setAttribute('role','status');feedback.setAttribute('aria-live','polite');
  const recipients=new Map(context.questions.flatMap(q=>(q.recipients||[context.recipient]).map(r=>[r.id,r.name])));
  const save=el('button','Save to Passport','secondary'),review=el('button',
    recipients.size===1?`Send to ${[...recipients.values()][0]}`:`Send to all ${recipients.size} agents`);
  review.dataset.questionSend='';
  save.type='button';review.type='button';
  const end=el('div',undefined,'question-actions');end.append(save,review);
  main.append(books,questions,feedback,end);

  const wantedScopes=()=>[...new Set(rows.map(r=>r.scope).concat(context.scope))];
  const state=scope=>session.getState(scope);
  async function renderBooks() {
    const needed=wantedScopes(),missing=needed.filter(scope=>!state(scope).document);
    const names=missing.map(scope=>scope==='business'?'Business':'Personal').join(' and ');
    bookStatus.textContent=missing.length?(missing.length===needed.length?'Passport · Not connected':`Passport · ${needed.filter(scope=>!missing.includes(scope)).map(scope=>scope==='business'?'Business':'Personal').join(' and ')} connected`):'Passport · Connected';
    connectBook.textContent=missing.length===needed.length?'Connect Passport':`Connect ${names}`;
    connectBook.hidden=!missing.length;
    unlockBook.hidden=true;
    if (missing.length&&device&&host.storageIdentity) {
      try {unlockBook.hidden=!await device.isLocked(host.storageIdentity);} catch { /* Recovery remains available. */ }
    }
  }
  function scrubRow(row) {
    // Only vault-derived answer bytes are removed. A manual draft is still
    // the person's current work, including edits made while disconnected.
    const privateValue=row.vaultScopes.some(scope=>!state(scope).document);
    row.generation++;row.saving=false;row.hydrated=false;
    row.source=null;row.entityId='';row.propagatedFrom=null;
    row.suggestions.replaceChildren();row.entity.replaceChildren();row.entityWrap.hidden=true;
    if(row.addWhoName)row.addWhoName.value='';
    row.reuse.checked=false;row.reusable=false;row.reuseLabel.hidden=true;
    row.tagSummary.textContent=row.scope==='business'?'Business':'Personal';
    if(privateValue){
      setValue(row,row.q.format==='multiple_choice'?[]:'');
      row.vaultScopes=[];row.edited=false;row.dirty=false;
      rowStatus(row,'Passport locked. Saved answer removed from this form.');
    }
    row.wasConnected=false;prepared=null;sent=false;
  }
  function refresh() {
    void renderBooks();
    const connectedAll=wantedScopes().every(scope=>!!state(scope).document);
    if(connectedAll!==lastConnected){lastConnected=connectedAll;host.reportConnected(connectedAll);}
    for (const row of rows) {
      const connected=!!state(row.scope).document;
      if((!connected&&row.wasConnected)||row.vaultScopes.some(scope=>!state(scope).document))scrubRow(row);
      if(connected)row.wasConnected=true;
      row.connect.hidden=true;
      if (connected&&!row.hydrated) hydrate(row);
      renderDisclosure(row);
    }
    save.disabled=busy||!rows.some(canSaveRow);
    review.disabled=busy||sent||rows.some(r=>r.saving);
  }
  function selectedValue(row) {
    if (['short_answer','written_response'].includes(row.q.format)) return row.input.value;
    if (row.q.format==='multiple_choice') return [...row.form.querySelectorAll('input[data-answer-choice]:checked')].map(e=>e.value);
    return row.form.querySelector('input[data-answer-choice]:checked')?.value||'';
  }
  function setValue(row,value) {
    row.value=structuredClone(value);
    if (row.input) row.input.value=value;
    else for (const input of row.form.querySelectorAll('input[data-answer-choice]'))
      input.checked=Array.isArray(value)?value.includes(input.value):value===input.value;
  }
  function rowStatus(row,text) {row.status.textContent=text;}
  function hydrate(row) {
    const document=state(row.scope).document;
    if (!document)return;
    const saved=savedDraft(document,context,row.q,row.scope);
    row.hydrated=true;
    if (!row.edited&&saved&&validValue(row.q,saved.fields.value)) {
      row.vaultScopes=[row.scope];
      setValue(row,saved.fields.value);row.selected=saved.fields.selected!==false;
      row.keep.checked=row.selected;row.reusable=!!saved.fields.reusable;row.reuse.checked=row.reusable;
      const linked=document.entries.find(e=>e.id===saved.fields.answerEntryId)?.versions.at(-1);
      row.source=linked?.kind==='answer'&&
        JSON.stringify(linked.fields.value)===JSON.stringify(saved.fields.value)?
        linked.fields.reusedFrom||null:null;
      row.entityId=saved.fields.entityId||'';
      row.topicRemoved=!!saved.fields.topicRemoved;
      const choice=saved.fields.topicChoice;
      row.topicChoice=row.topicRemoved?null:
        choice&&context.matching?.allowedRequestTypes.includes(choice)&&
        topicDescriptor(choice)?.supportedFormats.includes(row.q.format)?choice:row.signedTopic;
      if(row.topicSelect)row.topicSelect.value=row.topicChoice||'';
      if(row.topicToggle)row.topicToggle.textContent=row.topicRemoved?'Restore topic':'Remove topic';
      rowStatus(row,'Saved to Passport. Nothing sent.');
    }
    renderEntities(row);updateReuse(row);renderSuggestions(row);
  }
  function rowContext(row) {
    if(!context.matching)return context;
    return {...context,matching:{...context.matching,requests:context.matching.requests.map(request=>
      request.questionId===row.q.id?{...request,requestType:row.topicChoice}:request)}};
  }
  function renderEntities(row) {
    const descriptor=topicDescriptor(row.topicChoice);
    row.entityWrap.hidden=!descriptor;
    if (!descriptor) {row.entityId='';row.tagSummary.textContent=row.scope==='business'?'Business':'Personal';
      if(row.addWho)row.addWho.hidden=true;return;}
    const choices=state(row.scope).document?localEntities(state(row.scope).document,descriptor.entityKind):[];
    row.entity.replaceChildren();const blank=el('option',`Choose ${descriptor.entityKind}`);blank.value='';row.entity.append(blank);
    for (const choice of choices) {const option=el('option',choice.name);option.value=choice.id;row.entity.append(option);}
    if (!choices.some(c=>c.id===row.entityId)) row.entityId='';
    row.entity.value=row.entityId;
    row.tagSummary.textContent=`${row.scope==='business'?'Business':'Personal'} · ${descriptor.label}${row.entityId?' · '+(choices.find(c=>c.id===row.entityId)?.name||''):''}`;
    if(row.addWho){row.addWho.hidden=false;row.addWhoName.placeholder=`Name of ${descriptor.entityKind}`;}
  }
  function updateReuse(row) {
    const document=state(row.scope).document,
      request=rowContext(row).matching?.requests.find(r=>r.questionId===row.q.id);
    const classified=document&&request?.requestType&&row.entityId&&validValue(row.q,row.value)&&
      classificationFor(document,{...rowContext(row),subject:questionSubject(context,row.scope)},row.q,
        request.requestType,row.entityId,true);
    row.reusable=!!classified;row.reuse.checked=row.reusable;row.reuseLabel.hidden=!classified;
  }
  function renderSuggestions(row) {
    row.suggestions.replaceChildren();
    const document=state(row.scope).document;
    if (!document)return;
    const own=savedDraft(document,context,row.q,row.scope)?.fields.answerEntryId;
    const local=row.topicRemoved?{...context,matching:null}:rowContext(row);
    const hits=(row.topicChoice?entitySuggestions(document,local,row.q,row.scope,{entityId:row.entityId}):
      exactSuggestions(document,local,row.topicRemoved?{...row.q,label:null}:row.q,row.scope))
      .filter(hit=>hit.source.entryId!==own);
    if (!hits.length)return;
    row.suggestions.append(el('strong','From your Passport'));
    for (const hit of hits.slice(0,8)) {
      const item=el('div',undefined,'question-suggestion'),value=el('p',
        Array.isArray(hit.value)?hit.value.join(', '):hit.value),button=el('button','Use answer','secondary');
      const source=el('small',`Saved answer · ${hit.entity?'About '+hit.entity.name+' · ':''}${hit.source.question||row.q.title}`,'question-source');
      button.type='button';button.addEventListener('click',()=>{
        if(hit.entity){row.entityId=hit.entity.id;row.entity.value=hit.entity.id;renderEntities(row);}
        setValue(row,hit.value);row.source=hit.source;row.edited=true;row.vaultScopes=[row.scope];
        updateReuse(row);
        const duplicates=propagateExact(context,rows,row);
        markUnsaved(row);
        for(const other of duplicates){other.vaultScopes=[...row.vaultScopes];setValue(other,other.value);updateReuse(other);markUnsaved(other);}
      });item.append(source,value,button);row.suggestions.append(item);
    }
    if(hits.length>8)row.suggestions.append(el('small','Choose who in Tags to narrow the saved answers.'));
  }
  function markUnsaved(row) {
    row.generation++;row.dirty=true;rowStatus(row,'Not saved to Passport. Only in this form.');
    prepared=null;sent=false;refresh();
  }
  function canSaveRow(row) {
    return !!state(row.scope).document&&row.dirty&&(validValue(row.q,row.value)||
      !!savedDraft(state(row.scope).document,context,row.q,row.scope));
  }
  async function persistRow(row) {
    if (!canSaveRow(row))return;
    const generation=row.generation,scope=row.scope,q=row.q,value=structuredClone(row.value),
      selected=row.selected,reusable=row.reusable,subject=questionSubject(context,scope),
      entityId=row.entityId,source=row.source,topicRemoved=row.topicRemoved,topicChoice=row.topicChoice;
    row.saving=true;rowStatus(row,'Saving to Passport…');refresh();
    try {
      await session.saveToScope(scope,doc=>{
        const prior=savedDraft(doc,context,q,scope),local=rowContext({...row,topicChoice}),
          request=local.matching?.requests.find(r=>r.questionId===q.id),
          classified=request?.requestType&&entityId?classificationFor(doc,{...local,subject},q,
            request.requestType,entityId,reusable):null;
        const existing=prior?.fields.answerEntryId&&doc.entries.find(e=>e.id===prior.fields.answerEntryId&&
          e.versions.at(-1).kind==='answer');
        const answer=addEntry(doc,{...(existing?{id:existing.id}:{}),kind:'answer',title:q.title,
          fields:{question:q.title,answer:Array.isArray(value)?value.join(', '):value,
            value,subject,scope:classified&&reusable?'reusable':'task',taskId:context.taskId,
            label:context.matching?'':q.label||'',questionDigest:q.digest,answerOptions:q.options,
            ...(classified?{classification:classified}:{}),...(source?{reusedFrom:source}:{})},
          tags:q.label&&!context.matching?[q.label]:[]});
        const answerEntryId=existing?.id||answer.entries.at(-1).id;
        const fields={requestId:context.requestId,taskId:context.taskId,questionId:q.id,
          questionDigest:q.digest,answerFormat:q.format,answerOptions:q.options,subject,
          bookScope:scope,value,selected,reusable,entityId,topicRemoved,topicChoice,answerEntryId};
        return addEntry(answer,{...(prior?{id:prior.entryId}:{}),kind:'answer_draft',title:q.title,fields});
      });
      if (row.generation===generation) {
        row.dirty=false;rowStatus(row,'Saved to Passport. Nothing sent.');
      } else if (row.dirty) rowStatus(row,'Changed while saving. Save again.');
    } catch {
      if (row.generation===generation) rowStatus(row,'Not saved to Passport. Your answer remains in this form.');
    } finally {row.saving=false;refresh();}
  }
  save.addEventListener('click',async()=>{
    if(busy)return;busy=true;refresh();
    try {
      const eligible=rows.filter(canSaveRow).map(row=>({row,generation:row.generation}));
      for (const {row,generation} of eligible)
        if(row.generation===generation)await persistRow(row);
      feedback.textContent=rows.some(row=>row.dirty)?
        'Some answers were not saved. They remain in this form.':'Saved to Passport. Nothing sent.';
    } finally {busy=false;refresh();}
  });
  async function setScope(row,next) {
    if (row.scope===next)return;
    row.scope=next;row.hydrated=true;row.edited=true;row.entityId='';row.source=null;row.propagatedFrom=null;
    row.topicChoice=row.signedTopic;row.topicRemoved=false;
    if(row.topicSelect)row.topicSelect.value=row.topicChoice||'';
    row.tagSummary.textContent=next==='business'?'Business':'Personal';
    renderEntities(row);updateReuse(row);renderSuggestions(row);markUnsaved(row);renderBooks();
  }
  function buildRow(q) {
    const scope=questionScope(context,q),section=el('section',undefined,'batch-question'),form=el('div'),
      connect=el('p',''),status=el('p','', 'muted'),
      suggestions=el('div',undefined,'question-suggestions');status.setAttribute('role','status');
    const signedTopic=context.matching?.requests.find(r=>r.questionId===q.id)?.requestType||null;
    const row={q,scope,section,form,connect,status,suggestions,signedTopic,topicChoice:signedTopic,
      value:q.format==='multiple_choice'?[]:'',
      selected:true,reusable:false,source:null,entityId:'',topicRemoved:false,edited:false,hydrated:false,dirty:false,
      saving:false,generation:0,propagatedFrom:null,wasConnected:false,vaultScopes:[]};
    const heading=el('h2',q.title);heading.id=`question-${q.id}`;section.append(heading);
    row.disclosure=el('p','', 'question-source');
    const tags=el('details',undefined,'question-tags'),tagSummary=el('summary',scope==='business'?'Business':'Personal');
    row.tagSummary=tagSummary;tags.append(tagSummary);
    const scopeLabel=el('label','Save in'),scopePicker=el('select');row.scopePicker=scopePicker;
    for (const value of context.bookSubjects?host.scopes:[context.scope]) {
      const option=el('option',value==='personal'?'Personal':'Business');option.value=value;scopePicker.append(option);
    }
    scopePicker.value=scope;scopeLabel.append(scopePicker);tags.append(scopeLabel);
    scopePicker.addEventListener('change',()=>void setScope(row,scopePicker.value));
    const descriptor=topicDescriptor(signedTopic);
    if(context.matching){
      const topicLabel=el('label','Topic'),topicSelect=el('select');row.topicSelect=topicSelect;
      const none=el('option','No topic');none.value='';topicSelect.append(none);
      for(const id of context.matching.allowedRequestTypes){
        const choice=topicDescriptor(id);if(!choice?.supportedFormats.includes(q.format))continue;
        const option=el('option',choice.label);option.value=id;topicSelect.append(option);
      }
      topicSelect.value=signedTopic||'';topicLabel.append(topicSelect);tags.append(topicLabel);
      topicSelect.addEventListener('change',()=>{
        row.topicChoice=topicSelect.value||null;row.topicRemoved=!row.topicChoice;
        row.entityId='';row.source=null;row.propagatedFrom=null;row.edited=true;
        if(row.topicToggle)row.topicToggle.textContent=row.topicChoice?'Remove topic':'Restore topic';
        renderEntities(row);updateReuse(row);renderSuggestions(row);markUnsaved(row);
      });
    }
    const entityWrap=el('label',descriptor?`About ${descriptor.entityKind}`:'About'),entity=el('select');
    row.entityWrap=entityWrap;row.entity=entity;entityWrap.append(entity);tags.append(entityWrap);
    if(descriptor){const toggle=el('button','Remove topic','secondary');toggle.type='button';row.topicToggle=toggle;
      toggle.addEventListener('click',()=>{row.topicRemoved=!row.topicRemoved;
        row.topicChoice=row.topicRemoved?null:row.signedTopic;row.topicSelect.value=row.topicChoice||'';
        row.entityId='';row.source=null;row.propagatedFrom=null;
        toggle.textContent=row.topicRemoved?'Restore topic':'Remove topic';renderEntities(row);
        updateReuse(row);renderSuggestions(row);markUnsaved(row);});tags.append(toggle);}
    entity.addEventListener('change',()=>{row.entityId=entity.value;row.source=null;row.propagatedFrom=null;row.edited=true;
      renderEntities(row);updateReuse(row);renderSuggestions(row);markUnsaved(row);});
    if (context.matching?.allowedRequestTypes.some(id=>topicDescriptor(id)?.supportedFormats.includes(q.format))) {
      const addWho=el('div',undefined,'question-add-who'),name=el('input'),add=el('button','Add privately','secondary');
      row.addWho=addWho;row.addWhoName=name;addWho.hidden=!descriptor;
      name.type='text';name.maxLength=120;name.placeholder=descriptor?`Name of ${descriptor.entityKind}`:'Name';add.type='button';
      add.addEventListener('click',async()=>{
        const selectedDescriptor=topicDescriptor(row.topicChoice);if(!selectedDescriptor)return;
        const value=name.value.trim();if(!value)return;
        try {
          let id;
          await session.saveToScope(row.scope,doc=>{
            const next=addEntry(doc,{kind:'passport.entity',title:value,
              fields:{entityKind:selectedDescriptor.entityKind,name:value}});
            id=next.entries.at(-1).id;return next;
          });
          row.entityId=id;row.edited=true;name.value='';renderEntities(row);updateReuse(row);
          renderSuggestions(row);markUnsaved(row);
          rowStatus(row,'Who this is about was saved. Answer not saved to Passport.');
        } catch {rowStatus(row,'Could not save who this is about. Your answers remain here.');}
      });
      addWho.append(name,add);tags.append(addWho);
    }
    if (['short_answer','written_response'].includes(q.format)) {
      const label=el('label','Your answer'),input=el('textarea');input.maxLength=2000;input.rows=3;input.setAttribute('aria-labelledby',heading.id);
      label.append(input);form.append(label);row.input=input;
      input.addEventListener('input',()=>changed(row));
    } else {
      const options=q.format==='yes_no'?[{value:'yes',label:'Yes'},{value:'no',label:'No'}]:q.options;
      for (const option of options) {
        const label=el('label'),input=el('input');input.type=q.format==='multiple_choice'?'checkbox':'radio';
        input.name=`answer-${q.id}`;input.value=option.value;input.dataset.answerChoice='';
        label.append(input,document.createTextNode(option.label));form.append(label);
        input.addEventListener('change',()=>changed(row));
      }
    }
    form.append(suggestions,tags,row.disclosure);
    const keepLabel=el('label'),keep=el('input');keep.type='checkbox';keep.checked=true;
    keepLabel.append(keep,document.createTextNode(' Send this answer'));form.append(keepLabel);row.keep=keep;
    keep.addEventListener('change',()=>{row.selected=keep.checked;markUnsaved(row);});
    const reuseLabel=el('label'),reuse=el('input');reuse.type='checkbox';reuseLabel.hidden=true;
    reuseLabel.append(reuse,document.createTextNode(' Reuse for matching questions'));
    tags.append(reuseLabel);row.reuse=reuse;row.reuseLabel=reuseLabel;
    reuse.addEventListener('change',()=>{row.reusable=reuse.checked;markUnsaved(row);});
    const fileLabel=el('button','Attach files','secondary question-attach'),file=el('input');fileLabel.type='button';file.type='file';file.multiple=true;file.hidden=true;
    fileLabel.addEventListener('click',()=>file.click());
    const fileList=el('div');form.append(fileLabel,file,fileList);
    fileLabel.hidden=singleMode;row.files=[];row.shareFiles=[];row.file=file;row.fileList=fileList;
    const renderFiles=()=>{
      fileList.replaceChildren();
      row.files.forEach((item,index)=>{
        const label=el('label'),check=el('input');check.type='checkbox';check.checked=row.shareFiles.includes(index);
        label.append(check,document.createTextNode(` Send ${item.name}`));fileList.append(label);
        check.addEventListener('change',()=>{row.shareFiles=check.checked?[...row.shareFiles,index]:
          row.shareFiles.filter(i=>i!==index);markUnsaved(row);
          if (check.checked&&row.input&&!row.value.trim()) {
            setValue(row,`Attached files: ${row.shareFiles.map(i=>row.files[i].name).join(', ')}`);
            row.edited=true;markUnsaved(row);
          }
        });
      });
    };
    file.addEventListener('change',async()=>{
      const selected=[...file.files];file.value='';
      try {
        for (const item of selected) {
          if (item.size>2*1024*1024||row.files.length>=3) throw Error('invalid');
          const bytes=new Uint8Array(await item.arrayBuffer());let text='';
          for(let offset=0;offset<bytes.length;offset+=8192)
            text+=String.fromCharCode(...bytes.subarray(offset,offset+8192));
          const entry={name:item.name,type:item.type,data:btoa(text)};
          if (fileBytes(entry)===null) throw Error('invalid');
          row.files.push(entry);
        }
        renderFiles();markUnsaved(row);rowStatus(row,'Files added to this form. Select each file before Send.');
      } catch {rowStatus(row,'File not added. Use at most 3 supported files, 2 MiB each.');}
    });
    section.append(form,status);questions.append(section);
    return row;
  }
  function changed(row) {
    row.value=selectedValue(row);
    if(row.value===''||Array.isArray(row.value)&&!row.value.length)row.vaultScopes=[];
    row.edited=true;row.source=null;row.propagatedFrom=null;
    updateReuse(row);
    const duplicates=propagateExact(context,rows,row);
    markUnsaved(row);
    for (const other of duplicates) {other.vaultScopes=[...row.vaultScopes];setValue(other,other.value);updateReuse(other);markUnsaved(other);}
  }
  rows.push(...context.questions.map(buildRow));
  let localInteraction=false;
  for(const event of ['input','change','click'])main.addEventListener(event,()=>{localInteraction=true;});
  channel.setDraftHandler?.(answers=>{
    if(localInteraction||busy||sent)return false;
    for(const answer of answers){
      const row=rows.find(row=>row.q.id===answer.id);
      setValue(row,answer.value);row.edited=true;row.hydrated=true;row.source=null;
      row.vaultScopes=[];row.propagatedFrom=null;row.entityId='';row.selected=true;row.keep.checked=true;
      renderEntities(row);updateReuse(row);
      markUnsaved(row);
    }
    return true;
  });
  if(await host.reportQuestionUI())host.reportViewReady('questions');
  await Promise.all(host.scopes.map(scope=>session.load(scope).catch(()=>{})));
  refresh();
  let lastRecheck=0;
  const recheck=()=>{
    if (Date.now()-lastRecheck<1000)return;lastRecheck=Date.now();
    for(const scope of wantedScopes())if(!state(scope).document)
      void session.load(scope).catch(()=>{});
  };
  window.addEventListener('focus',recheck);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)recheck();});
  host.setControlHandler(async(command)=>{
    if (command==='lock-all') {await session.lockAll();prepared=null;sent=false;feedback.textContent='Passport locked.';return true;}
    return false;
  });
  async function prepare() {
    if (Date.now()>=context.expiresAt && !prepared?.attempted) throw Error('expired');
    if (rows.some(r=>r.saving)) throw Error('saving');
    const answers=rows.filter(r=>r.selected&&validValue(r.q,r.value)).map(r=>({id:r.q.id,
      value:structuredClone(r.value),files:structuredClone(r.files.filter((_,i)=>r.shareFiles.includes(i)))}));
    if (singleMode&&answers.length!==1) throw Error('invalid');
    if (!validateBatchAnswers(answers,context)) throw Error('invalid');
    const signature=JSON.stringify(answers);
    const rowStates=rows.map(r=>({id:r.q.id,generation:r.generation}));
    if (prepared?.signature===signature) {
      if (!prepared.rowStates.every(({id,generation})=>
        rows.find(r=>r.q.id===id)?.generation===generation)) throw Error('conflict');
      if (!prepared.bookStates.every(({scope,vaultId,revision})=>{
        const s=state(scope);return !s.uncertain&&s.document?.vaultId===vaultId&&s.document.revision===revision;
      })) throw Error('conflict');
      return prepared;
    }
    const approvedScopes=[...new Set(rows.filter(r=>r.selected&&validValue(r.q,r.value)).flatMap(r=>r.vaultScopes))];
    const bookStates=approvedScopes.map(scope=>({scope,vaultId:state(scope).document?.vaultId,
      revision:state(scope).document?.revision}));
    if (bookStates.some(s=>!s.vaultId)) throw Error('locked');
    return prepared={signature,answers,approvalId:crypto.randomUUID(),bookStates,rowStates,attempted:false};
  }
  function renderDisclosure(row) {
    const doc=state(row.scope).document,descriptor=topicDescriptor(row.topicChoice);
    const who=doc&&row.entityId&&descriptor?localEntities(doc,descriptor.entityKind).find(e=>e.id===row.entityId)?.name:null;
    const reused=row.source,source=reused&&doc?.entries.find(e=>e.id===reused.entryId)?.versions.find(v=>v.version===reused.version);
    const origin=source?.fields.question||source?.title||(row.vaultScopes.length?'saved answer':'your answer');
    row.disclosure.textContent=`For ${(row.q.recipients||[context.recipient]).map(r=>r.name).join(', ')} · Source: ${origin}${who?' · About '+who:''}`;
  }
  review.addEventListener('click',async()=>{
    if(busy||sent)return;busy=true;questions.inert=true;refresh();
    try {
      // The current fields, selected files, source/subject and named recipients
      // are the review. This explicit Send is the only plaintext release.
      const result=await prepare();
      if (!result.bookStates.every(({scope,vaultId,revision})=>{
        const s=state(scope);return !s.uncertain&&s.document?.vaultId===vaultId&&s.document.revision===revision;
      })) throw Error('conflict');
      if (!result.rowStates.every(({id,generation})=>
        rows.find(r=>r.q.id===id)?.generation===generation)) throw Error('conflict');
      result.attempted=true;
      const receipt=await channel.release(result.answers,result.approvalId);
      sent=true;feedback.textContent=`Sent selected answers. Receipt ${receipt.receiptId}.`;
    } catch(error) {
      feedback.textContent=error.message==='unavailable'?'Delivery is not confirmed. Retry Send to check its receipt.':
        'Nothing was sent. Check your answers and try again.';
    } finally {busy=false;questions.inert=false;refresh();}
  });
}
