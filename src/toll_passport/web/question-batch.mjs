// Copyright 2026 Steven Ochs and Tollbench. SPDX-License-Identifier: Apache-2.0
import { addEntry } from './vault.mjs';
import { findAnswerCandidates, canonicalAnswerLabel, ANSWER_REVIEW_AGE_DAYS } from './answers.mjs';
import { classificationFor, findTopicCandidates, sameClassification } from './topic-catalog.mjs';
import { mountTopicControls } from './topic-editor.mjs';
import { validateBatchAnswers, validValue, fileBytes } from './question-batch-channel.mjs';
const clone = value => JSON.parse(JSON.stringify(value));
const signature = value => JSON.stringify(value);
export class QuestionBatch {
  constructor(channel, state, save) { Object.assign(this,{channel,state,save}); this.generation=0; this.prepared=null; this.receipt=null; }
  current(expired = false) {
    const state=this.state();
    if (!state.document || state.scope !== this.channel.context.scope) throw Error('locked');
    if (!expired && Date.now() >= this.channel.context.expiresAt) throw Error('expired');
    return state.document;
  }
  candidates(q) {
    if(this.channel.context.matching)return [];
    if (!['short_answer','written_response'].includes(q.format)) return [];
    const document=this.current(),context=this.channel.context;
    if (canonicalAnswerLabel(q.label)) return findAnswerCandidates(document,{label:q.label,subject:context.subject,scope:'task',taskId:context.taskId}).filter(c=>validValue(q,c.answer));
    // Missing/unknown labels get only an exact text fallback, always owner-reviewed.
    const normalize=value=>typeof value==='string'?value.trim().replace(/\s+/g,' ').toLowerCase():'';
    const candidates=[];
    for(const entry of document.entries){
      const v=entry.versions.at(-1),f=v.fields,question=typeof f.question==='string'?f.question:v.title;
      if(v.kind!=='answer'||!validValue(q,f.answer)||f.subject!==context.subject||
          !['task','reusable'].includes(f.scope)||(f.scope==='task'&&f.taskId!==context.taskId)||normalize(question)!==normalize(q.title))continue;
      const reviewReasons=['unlabelled-exact-question'],age=Date.now()-Date.parse(v.createdAt);
      if(age>ANSWER_REVIEW_AGE_DAYS*86400000)reviewReasons.push('dated');
      if(age<0)reviewReasons.push('future-date');
      candidates.push({answer:f.answer,provenance:{entryId:entry.id,version:v.version,createdAt:v.createdAt,question,label:null,subject:f.subject,scope:f.scope,...(f.scope==='task'?{taskId:f.taskId}:{})},reviewReasons});
    }
    candidates.sort((a,b)=>b.provenance.createdAt.localeCompare(a.provenance.createdAt)||a.provenance.entryId.localeCompare(b.provenance.entryId));
    if(candidates.length>1)candidates.forEach(c=>c.reviewReasons.push('multiple-candidates'));
    return candidates;
  }
  valid(answers, expired = false) {
    const doc=this.current(expired), p=this.prepared;
    if (!p || p.vaultId !== doc.vaultId || p.signature !== signature(answers)) return false;
    return p.versions.every(ref=>{
      const v=doc.entries.find(e=>e.id===ref.id)?.versions.at(-1);
      return v?.version===ref.version && signature(v)===ref.signature;
    });
  }
  canRetry(answers) { return !!this.prepared?.attempted && this.prepared.signature===signature(answers); }
  async prepare(drafts) {
    const context=this.channel.context;
    const answers=drafts.filter(d=>d.selected).map(d=>({id:d.id,value:clone(d.value),files:clone(d.files.filter((f,i)=>d.shareFiles.includes(i)))}));
    if (!validateBatchAnswers(answers,context)) throw Error('invalid');
    if (this.prepared?.draftSignature===signature(drafts) && this.valid(answers,this.canRetry(answers))) return answers;
    this.prepared=null;this.receipt=null;const generation=++this.generation;
    let next=this.current(); const versions=[];
    for (const d of drafts) {
      const q=context.questions.find(q=>q.id===d.id); if(!q)throw Error('invalid');
      if (!validValue(q,d.value) && !d.files.length) continue;
      const readable=Array.isArray(d.value)?d.value.join(', '):d.value;
      const classified=context.matching&&d.classification?classificationFor(this.current(),context,q,d.classification.requestType,d.classification.entityId,d.reusable):null;
      const match=context.matching?findTopicCandidates(this.current(),context,q,classified).find(c=>c.eligible&&c.provenance.entryId===d.source?.entryId&&c.provenance.version===d.source?.version):null;
      const source=context.matching?(d.source&&match&&match.provenance.entryId===d.source.entryId&&match.provenance.version===d.source.version&&signature(match.value)===signature(d.value)?match.provenance:null):
        d.source && this.candidates(q).find(c=>c.provenance.entryId===d.source.entryId && c.provenance.version===d.source.version && c.answer===d.value)?.provenance;
      const remember=e=>{const v=e.versions.at(-1);versions.push({id:e.id,version:v.version,signature:signature(v)});};
      if(context.matching&&source){
        // Reusing an unchanged fact never creates a competing fact or expands its scope.
        remember(next.entries.find(e=>e.id===source.entryId));
        if(d.files.length){next=addEntry(next,{kind:'answer_material',title:q.title,fields:{question:q.title,taskId:context.taskId,questionDigest:q.digest},files:d.files});remember(next.entries.at(-1));}
        continue;
      }
      const fields={question:q.title,answer:readable,value:d.value,subject:context.subject,
        scope:d.reusable?'reusable':'task',taskId:context.taskId,label:context.matching?'':q.label||'',questionDigest:q.digest,...(context.matching?{classification:classified,answerOptions:q.options}:{}),...(source?{reusedFrom:{entryId:source.entryId,version:source.version}}:{})};
      const tags=!context.matching&&q.label?[q.label]:[];
      const existing=context.matching&&classified?next.entries.filter(e=>{const v=e.versions.at(-1);return v.kind==='answer'&&v.fields.subject===context.subject&&sameClassification(v.fields.classification,classified);}):[];
      const current=existing.length===1?existing[0]:null,v=current?.versions.at(-1);
      if(current&&signature(v.fields)===signature(fields)&&signature(v.files)===signature(d.files)){remember(current);continue;}
      // Multiple distinct records remain a conflict; an explicit new answer never picks a winner.
      next=addEntry(next,{...(current?{id:current.id}:{}),kind:'answer',title:q.title,fields,tags,files:d.files});
      remember(current?next.entries.find(e=>e.id===current.id):next.entries.at(-1));
    }
    // Even a deliberately blank batch records its private approval candidate.
    next=addEntry(next,{kind:'answer_batch',title:context.purpose,fields:{taskId:context.taskId,requestId:context.requestId,recipient:context.recipient.id,
      questionDigests:context.questions.map(q=>({id:q.id,digest:q.digest,...(q.recipients?{recipients:clone(q.recipients)}:{}),...(context.matching?{question:q.title}:{})})),selected:answers.map(a=>a.id),...(context.matching?{facts:versions.map(v=>({entryId:v.id,version:v.version}))}:{})}});
    const e=next.entries.at(-1),v=e.versions.at(-1);versions.push({id:e.id,version:v.version,signature:signature(v)});
    await this.save(next);
    if(generation!==this.generation)throw Error('conflict');
    this.prepared={approvalId:crypto.randomUUID(),vaultId:next.vaultId,versions,signature:signature(answers),draftSignature:signature(drafts)};
    if(!this.valid(answers)){this.prepared=null;throw Error('conflict');}return answers;
  }
  async release(answers) {
    if(!this.valid(answers,this.canRetry(answers)))throw Error('conflict');
    if(this.receipt)return this.receipt;
    const generation=this.generation;this.prepared.attempted=true;
    const receipt=await this.channel.release(answers,this.prepared.approvalId);
    if(generation!==this.generation||!this.valid(answers,true))throw Error('conflict');
    this.receipt=receipt;return receipt;
  }
  clear(){this.generation++;this.prepared=null;this.receipt=null;}
}

