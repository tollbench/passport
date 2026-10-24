// Copyright 2026 Steven Ochs and Tollbench. SPDX-License-Identifier: Apache-2.0
import { ANSWER_REVIEW_AGE_DAYS } from './answers.mjs';
export const CATALOG_VERSION='1';
const textFormats=['short_answer','written_response'];
const descriptor=(requestType,label,choice=false)=>Object.freeze({requestType,label,entityKind:requestType.split('.')[0],topic:requestType.split('.')[1],valueType:'string',supportedFormats:Object.freeze([...textFormats,...(choice?['single_choice']:[])])});
export const TOPIC_CATALOG=Object.freeze([
  descriptor('person.biography','Biography'),descriptor('person.food_preference','Food preference',true),
  descriptor('person.contact_preference','Contact preference',true),descriptor('pet.diet','Pet diet'),
  descriptor('organization.target_audience','Organization audience'),
  descriptor('organization.description','Company description'),
  descriptor('project.target_audience','Project audience'),
  descriptor('project.pitch_angle','Pitch angle'),descriptor('project.description','Project description'),
  descriptor('project.communication_tone','Communication tone',true),descriptor('project.podcast_preferences','Podcast preferences',true),
  Object.freeze({requestType:'person.food_restrictions',label:'Food restrictions',entityKind:'person',topic:'food_restrictions',valueType:'string[]',supportedFormats:Object.freeze(['multiple_choice'])})
]);
export const topicDescriptor=id=>TOPIC_CATALOG.find(d=>d.requestType===id)||null;
const exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
export function validateMatching(m,questions){
  if(!exact(m,['version','catalogVersion','allowedRequestTypes','requests'])||m.version!==1||m.catalogVersion!==CATALOG_VERSION||!Array.isArray(m.allowedRequestTypes)||m.allowedRequestTypes.length>TOPIC_CATALOG.length||new Set(m.allowedRequestTypes).size!==m.allowedRequestTypes.length||!m.allowedRequestTypes.every(id=>topicDescriptor(id))||!Array.isArray(m.requests)||m.requests.length!==questions.length)return false;
  const ids=new Set();
  return m.requests.every(r=>{if(!(exact(r,['questionId','requestType'])||exact(r,['questionId','requestType','contextKey'])&&validContextKey(r.contextKey))||ids.has(r.questionId))return false;ids.add(r.questionId);const q=questions.find(q=>q.id===r.questionId),d=topicDescriptor(r.requestType);return !!q&&(r.requestType===null||m.allowedRequestTypes.includes(r.requestType)&&d?.supportedFormats.includes(q.format));});
}
export function localEntities(document,kind){
  return document.entries.flatMap(e=>{const v=e.versions.at(-1);return v.kind==='passport.entity'&&v.fields.entityKind===kind&&typeof v.fields.name==='string'&&v.fields.name.trim()?[{id:e.id,name:v.fields.name,kind,version:v.version}]:[];});
}
export const validContextKey = value => typeof value === 'string' && /^[a-z][a-z0-9_.-]{0,79}$/.test(value);
export function classificationFor(document,context,question,requestType,entityId,reusable=false){
  const d=topicDescriptor(requestType);
  if(!context.matching?.allowedRequestTypes.includes(requestType)||!d?.supportedFormats.includes(question.format)||!localEntities(document,d.entityKind).some(e=>e.id===entityId))return null;
  const contextKey=context.matching.requests?.find(r=>r.questionId===question.id)?.contextKey;
  return {...(contextKey?{contextKey}:{}),catalogVersion:CATALOG_VERSION,entityId,requestType,topic:d.topic,valueType:d.valueType,answerFormat:question.format,taskBinding:reusable?{scope:'reusable'}:{scope:'task',taskId:context.taskId}};
}
export function findTopicCandidates(document,context,question,classification,{now=Date.now()}={}){
  if(!classification||!Number.isFinite(now))return [];
  const wanted=classificationFor(document,context,question,classification.requestType,classification.entityId);
  if(!wanted)return [];
  const matches=[];
  for(const e of document.entries){
    const v=e.versions.at(-1),f=v.fields,c=f.classification;
    if(v.kind!=='answer'||f.subject!==context.subject||!c||c.catalogVersion!==CATALOG_VERSION||
      (c.contextKey||null)!==(wanted.contextKey||null)||
      !['entityId','requestType','topic','valueType','answerFormat'].every(k=>c[k]===wanted[k])||
      !(c.taskBinding?.scope==='reusable'||c.taskBinding?.scope==='task'&&c.taskBinding.taskId===context.taskId))continue;
    const value=f.value;
    if(wanted.valueType==='string'&&(typeof value!=='string'||!value.trim()||value.length>2000))continue;
    if(wanted.valueType==='string[]'&&(!Array.isArray(value)||!value.length||value.some(x=>typeof x!=='string')||new Set(value).size!==value.length))continue;
    if(['single_choice','multiple_choice'].includes(question.format)){
      if(JSON.stringify(f.answerOptions)!==JSON.stringify(question.options))continue;
      const permitted=new Set(question.options.map(o=>o.value));if(!(Array.isArray(value)?value:[value]).every(x=>permitted.has(x)))continue;
    }
    const age=now-Date.parse(v.createdAt);
    matches.push({value,provenance:{entryId:e.id,version:v.version,createdAt:v.createdAt,question:f.question||v.title},eligible:Number.isFinite(age)&&age>=0&&age<=ANSWER_REVIEW_AGE_DAYS*86400000});
  }
  return matches.sort((a,b)=>a.provenance.entryId.localeCompare(b.provenance.entryId));
}
export function findTopicAnswer(document,context,question,classification,options){
  const matches=findTopicCandidates(document,context,question,classification,options);
  return matches.length===1&&matches[0].eligible?matches[0]:null;
}

export function sameClassification(a,b){return !!a&&!!b&&(a.contextKey||null)===(b.contextKey||null)&&['catalogVersion','entityId','requestType','topic','valueType','answerFormat'].every(k=>a[k]===b[k])&&a.taskBinding?.scope===b.taskBinding?.scope&&(a.taskBinding?.scope==='reusable'||a.taskBinding?.scope==='task'&&a.taskBinding.taskId===b.taskBinding.taskId);}
