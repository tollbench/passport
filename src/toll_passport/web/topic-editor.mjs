// Copyright 2026 Steven Ochs and Tollbench. SPDX-License-Identifier: Apache-2.0
import { addEntry } from './vault.mjs';
import { TOPIC_CATALOG, topicDescriptor, localEntities, classificationFor, findTopicAnswer } from './topic-catalog.mjs';
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
export function mountTopicControls(root,row,{context,state,save,run}){
  const node=(tag,text)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;return e;};
  const draft=row.draft,q=row.q,box=node('div');box.className='topic-controls';
  const topicLabel=node('label'),topicCaption=node('span','Topic'),topic=node('select'),none=node('option','No topic');none.value='';topic.setAttribute('aria-label','Topic');topic.append(none);
  for(const d of TOPIC_CATALOG.filter(d=>context.matching.allowedRequestTypes.includes(d.requestType)&&d.supportedFormats.includes(q.format))){const o=node('option',d.label);o.value=d.requestType;topic.append(o);}
  topic.value=context.matching.requests.find(r=>r.questionId===q.id)?.requestType||'';
  topicCaption.className='topic-control-caption';topicLabel.append(topicCaption,topic);const remove=node('button','×');remove.setAttribute('aria-label','Remove topic');remove.type='button';remove.className='secondary topic-remove';
  const entityLabel=node('label'),entityCaption=node('span','About'),entity=node('select');entity.setAttribute('aria-label','About');entityCaption.className='topic-control-caption';entityLabel.append(entityCaption,entity);
  const create=node('details'),summary=node('summary','Add who this is about'),nameLabel=node('label','Name in your private book'),name=node('input');name.maxLength=120;name.type='text';nameLabel.append(name);
  const add=node('button','Add privately');add.type='button';create.append(summary,nameLabel,add);
  const source=node('details'),sourceTitle=node('summary','Saved answer source'),sourceText=node('p');source.append(sourceTitle,sourceText);source.hidden=true;
  const note=node('p');note.className='muted';box.append(topicLabel,remove,entityLabel,create,source,note);root.append(box);
  let autoValue=null,humanEdited=false,entityId='';
  function clearSource(){draft.source=null;source.hidden=true;sourceText.textContent='';}
  function entities(){const d=topicDescriptor(topic.value),doc=state().document;entity.replaceChildren();const empty=node('option',d?`Choose ${d.entityKind}`:'Choose who this is about');empty.value='';entity.append(empty);if(d&&doc)for(const e of localEntities(doc,d.entityKind)){const o=node('option',e.name);o.value=e.id;entity.append(o);}entity.value=entityId;entityLabel.hidden=!d;create.hidden=!d;remove.disabled=!topic.value;summary.textContent=d?`Add a ${d.entityKind} privately`:'Add privately';}
  function apply(){
    const doc=state().document;clearSource();
    if(autoValue!==null&&!humanEdited&&same(draft.value,autoValue)){row.setValue(q.format==='multiple_choice'?[]:'');}
    autoValue=null;draft.classification=doc?classificationFor(doc,context,q,topic.value,entityId,draft.reusable):null;
    note.textContent=draft.classification?`This tag is for ${localEntities(doc,topicDescriptor(topic.value).entityKind).find(e=>e.id===entityId).name}.`:'No tag. You can answer normally.';
    if(!draft.classification||humanEdited||!same(draft.value,q.format==='multiple_choice'?[]:''))return;
    const candidate=findTopicAnswer(doc,context,q,draft.classification);
    if(!candidate)return;
    autoValue=JSON.parse(JSON.stringify(candidate.value));row.setValue(autoValue);draft.source=candidate.provenance;
    sourceText.textContent=`Version ${candidate.provenance.version} · ${new Date(candidate.provenance.createdAt).toLocaleDateString()} · ${candidate.provenance.question}`;source.hidden=false;
  }
  topic.addEventListener('change',()=>{entityId='';entities();apply();});
  entity.addEventListener('change',()=>{entityId=entity.value;apply();});
  remove.addEventListener('click',()=>{topic.value='';entityId='';entities();apply();topic.focus();});
  add.addEventListener('click',()=>run(async()=>{
    const s=state(),d=topicDescriptor(topic.value),selected=topic.value,label=name.value.trim();
    if(!s.document||!d||!label||label.length>120)return;
    const next=addEntry(s.document,{kind:'passport.entity',title:label,fields:{entityKind:d.entityKind,name:label}}),created=next.entries.at(-1).id;
    await save(next);
    if(state().document?.vaultId!==s.document.vaultId||state().scope!==s.scope||topic.value!==selected)return;
    entityId=created;name.value='';create.open=false;entities();apply();
  }));
  entities();apply();
  return {edited(){humanEdited=true;autoValue=null;clearSource();},refresh(){entities();if(draft.classification&&!classificationFor(state().document,context,q,topic.value,entityId,draft.reusable))draft.classification=null;if(autoValue!==null&&!humanEdited){const hit=state().document&&findTopicAnswer(state().document,context,q,draft.classification);if(!hit||hit.provenance.entryId!==draft.source?.entryId||hit.provenance.version!==draft.source?.version||!same(hit.value,autoValue)){row.setValue(q.format==='multiple_choice'?[]:'');autoValue=null;clearSource();}}},clear(){humanEdited=true;autoValue=null;clearSource();draft.classification=null;note.textContent='No tag. You can answer normally.';}};
}