export function questionRecipients(question, context) {
  const recipients = question.recipients || [context.recipient];
  return recipients.map(r => recipients.filter(other => other.name === r.name).length > 1 ? `${r.name} (${r.id})` : r.name).join(', ');
}

export function mountQuestionBatch(root, channel, {state,save,run,filesValue}) {
  const session=new QuestionBatch(channel,state,save),context=channel.context;
  const shared = context.questions.every(q => Array.isArray(q.recipients));
  const recipientCount = shared ? new Set(context.questions.flatMap(q=>q.recipients.map(r=>r.id))).size : 1;
  const sendLabel = shared ? `Send to all ${recipientCount} agents` : `Send to ${context.recipient.name}`;
  let rows=[],vaultId=null,initialized=false,sent=false,cancelDialog;
  const node=(tag,text)=>{const el=document.createElement(tag);if(text!==undefined)el.textContent=text;return el;};
  const heading=node('h2',context.matching?'Your questions':context.purpose);heading.tabIndex=-1;
  const who=node('p',`For ${shared?'all '+recipientCount+' agents':context.recipient.name} · ${context.scope==='business'?'Business':'Personal'} book`);
  const locked=node('p',context.matching?`Unlock your ${context.scope} Passport to fill saved answers. Nothing is sent until you choose Send.`:`Open your ${context.scope} book to use saved answers. Nothing is sent while locked.`);
  const filled=node('p');filled.setAttribute('role','status');
  const editor=node('div'),feedback=node('p');feedback.setAttribute('role','status');feedback.setAttribute('aria-live','polite');
  const review=node('button','Review answers and files');review.type='button';
  const savePrivate=node('button','Save privately');savePrivate.type='button';savePrivate.className='secondary';
  root.append(heading,who,locked,filled,editor,feedback);root.hidden=false;
  function build() {
    rows=context.questions.map(q=>{
      const section=node('section');section.className='batch-question';section.dataset.batchQuestion=q.id;
      section.append(node('h3',q.title));
      if(q.originals){const details=node('details'),summary=node('summary','View the agents’ original questions');details.append(summary);for(const original of q.originals)details.append(node('p',`${original.agent}: ${original.title}`));section.append(details);}
      if (shared) { const audience=node('p',`Asked by ${questionRecipients(q, context)}`);audience.dataset.questionRecipients=q.id;section.append(audience); }
      const draft={id:q.id,value:q.format==='multiple_choice'?[]:'',files:[],shareFiles:[],reusable:false,selected:true,source:null};
      const row={q,draft,section};
      row.setValue=value=>{draft.value=clone(value);if(row.input)row.input.value=value;else section.querySelectorAll('input[name]').forEach(i=>{i.checked=Array.isArray(value)?value.includes(i.value):value===i.value;});};
      const keepLabel=node('label'),keep=node('input');keep.type='checkbox';keep.checked=true;
      keepLabel.append(keep,document.createTextNode(context.matching?' Send this answer':' Include this answer in the reviewed batch'));section.append(keepLabel);
      keep.addEventListener('change',()=>{draft.selected=keep.checked;sent=false;});
      if(['short_answer','written_response'].includes(q.format)) {
        const label=node('label','Your private answer'),input=node('textarea');input.maxLength=2000;input.rows=3;label.append(input);section.append(label);row.input=input;
        input.addEventListener('input',()=>{draft.value=input.value;draft.source=null;row.topic?.edited();sent=false;});
        const candidates=session.candidates(q),suggestions=node('div');section.append(suggestions);
        const provenance=c=>`Version ${c.provenance.version} · ${new Date(c.provenance.createdAt).toLocaleDateString()} · ${c.provenance.question}`;
        const use=c=>{draft.value=c.answer;draft.source=c.provenance;input.value=c.answer;suggestions.replaceChildren(node('p',`Private saved suggestion · ${provenance(c)}. Review before sharing.`));};
        if(candidates.length===1&&!candidates[0].reviewReasons.length)use(candidates[0]);
        else for(const c of candidates){const p=node('p',`${c.answer} — ${provenance(c)}`),b=node('button','Use saved answer (review required)');b.type='button';b.className='secondary';b.addEventListener('click',()=>use(c));suggestions.append(p,b);}
      } else {
        const options=q.format==='yes_no'?[{value:'yes',label:'Yes'},{value:'no',label:'No'}]:q.options;
        for(const o of options){const label=node('label'),input=node('input');input.type=q.format==='multiple_choice'?'checkbox':'radio';input.name=`batch-${q.id}`;input.value=o.value;label.append(input,document.createTextNode(o.label));section.append(label);
          input.addEventListener('change',()=>{row.topic?.edited();draft.value=q.format==='multiple_choice'?[...section.querySelectorAll('input[type=checkbox][name]')].filter(x=>x.checked).map(x=>x.value):o.value;sent=false;});}
      }
      if(context.matching){const controls=node('div');section.insertBefore(controls,section.children[1]);row.topic=mountTopicControls(controls,row,{context,state,save,run,onChange:updateFilled});}
      const reusableLabel=node('label'),reusable=node('input');reusable.type='checkbox';reusableLabel.append(reusable,document.createTextNode(context.matching?' Remember my answer in Passport for future tasks':' Remember this answer for future tasks using this book'));section.append(reusableLabel);row.reusableLabel=reusableLabel;row.reusableInput=reusable;reusable.addEventListener('change',()=>{draft.reusable=reusable.checked;});
      const attachments=node(context.matching?'details':'div'),attachmentsTitle=node('summary','Add files (optional)');if(context.matching)attachments.append(attachmentsTitle);section.append(attachments);
      const fileLabel=node('label','Upload information privately'),upload=node('input');upload.type='file';upload.multiple=true;fileLabel.append(upload);attachments.append(fileLabel);
      const fileList=node('div');attachments.append(fileList,node('p','Uploads stay private unless you select them below. Sharing is limited to 2 MiB per file, 3 files and 5 MiB total.'));
      upload.addEventListener('change',()=>run(async()=>{
        let files;try{files=await filesValue(upload.files);}catch(error){feedback.textContent='Upload not saved. Keep each private file under 25 MiB and the upload batch under 75 MiB. Your previous draft is unchanged.';throw error;}draft.files.push(...files);upload.value='';renderFiles();
        feedback.textContent=context.matching?'Files added to your private draft. Save privately or Send to persist them. Nothing has been sent.':'Files added to your private draft. Save privately or review to persist them. Nothing has been sent.';
      }));
      function renderFiles(){fileList.replaceChildren();draft.files.forEach((f,i)=>{
        const label=node('label'),check=node('input');check.type='checkbox';check.checked=draft.shareFiles.includes(i);const bytes=fileBytes(f);check.disabled=bytes===null;
        label.append(check,document.createTextNode(`${f.name} · ${Math.ceil(f.data.length*3/4/1024)} KiB${bytes===null?' · private only (too large or unsupported filename)':' · share this file'}`));fileList.append(label);
        check.addEventListener('change',()=>{draft.shareFiles=check.checked?[...draft.shareFiles,i]:draft.shareFiles.filter(x=>x!==i);sent=false;
          if(check.checked&&row.input&&!draft.value.trim()){draft.value=`Attached files: ${draft.shareFiles.map(n=>draft.files[n].name).join(', ')}`;row.input.value=draft.value;row.topic?.clear();}
        });
      });}
      row.renderFiles=renderFiles;return row;
    });
    editor.replaceChildren(...rows.map(r=>r.section));
    if(context.matching)editor.append(node('p',shared?'Each included answer and selected file goes only to Tollbench and the named agents beside that question. Future sharing is off.':`${context.purpose}. Sending gives Tollbench and ${context.recipient.name} the included answers and selected files. Other book information stays private; answers are not carried to other agents.`));
    editor.append(savePrivate,review);
  }
  function updateFilled(){for(const r of rows){if(context.matching&&r.reusableLabel){r.reusableLabel.hidden=!r.draft.classification;if(!r.draft.classification){r.draft.reusable=false;r.reusableInput.checked=false;}}}const n=rows.filter(r=>r.draft.source).length;filled.textContent=n?`Passport filled ${n} ${n===1?'answer':'answers'}. Review before sending.`:'';}
  const drafts=()=>rows.map(r=>({...clone(r.draft),selected:r.draft.selected&&validValue(r.q,r.draft.value)}));
  const refresh=()=>{
    const value=state(),available=!!value.document&&value.scope===context.scope;
    locked.hidden=available;editor.hidden=!available;filled.hidden=!available;
    if(!available){cancelDialog?.();session.clear();rows=[];editor.replaceChildren();vaultId=null;initialized=false;sent=false;return;}
    if(vaultId!==value.document.vaultId){cancelDialog?.();session.clear();initialized=false;vaultId=value.document.vaultId;}
    if(!initialized){initialized=true;build();}
    rows.forEach(r=>{r.renderFiles();r.topic?.refresh();});updateFilled();
    review.disabled=sent||(Date.now()>=context.expiresAt&&!session.prepared?.attempted);
    review.textContent=session.prepared?.attempted&&!sent?'Check delivery of this batch':context.matching?sendLabel:'Review answers and files';
    if(Date.now()>=context.expiresAt&&!session.prepared?.attempted)feedback.textContent='This request expired. Reopen the current proposal questions; nothing has been sent.';
  };
  savePrivate.addEventListener('click',()=>run(async()=>{if(context.matching){editor.inert=true;feedback.textContent='Saving privately…';}try{await session.prepare(drafts());feedback.textContent='Saved privately. Nothing has been sent.';}catch(error){if(context.matching)feedback.textContent='Not saved; your draft is still here. Nothing has been sent.';throw error;}finally{editor.inert=false;}}));
  review.addEventListener('click',()=>run(async()=>{
    if(context.matching)editor.inert=true;
    try {
    let answers;try{answers=await session.prepare(drafts());}catch(error){feedback.textContent=error.message==='invalid'?'Sharing is paused. Select at most 3 files, 2 MiB each and 5 MiB total. Nothing has been sent.':'Sharing is paused. Your draft is still here; nothing has been sent.';throw error;}
    feedback.textContent='Saved privately. Nothing has been sent.';
    if(context.matching){await send(answers);return;}
    const dialog=node('dialog'),title=node('h2',context.purpose),copy=node('p',shared?'Each answer and selected file below goes only to Tollbench and its listed agents. They can read and retain those copies. Other book information stays private; future sharing is off.':`Send only this reviewed batch to ${context.recipient.name}. Tollbench and ${context.recipient.name} can read and retain these answers and selected files. Other vault information stays private. Answers are not carried to other agents.`);
    const list=node('div');
    for(const a of answers){const q=context.questions.find(q=>q.id===a.id);list.append(node('h3',q.title));if(shared)list.append(node('p',`Share with: ${questionRecipients(q, context)}`));list.append(node('pre',Array.isArray(a.value)?a.value.join(', '):a.value));for(const f of a.files)list.append(node('p',`File: ${f.name} · ${fileBytes(f)} bytes · ${f.type||'unknown type'}`));}
    if(!answers.length)list.append(node('p','No answers or files selected. Continue with the action above and leave these questions blank.'));
    const yes=node('button',sendLabel),no=node('button','Keep private');no.className='secondary';
    const approved=await new Promise(resolve=>{const finish=v=>{cancelDialog=null;dialog.close();dialog.remove();resolve(v);};cancelDialog=()=>finish(false);yes.addEventListener('click',()=>finish(true));no.addEventListener('click',()=>finish(false));dialog.addEventListener('cancel',e=>{e.preventDefault();finish(false);});const body=node('div'),actions=node('div');body.className='batch-review-body';actions.className='batch-review-actions';body.append(title,copy,list);actions.append(yes,no);dialog.append(body,actions);root.append(dialog);dialog.showModal();no.focus();});
    if(!approved)return;
    await send(answers);
    } finally { editor.inert=false; }
  }));
  async function send(answers){
    try{const receipt=await session.release(answers);sent=true;feedback.textContent=`Sent to ${context.recipient.name}. Receipt ${receipt.receiptId}.`;heading.focus();root.scrollIntoView({block:'start'});}
    catch(error){feedback.textContent=error.message==='unavailable'?'Delivery is not confirmed. Retry this same batch to check its receipt.':'Not sent: the proposal may have changed, closed or expired. Your saved information remains private.';throw error;}
  }
  return {refresh,focus(){if(!state().document||state().scope!==context.scope)return false;heading.focus({preventScroll:true});root.scrollIntoView({block:'start',behavior:'instant'});return true;}};
}
