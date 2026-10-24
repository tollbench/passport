// Copyright 2026 Steven Ochs and Tollbench. SPDX-License-Identifier: Apache-2.0
import {validValue} from './question-batch-channel.mjs';
import {classificationFor,findTopicCandidates,localEntities,topicDescriptor} from './topic-catalog.mjs';
import {canonicalAnswerLabel,findAnswerCandidates} from './answers.mjs';

export function questionScope(context, question, choice = null) {
  const scope = choice || question.bookScope || context.scope;
  if (!['personal','business'].includes(scope) ||
      scope !== context.scope && !context.bookSubjects) throw Error('invalid');
  return scope;
}
export function questionSubject(context, scope) {
  if (scope === context.scope) return context.subject;
  const subject = context.bookSubjects?.[scope];
  if (typeof subject !== 'string' || !subject) throw Error('invalid');
  return subject;
}
const request = (context,q) => context.matching?.requests.find(r=>r.questionId===q.id) || null;
const normalizedQuestion = value => value.trim().replace(/\s+/g,' ').toLowerCase();
export function duplicateKey(context,q,scope,entityId='',topicRemoved=false,topicChoice=undefined) {
  const signed=request(context,q),r=topicRemoved?null:
    topicChoice===undefined?signed:topicChoice?{...signed,requestType:topicChoice}:null;
  if(topicChoice && (!context.matching?.allowedRequestTypes.includes(topicChoice)||
      !topicDescriptor(topicChoice)?.supportedFormats.includes(q.format)))return null;
  if(r?.requestType&&!entityId)return null;
  const recipients=(q.recipients||[context.recipient]).map(r=>r.id).sort();
  return JSON.stringify([scope,questionSubject(context,scope),q.format,q.options,
    r?.requestType ? ['topic',r.requestType,r.contextKey||null,entityId] :
      ['question',normalizedQuestion(q.title),recipients]]);
}
export function propagateExact(context,rows,source) {
  if (!validValue(source.q,source.value)) return [];
  const key=duplicateKey(context,source.q,source.scope,source.entityId,source.topicRemoved,source.topicChoice);
  if(key===null)return [];
  const changed=[];
  for (const row of rows) {
    if (row===source || row.edited || row.value !== '' &&
        !(Array.isArray(row.value)&&row.value.length===0) ||
        duplicateKey(context,row.q,row.scope,row.entityId,row.topicRemoved,row.topicChoice)!==key ||
        !validValue(row.q,source.value)) continue;
    row.value=structuredClone(source.value);
    row.propagatedFrom=source.q.id;
    changed.push(row);
  }
  return changed;
}
export function savedDraft(document,context,q,scope) {
  if (!document) return null;
  const subject=questionSubject(context,scope);
  const rows=document.entries.filter(e=>{
    const v=e.versions.at(-1),f=v.fields;
    return v.kind==='answer_draft'&&f.taskId===context.taskId&&
      f.questionDigest===q.digest&&f.subject===subject&&f.bookScope===scope&&
      f.answerFormat===q.format&&JSON.stringify(f.answerOptions)===JSON.stringify(q.options);
  });
  if (rows.length!==1) return null; // competing drafts require explicit review
  const version=rows[0].versions.at(-1);
  return {entryId:rows[0].id,fields:version.fields,version:version.version};
}
export function exactSuggestions(document,context,q,scope,{entityId=''}={}) {
  if (!document) return [];
  const subject=questionSubject(context,scope),r=request(context,q);
  if (r?.requestType) {
    if (!entityId)return [];
    const classified=classificationFor(document,{...context,subject},q,r.requestType,entityId);
    return findTopicCandidates(document,{...context,subject},q,classified).filter(c=>c.eligible)
      .map(c=>({value:structuredClone(c.value),source:{...c.provenance}}));
  }
  if (canonicalAnswerLabel(q.label)) return findAnswerCandidates(document,{label:q.label,subject,
    scope:'task',taskId:context.taskId}).filter(c=>validValue(q,c.answer))
    .map(c=>({value:c.answer,source:{...c.provenance}}));
  const result=[];
  for (const e of document.entries) {
    const v=e.versions.at(-1),f=v.fields,c=f.classification;
    // Older library answers have `answer` only. Treat them as text, never as
    // a choice value whose signed option set was not recorded.
    const value=Object.hasOwn(f,'value')?f.value:
      ['short_answer','written_response'].includes(q.format)&&typeof f.answer==='string'?f.answer:null;
    if (v.kind!=='answer'||f.subject!==subject||
        normalizedQuestion(f.question||v.title)!==normalizedQuestion(q.title)||
        !validValue(q,value)||JSON.stringify(f.answerOptions||[])!==JSON.stringify(q.options)) continue;
    if (c?.requestType) continue;
    if (f.scope==='task'&&f.taskId!==context.taskId ||
        !['task','reusable'].includes(f.scope)) continue;
    result.push({value:structuredClone(value),source:{entryId:e.id,version:v.version,
      createdAt:v.createdAt,question:f.question||v.title}});
  }
  return result.sort((a,b)=>b.source.createdAt.localeCompare(a.source.createdAt)||
    a.source.entryId.localeCompare(b.source.entryId));
}
export function entitySuggestions(document,context,q,scope,{entityId=''}={}) {
  const r=request(context,q),descriptor=topicDescriptor(r?.requestType);
  if(!document||!descriptor)return [];
  return localEntities(document,descriptor.entityKind)
    .filter(entity=>!entityId||entity.id===entityId)
    .flatMap(entity=>exactSuggestions(document,context,q,scope,{entityId:entity.id})
      .map(hit=>({...hit,entity:{id:entity.id,name:entity.name}})));
}
