// Copyright 2026 Steven Ochs and Tollbench. SPDX-License-Identifier: Apache-2.0
import { addEntry } from './vault.mjs';
import { TOPIC_CATALOG, topicDescriptor, localEntities, classificationFor, findTopicAnswer, findTopicCandidates } from './topic-catalog.mjs';
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
export function mountTopicControls(root,row,{context,state,save,run,onChange=()=>{}}){
  const node=(tag,text)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;return e;};
  const draft=row.draft,q=row.q,box=node('details');box.className='topic-controls';
  const chip=node('summary'),body=node('div');chip.className='topic-chip';box.append(chip,body);
  const topicLabel=node('label','Topic'),topic=node('select'),none=node('option','No topic');none.value='';topic.setAttribute('aria-label','Topic');topic.append(none);
  for(const d of TOPIC_CATALOG.filter(d=>context.matching.allowedRequestTypes.includes(d.requestType)&&d.supportedFormats.includes(q.format))){const o=node('option',d.label);o.value=d.requestType;topic.append(o);}
  topic.value=context.matching.requests.find(r=>r.questionId===q.id)?.requestType||'';
  topicLabel.append(topic);
  const remove=node('button','Remove topic');remove.type='button';remove.className='secondary';
  const entityLabel=node('label','About'),entity=node('select');entity.setAttribute('aria-label','About');entityLabel.append(entity);
  const create=node('details'),summary=node('summary','Add who this is about'),nameLabel=node('label','Name in your private book'),name=node('input');name.maxLength=120;name.type='text';nameLabel.append(name);
  const add=node('button','Add privately');add.type='button';create.append(summary,nameLabel,add);
  const source=node('div'),sourceTitle=node('strong','Saved answer source'),sourceText=node('p');source.append(sourceTitle,sourceText);source.hidden=true;
  const choices=node('div'),clear=node('button','Clear this answer');clear.type='button';clear.className='secondary';
  const note=node('p');note.className='muted';body.append(source,choices,clear,topicLabel,entityLabel,create,remove);root.append(box,note);
  let autoValue=null,humanEdited=false,entityId='',removed=false,explicitSource=false,entityChosen=false;
  const empty=()=>q.format==='multiple_choice'?[]:'';
  const currentEntities=()=>{const d=topicDescriptor(topic.value),doc=state().document;return d&&doc?localEntities(doc,d.entityKind):[];};
  function clearSource(){draft.source=null;source.hidden=true;sourceText.textContent='';onChange();}
  function entities(){
    const d=topicDescriptor(topic.value),items=currentEntities();
    if(entityId&&(!items.some(e=>e.id===entityId)||!entityChosen&&items.length!==1))entityId='';
    // Only one entity of the declared kind is unambiguous. Never infer it by name.
    if(!entityId&&!removed&&items.length===1)entityId=items[0].id;
    entity.replaceChildren();const blank=node('option',d?`Choose ${d.entityKind}`:'Choose who this is about');blank.value='';entity.append(blank);
    for(const e of items){const o=node('option',e.name);o.value=e.id;entity.append(o);}entity.value=entityId;
    entityLabel.hidden=!d;create.hidden=!d;remove.disabled=!topic.value;summary.textContent=d?`Add a ${d.entityKind} privately`:'Add privately';
  }
  function use(candidate,explicit=false){
    explicitSource=explicit;if(explicit)entityChosen=true;
    humanEdited=false;autoValue=JSON.parse(JSON.stringify(candidate.value));row.setValue(autoValue);draft.source=candidate.provenance;
    sourceText.textContent=`${Array.isArray(candidate.value)?candidate.value.join(', '):candidate.value} · Version ${candidate.provenance.version} · ${new Date(candidate.provenance.createdAt).toLocaleDateString()} · ${candidate.provenance.question}`;source.hidden=false;
    note.textContent='Filled from Passport. You can change this answer.';onChange();
  }
  function describe(){
    const d=topicDescriptor(topic.value),who=currentEntities().find(e=>e.id===entityId);
    chip.textContent=d?`${d.label} · ${who?.name||'Choose saved answer'}`:'No topic · Answer normally';
    choices.replaceChildren();
    const classified=draft.classification,doc=state().document;
    if(!d){note.textContent='No topic supplied. Answer normally, or choose a topic.';return;}
    if(!classified){note.textContent=currentEntities().length>1?'Choose who this answer is about.':'No saved answer. You can answer normally.';return;}
    const candidates=findTopicCandidates(doc,context,q,classified).filter(c=>c.eligible);
    for(const c of candidates){const entry=node('div'),words=node('p',`${Array.isArray(c.value)?c.value.join(', '):c.value} — ${c.provenance.question}`),button=node('button','Use this saved answer');button.type='button';button.className='secondary';button.addEventListener('click',()=>{use(c,true);box.open=false;});entry.append(words,button);choices.append(entry);}
    if(!draft.source)note.textContent=humanEdited?'Your answer will be sent as written.':candidates.length>1?'Choose a saved answer, or write your own.':candidates.length?'Saved answer available in the topic menu.':'No matching saved answer. You can answer normally.';
  }
  function apply(){
    const doc=state().document;clearSource();
    if(autoValue!==null&&!humanEdited&&same(draft.value,autoValue))row.setValue(empty());
    autoValue=null;draft.classification=doc?classificationFor(doc,context,q,topic.value,entityId,draft.reusable):null;
    describe();
    if(!draft.classification||humanEdited||!same(draft.value,empty()))return;
    const candidate=findTopicAnswer(doc,context,q,draft.classification);if(candidate)use(candidate);
  }
  topic.addEventListener('change',()=>{entityId='';entityChosen=false;removed=false;entities();apply();});
  entity.addEventListener('change',()=>{entityId=entity.value;entityChosen=!!entityId;removed=!entityId;apply();});
  remove.addEventListener('click',()=>{topic.value='';entityId='';removed=true;entities();apply();});
  clear.addEventListener('click',()=>{humanEdited=true;autoValue=null;row.setValue(empty());clearSource();note.textContent='Answer cleared. You can type a new answer or choose a saved one.';box.open=false;});
  add.addEventListener('click',()=>run(async()=>{
    const s=state(),d=topicDescriptor(topic.value),selected=topic.value,label=name.value.trim();if(!s.document||!d||!label||label.length>120)return;
    const next=addEntry(s.document,{kind:'passport.entity',title:label,fields:{entityKind:d.entityKind,name:label}}),created=next.entries.at(-1).id;
    await save(next);if(state().document?.vaultId!==s.document.vaultId||state().scope!==s.scope||topic.value!==selected)return;
    entityId=created;entityChosen=true;removed=false;name.value='';create.open=false;entities();apply();
  }));
  entities();apply();
  return {
    edited(){humanEdited=true;autoValue=null;clearSource();note.textContent='Your edited answer will be sent.';},
    refresh(){
      entities();const valid=classificationFor(state().document,context,q,topic.value,entityId,draft.reusable);draft.classification=valid;
      if(autoValue!==null&&!humanEdited){const candidates=findTopicCandidates(state().document,context,q,valid);const hit=(explicitSource?candidates:candidates.length===1?candidates:[]).find(c=>c.eligible&&c.provenance.entryId===draft.source?.entryId&&c.provenance.version===draft.source?.version&&same(c.value,autoValue));if(!hit){row.setValue(empty());autoValue=null;clearSource();}}
      describe();if(!humanEdited&&autoValue===null&&same(draft.value,empty())){const hit=findTopicAnswer(state().document,context,q,valid);if(hit)use(hit);}
    },
    clear(){humanEdited=true;autoValue=null;clearSource();draft.classification=null;topic.value='';entityId='';removed=true;entities();describe();}
  };
}
