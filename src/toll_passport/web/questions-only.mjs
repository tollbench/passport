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
const message=el('p','Connecting to Passport…','question-intro');
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
  let prepared=null,sent=false,busy=false,activeDialog=null,lastConnected=null;
  message.textContent='Answers save after you pause typing or leave a field. Wait for Saved before Send.';
  const books=el('section',undefined,'question-connect'),questions=el('section');
  const bookStatus=el('span','Passport · Connecting'),connectBook=el('button','Connect Passport','secondary'),
    unlockBook=el('button','Unlock this device','secondary');
  connectBook.type='button';unlockBook.type='button';
  connectBook.addEventListener('click',()=>host.openBook());
  unlockBook.addEventListener('click',async()=>{
    try {await session.unlockDevice();feedback.textContent='Device unlocked. Nothing has been sent.';}
    catch {feedback.textContent='This device could not reopen Passport. Use your recovery file.';}
  });
  books.append(bookStatus,connectBook,unlockBook);
  const feedback=el('p','', 'question-feedback');feedback.setAttribute('role','status');feedback.setAttribute('aria-live','polite');
  const review=el('button','Review and Send');review.type='button';
  const end=el('div',undefined,'question-actions');end.append(review);
  main.append(books,questions,feedback,end);

  const wantedScopes=()=>[...new Set(rows.map(r=>r.scope).concat(context.scope))];
  const state=scope=>session.getState(scope);
  async function renderBooks() {
    const needed=wantedScopes(),missing=needed.filter(scope=>!state(scope).document);
    const names=missing.map(scope=>scope==='business'?'Business':'Personal').join(' and ');
    bookStatus.textContent=missing.length?`Passport · Connect ${names}`:'Passport · Connected';
    connectBook.hidden=!missing.length;
    unlockBook.hidden=true;
    if (missing.length&&device&&host.storageIdentity) {
      try {unlockBook.hidden=!await device.isLocked(host.storageIdentity);} catch { /* Recovery remains available. */ }
    }
  }
  function scrubRow(row) {
    clearTimeout(row.timer);row.timer=null;row.generation++;row.dirty=false;row.saving=false;
    row.edited=false;row.hydrated=false;row.source=null;row.entityId='';row.topicRemoved=false;
    row.topicChoice=row.signedTopic;
    row.files=[];row.shareFiles=[];row.file.value='';row.fileList.replaceChildren();
    row.suggestions.replaceChildren();setValue(row,row.q.format==='multiple_choice'?[]:'');
    row.keep.checked=true;row.selected=true;row.reuse.checked=false;row.reusable=false;
    row.reuseLabel.hidden=true;row.status.textContent='';row.wasConnected=false;
    row.tagSummary.textContent=row.scope==='business'?'Business':'Personal';
    row.entity.replaceChildren();row.entityWrap.hidden=true;
    if(row.topicToggle)row.topicToggle.textContent='Remove topic';
    if(row.topicSelect)row.topicSelect.value=row.topicChoice||'';
    prepared=null;sent=false;
    if(activeDialog){activeDialog.dispatchEvent(new Event('cancel',{cancelable:true}));
      if(activeDialog.open)activeDialog.close();activeDialog.remove();activeDialog=null;}
  }
  function refresh() {
    void renderBooks();
    const connectedAll=wantedScopes().every(scope=>!!state(scope).document);
    if(connectedAll!==lastConnected){lastConnected=connectedAll;host.reportConnected(connectedAll);}
    for (const row of rows) {
      const connected=!!state(row.scope).document;
      if(!connected&&row.wasConnected)scrubRow(row);
      if(connected)row.wasConnected=true;
      row.section.classList.toggle('question-locked',!connected);
      row.form.inert=!connected;
      row.connect.hidden=connected;
      if (connected&&!row.hydrated) hydrate(row);
    }
    review.disabled=busy||sent||!connectedAll||rows.some(r=>r.dirty||r.saving);
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
    if (!document||row.edited)return;
    const saved=savedDraft(document,context,row.q,row.scope);
    row.hydrated=true;
    if (saved&&validValue(row.q,saved.fields.value)) {
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
      rowStatus(row,'Saved privately in your Passport. Nothing sent.');
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
        setValue(row,hit.value);row.source=hit.source;row.edited=true;
        updateReuse(row);
        const duplicates=propagateExact(context,rows,row);
        queueSave(row,true);rowStatus(row,'Answer chosen from Passport. Saving privately…');
        for(const other of duplicates){setValue(other,other.value);updateReuse(other);queueSave(other,true);}
      });item.append(source,value,button);row.suggestions.append(item);
    }
    if(hits.length>8)row.suggestions.append(el('small','Choose who in Tags to narrow the saved answers.'));
  }
  function queueSave(row,immediate=false) {
    row.dirty=true;row.status.textContent='Saving privately…';prepared=null;sent=false;
    clearTimeout(row.timer);row.timer=immediate?null:setTimeout(()=>void persistRow(row),700);refresh();
    if(immediate)void persistRow(row);
  }
  async function persistRow(row) {
    clearTimeout(row.timer);row.timer=null;
    if (!row.dirty)return;
    const generation=row.generation,scope=row.scope,q=row.q,value=structuredClone(row.value),
      selected=row.selected,reusable=row.reusable,subject=questionSubject(context,scope),
      entityId=row.entityId,source=row.source,topicRemoved=row.topicRemoved,topicChoice=row.topicChoice;
    row.dirty=false;row.saving=true;refresh();
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
      if (row.generation===generation&&!row.dirty) rowStatus(row,'Saved privately. Nothing sent.');
    } catch {
      if (row.generation===generation) {row.dirty=true;rowStatus(row,'Not saved. Your answer remains here; reconnect before sending.');}
    } finally {row.saving=false;refresh();}
  }
  async function flush() {
    for (const row of rows) {if(row.timer)clearTimeout(row.timer);await persistRow(row);}
    if (rows.some(r=>r.dirty||r.saving)) throw Error('not-saved');
  }
  async function setScope(row,next) {
    if (row.scope===next)return;
    await persistRow(row);
    if (row.dirty) {row.scopePicker.value=row.scope;return;}
    row.scope=next;row.generation++;row.hydrated=false;row.edited=false;row.entityId='';row.source=null;
    row.topicChoice=row.signedTopic;row.topicRemoved=false;
    if(row.topicSelect)row.topicSelect.value=row.topicChoice||'';
    setValue(row,row.q.format==='multiple_choice'?[]:'');rowStatus(row,'');
    row.tagSummary.textContent=next==='business'?'Business':'Personal';updateReuse(row);refresh();renderBooks();
  }
  function buildRow(q) {
    const scope=questionScope(context,q),section=el('section',undefined,'batch-question'),form=el('div'),
      connect=el('p','Connect the selected Passport book to answer privately.'),status=el('p','', 'muted'),
      suggestions=el('div',undefined,'question-suggestions');status.setAttribute('role','status');
    const signedTopic=context.matching?.requests.find(r=>r.questionId===q.id)?.requestType||null;
    const row={q,scope,section,form,connect,status,suggestions,signedTopic,topicChoice:signedTopic,
      value:q.format==='multiple_choice'?[]:'',
      selected:true,reusable:false,source:null,entityId:'',topicRemoved:false,edited:false,hydrated:false,dirty:false,
      saving:false,generation:0,timer:null,wasConnected:false};
    section.append(el('h2',q.title));
    section.append(el('p',`Asked by ${(q.recipients||[context.recipient]).map(r=>r.name).join(', ')}`,'muted'));
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
        row.entityId='';row.source=null;row.edited=true;
        if(row.topicToggle)row.topicToggle.textContent=row.topicChoice?'Remove topic':'Restore topic';
        renderEntities(row);updateReuse(row);renderSuggestions(row);queueSave(row,true);
      });
    }
    const entityWrap=el('label',descriptor?`About ${descriptor.entityKind}`:'About'),entity=el('select');
    row.entityWrap=entityWrap;row.entity=entity;entityWrap.append(entity);tags.append(entityWrap);
    if(descriptor){const toggle=el('button','Remove topic','secondary');toggle.type='button';row.topicToggle=toggle;
      toggle.addEventListener('click',()=>{row.topicRemoved=!row.topicRemoved;
        row.topicChoice=row.topicRemoved?null:row.signedTopic;row.topicSelect.value=row.topicChoice||'';
        row.entityId='';row.source=null;
        toggle.textContent=row.topicRemoved?'Restore topic':'Remove topic';renderEntities(row);
        updateReuse(row);renderSuggestions(row);queueSave(row,true);});tags.append(toggle);}
    entity.addEventListener('change',()=>{row.entityId=entity.value;row.source=null;row.edited=true;
      renderEntities(row);updateReuse(row);renderSuggestions(row);queueSave(row);});
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
          renderSuggestions(row);queueSave(row);
          rowStatus(row,'Saved who this is about privately. Nothing sent.');
        } catch {rowStatus(row,'Could not save who this is about. Your answers remain here.');}
      });
      addWho.append(name,add);tags.append(addWho);
    }
    if (['short_answer','written_response'].includes(q.format)) {
      const label=el('label','Your answer'),input=el('textarea');input.maxLength=2000;input.rows=3;
      label.append(input);form.append(label);row.input=input;
      input.addEventListener('input',()=>changed(row));input.addEventListener('blur',()=>void persistRow(row));
    } else {
      const options=q.format==='yes_no'?[{value:'yes',label:'Yes'},{value:'no',label:'No'}]:q.options;
      for (const option of options) {
        const label=el('label'),input=el('input');input.type=q.format==='multiple_choice'?'checkbox':'radio';
        input.name=`answer-${q.id}`;input.value=option.value;input.dataset.answerChoice='';
        label.append(input,document.createTextNode(option.label));form.append(label);
        input.addEventListener('change',()=>changed(row,true));
      }
    }
    form.append(suggestions);
    const keepLabel=el('label'),keep=el('input');keep.type='checkbox';keep.checked=true;
    keepLabel.append(keep,document.createTextNode(' Send this answer'));form.append(keepLabel);row.keep=keep;
    keep.addEventListener('change',()=>{row.selected=keep.checked;queueSave(row);});
    const reuseLabel=el('label'),reuse=el('input');reuse.type='checkbox';reuseLabel.hidden=true;
    reuseLabel.append(reuse,document.createTextNode(' Reuse for matching questions'));
    tags.append(reuseLabel);row.reuse=reuse;row.reuseLabel=reuseLabel;
    reuse.addEventListener('change',()=>{row.reusable=reuse.checked;queueSave(row);});
    const fileLabel=el('label','Add files privately'),file=el('input');file.type='file';file.multiple=true;
    const fileList=el('div');fileLabel.append(file);form.append(fileLabel,fileList);
    fileLabel.hidden=singleMode;row.files=[];row.shareFiles=[];row.file=file;row.fileList=fileList;
    const renderFiles=()=>{
      fileList.replaceChildren();
      row.files.forEach((item,index)=>{
        const label=el('label'),check=el('input');check.type='checkbox';check.checked=row.shareFiles.includes(index);
        label.append(check,document.createTextNode(` Send ${item.name}`));fileList.append(label);
        check.addEventListener('change',()=>{row.shareFiles=check.checked?[...row.shareFiles,index]:
          row.shareFiles.filter(i=>i!==index);prepared=null;
          if (check.checked&&row.input&&!row.value.trim()) {
            setValue(row,`Attached files: ${row.shareFiles.map(i=>row.files[i].name).join(', ')}`);
            row.edited=true;queueSave(row);
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
        renderFiles();rowStatus(row,'Files added privately. Select each file before Send.');prepared=null;
      } catch {rowStatus(row,'File not added. Use at most 3 supported files, 2 MiB each.');}
    });
    section.append(tags,connect,form,status);questions.append(section);
    return row;
  }
  function changed(row,immediate=false) {
    row.value=selectedValue(row);row.edited=true;row.source=null;
    updateReuse(row);
    const duplicates=propagateExact(context,rows,row);
    queueSave(row,immediate);
    for (const other of duplicates) {setValue(other,other.value);updateReuse(other);queueSave(other,immediate);}
  }
  rows.push(...context.questions.map(buildRow));
  host.reportViewReady('questions');
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
    await flush();
    const answers=rows.filter(r=>r.selected&&validValue(r.q,r.value)).map(r=>({id:r.q.id,
      value:structuredClone(r.value),files:structuredClone(r.files.filter((_,i)=>r.shareFiles.includes(i)))}));
    if (singleMode&&answers.length!==1) throw Error('invalid');
    if (!validateBatchAnswers(answers,context)) throw Error('invalid');
    const signature=JSON.stringify(answers);
    if (prepared?.signature===signature) {
      if (!prepared.bookStates.every(({scope,vaultId,revision})=>{
        const s=state(scope);return !s.uncertain&&s.document?.vaultId===vaultId&&s.document.revision===revision;
      })) throw Error('conflict');
      return prepared;
    }
    const refs=[];
    for (const row of rows.filter(r=>r.selected&&validValue(r.q,r.value))) {
      const scope=row.scope,q=row.q,doc=state(scope).document,draft=savedDraft(doc,context,q,scope),
        entry=doc?.entries.find(e=>e.id===draft?.fields.answerEntryId);
      if (!entry||entry.versions.at(-1).kind!=='answer'||
          JSON.stringify(entry.versions.at(-1).fields.value)!==JSON.stringify(row.value)) throw Error('not-saved');
      refs.push({scope,vaultId:doc.vaultId,entryId:entry.id,version:entry.versions.at(-1).version});
    }
    await session.saveToScope(context.scope,doc=>addEntry(doc,{kind:'answer_batch',
      title:context.purpose,fields:{requestId:context.requestId,taskId:context.taskId,
        selected:answers.map(a=>a.id),facts:refs}}));
    const approvedScopes=[...new Set([context.scope,...rows.filter(r=>r.selected&&validValue(r.q,r.value)).map(r=>r.scope)])];
    const bookStates=approvedScopes.map(scope=>({scope,vaultId:state(scope).document?.vaultId,
      revision:state(scope).document?.revision}));
    if (bookStates.some(s=>!s.vaultId)) throw Error('locked');
    return prepared={signature,answers,approvalId:crypto.randomUUID(),bookStates,attempted:false};
  }
  review.addEventListener('click',async()=>{
    if(busy||sent)return;busy=true;review.disabled=true;
    try {
      const result=await prepare();
      const dialog=el('dialog'),heading=el('h2','Review what will be sent'),list=el('div');
      for(const answer of result.answers) {
        const row=rows.find(row=>row.q.id===answer.id),q=row.q,doc=state(row.scope).document;
        const descriptor=topicDescriptor(row.topicChoice);
        const who=row.entityId&&descriptor?localEntities(doc,descriptor.entityKind).find(e=>e.id===row.entityId)?.name:null;
        const draft=savedDraft(doc,context,q,row.scope);
        const current=doc.entries.find(e=>e.id===draft?.fields.answerEntryId)?.versions.at(-1);
        const reused=current?.fields.reusedFrom;
        const source=reused&&doc.entries.find(e=>e.id===reused.entryId)?.versions.find(v=>v.version===reused.version);
        list.append(el('h3',q.title),el('p',Array.isArray(answer.value)?answer.value.join(', '):answer.value));
        list.append(el('p',`Saved in ${row.scope==='business'?'Business':'Personal'} Passport · About: ${who||'not specified'}`));
        list.append(el('p',`Saved source: ${source?.fields.question||source?.title||
          (reused?'unavailable':'your answer to this question')}`));
        list.append(el('p',`For ${(q.recipients||[context.recipient]).map(r=>r.name).join(', ')}`));
        for(const file of answer.files)list.append(el('p',`File: ${file.name}`));
      }
      if (!result.answers.length) list.append(el('p','No answers selected.'));
      const send=el('button','Send selected answers'),cancel=el('button','Keep private','secondary');
      send.type='button';cancel.type='button';dialog.append(heading,
        el('p','Only these answers and files leave Passport. Your other information stays private.'),list,send,cancel);
      main.append(dialog);activeDialog=dialog;dialog.showModal();cancel.focus();
      const approved=await new Promise(resolve=>{
        send.addEventListener('click',()=>resolve(true),{once:true});
        cancel.addEventListener('click',()=>resolve(false),{once:true});
        dialog.addEventListener('cancel',e=>{e.preventDefault();resolve(false);},{once:true});
      });if(dialog.open)dialog.close();dialog.remove();if(activeDialog===dialog)activeDialog=null;
      if (!approved)return;
      if (!result.bookStates.every(({scope,vaultId,revision})=>{
        const s=state(scope);return !s.uncertain&&s.document?.vaultId===vaultId&&s.document.revision===revision;
      })) throw Error('conflict');
      result.attempted=true;
      const receipt=await channel.release(result.answers,result.approvalId);
      sent=true;feedback.textContent=`Sent selected answers. Receipt ${receipt.receiptId}.`;
    } catch(error) {
      feedback.textContent=error.message==='unavailable'?'Delivery is not confirmed. Retry the same selected answers to check its receipt.':
        'Nothing was sent. Keep your answers here and reconnect any book that did not save.';
    } finally {busy=false;refresh();}
  });
}
