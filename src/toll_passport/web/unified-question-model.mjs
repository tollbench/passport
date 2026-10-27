// Copyright 2026 Steven Ochs and Tollbench. SPDX-License-Identifier: Apache-2.0
import {validValue} from './question-batch-channel.mjs';
import {classificationFor,findTopicCandidates,localEntities,topicDescriptor} from './topic-catalog.mjs';
import {canonicalAnswerLabel,findAnswerCandidates} from './answers.mjs';
import {addEntry} from './vault.mjs';

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
  const key=duplicateKey(context,source.q,source.scope,source.entityId,source.topicRemoved,source.topicChoice);
  const changed=[];
  for (const row of rows) {
    if (row!==source && !row.edited && row.propagatedFrom===source.q.id &&
        (key===null || !validValue(source.q,source.value) ||
        duplicateKey(context,row.q,row.scope,row.entityId,row.topicRemoved,row.topicChoice)!==key)) {
      const hadValue=row.value!==''&&!(Array.isArray(row.value)&&row.value.length===0);
      row.value=row.q.format==='multiple_choice'?[]:'';row.propagatedFrom=null;
      if(hadValue)changed.push(row);
      continue;
    }
    if (key===null || !validValue(source.q,source.value)) continue;
    if (row===source || row.edited ||
        (row.propagatedFrom && row.propagatedFrom!==source.q.id) ||
        (!row.propagatedFrom && row.value !== '' &&
        !(Array.isArray(row.value)&&row.value.length===0)) ||
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

// ONE BOOK (Steven 2026-10-27). The questions sheet reads and writes only the
// `personal` book; "business" survives as a label on a saved answer, never as
// a second place to save.
export const BOOK = 'personal';
const textFormats = ['short_answer','written_response'];
export function bookSubject(context) {
  const subject = context.scope === BOOK ? context.subject : context.bookSubjects?.[BOOK] || context.subject;
  if (typeof subject !== 'string' || !subject) throw Error('invalid');
  return subject;
}
export function answerText(q, value) {
  const label = v => q.options.find(o => o.value === v)?.label || v;
  if (q.format === 'yes_no') return value === 'yes' ? 'Yes' : value === 'no' ? 'No' : String(value);
  if (Array.isArray(value)) return value.map(label).join(', ');
  return q.format === 'single_choice' ? label(value) : String(value);
}
/** The signed topic is the only label without the organizer: no prose guessing. */
export function fallbackLabels(requestType) {
  const kind = typeof requestType === 'string' ? requestType.split('.')[0] : '';
  return {book: kind === 'organization' ? 'business' : 'personal',
    topic: topicDescriptor(requestType) ? requestType : null};
}
export function passportLabel(fields, labels = null) {
  return topicDescriptor(labels?.topic)?.label ||
    topicDescriptor(fields?.classification?.requestType)?.label ||
    (typeof fields?.question === 'string' && fields.question.trim() ? fields.question.trim() : 'Saved answer');
}
/** The source line names the tag an answer came from, per Steven 2026-10-27:
 *  its book label, Personal or Business, then its topic when it has one. */
export function sourceTag(fields, labels = null) {
  const book = labels?.book === 'business' ? 'Business' : 'Personal';
  const topic = topicDescriptor(labels?.topic)?.label || topicDescriptor(fields?.classification?.requestType)?.label;
  return topic ? `${book} · ${topic}` : book;
}
/** Every saved answer in the book that fits this question's own kind, newest first, one per value. */
export function savedAnswers(document, context, q) {
  if (!document) return [];
  const subjects = new Set([context.subject, ...Object.values(context.bookSubjects || {})]);
  const seen = new Set(), out = [];
  const answers = document.entries.map(e => ({e, v: e.versions.at(-1)})).filter(({v}) => v.kind === 'answer')
    .sort((a, b) => b.v.createdAt.localeCompare(a.v.createdAt) || a.e.id.localeCompare(b.e.id));
  for (const {e, v} of answers) {
    const f = v.fields;
    if (typeof f.subject === 'string' && !subjects.has(f.subject)) continue;
    const value = Object.hasOwn(f, 'value') ? f.value : typeof f.answer === 'string' ? f.answer : null;
    const fits = textFormats.includes(q.format) ? typeof value === 'string' && validValue(q, value) :
      validValue(q, value) && JSON.stringify(f.answerOptions || []) === JSON.stringify(q.options) &&
        (!f.answerFormat || f.answerFormat === q.format);
    if (!fits) continue;
    const key = JSON.stringify(value);
    if (seen.has(key)) continue;
    seen.add(key);
    const question = typeof f.question === 'string' && f.question ? f.question : v.title;
    out.push({id: e.id, value: structuredClone(value), question, label: passportLabel(f, v.labels),
      tag: sourceTag(f, v.labels), text: `${question}\n${answerText(q, value)}`, createdAt: v.createdAt});
  }
  return out;
}
/** Exact question wording first; the organizer's ranking orders the rest. Without it, exact only. */
export function orderSuggestions(q, candidates, ranked = null, limit = 3) {
  const exactHits = candidates.filter(c => normalizedQuestion(c.question) === normalizedQuestion(q.title));
  if (!Array.isArray(ranked)) return exactHits.slice(0, limit);
  const place = new Map();
  ranked.forEach((r, i) => {
    if (r && typeof r.id === 'string' && !place.has(r.id) && !(typeof r.score === 'number' && !(r.score > 0))) place.set(r.id, i);
  });
  const rest = candidates.filter(c => !exactHits.includes(c) && place.has(c.id))
    .sort((a, b) => place.get(a.id) - place.get(b.id));
  return [...exactHits, ...rest].slice(0, limit);
}
/** The one saved answer a checked "Save to my Passport" writes after Send.
 *  Labels ride the entry version (plain strings; a missing topic is left out). */
export function answerEntry(context, q, value, labels) {
  const safe = {book: labels?.book === 'business' ? 'business' : 'personal'};
  if (typeof labels?.topic === 'string' && /^[a-z][a-z0-9_.-]{0,99}$/.test(labels.topic)) safe.topic = labels.topic;
  return {kind: 'answer', title: q.title, fields: {question: q.title, answer: answerText(q, value),
    value: structuredClone(value), subject: bookSubject(context), scope: 'reusable', taskId: context.taskId,
    label: q.label || '', questionDigest: q.digest, answerFormat: q.format, answerOptions: q.options},
    tags: q.label ? [q.label] : [], labels: safe};
}
/** Saves one answer; its labels ride the new version (vault.mjs addEntry). */
export function addAnswer(document, entry) {
  return addEntry(document, entry);
}
