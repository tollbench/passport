// Copyright 2026 Steven Ochs and Tollbench. SPDX-License-Identifier: Apache-2.0
// Questions live inside the isolated Passport origin. Only explicit release crosses to the host.
// ONE SHEET (Steven 2026-10-27): each question shows the question, the answer,
// Attach files and one "Save to my Passport" box. Send sends to the agents who
// asked, then saves the checked answers into the one book. Connect opens a
// mini Passport inside this frame; nothing here ever opens a tab.
import {ALLOWED_PARENT_ORIGINS} from './client-policy.mjs';
import {connectHost} from './hosted-bridge.mjs';
import {connectBatchHost,validValue,validateBatchAnswers,fileBytes} from './question-batch-channel.mjs';
import {connectQuestionHost} from './question-channel.mjs';
import {createBookSession} from './book-session.mjs';
import {createDeviceMemory,indexedDbDeviceStorage} from './device-memory.mjs';
import {BOOK,addAnswer,answerText,answerEntry,fallbackLabels,orderSuggestions,savedAnswers} from './unified-question-model.mjs';

document.body.classList.add('hosted-questions');
const main=document.querySelector('main');main.replaceChildren();
const el=(tag,text,cls)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e;};
const button=(text,cls,type='button')=>{const b=el('button',text,cls);b.type=type;return b;};
// Phosphor Icons "plugs" / "plugs-connected", bold weight (MIT, phosphoricons.com).
const PLUGS={
  plugs:'m137 168l11.52-11.51a12 12 0 0 0-17-17L120 151l-15-15l11.52-11.51a12 12 0 0 0-17-17L88 119l-15.51-15.49a12 12 0 0 0-17 17L59 124l-20.46 20.49a36 36 0 0 0 0 50.91l2.55 2.54l-25.58 25.57a12 12 0 0 0 17 17l25.57-25.58l2.54 2.55a36.06 36.06 0 0 0 50.91 0L132 197l3.51 3.52a12 12 0 0 0 17-17Zm-42.46 32.49a12 12 0 0 1-17 0l-22.03-22.06a12 12 0 0 1 0-17L76 141l39 39Zm146-185a12 12 0 0 0-17 0l-25.6 25.6l-2.54-2.55a36.05 36.05 0 0 0-50.91 0L124 59l-3.51-3.52a12 12 0 0 0-17 17l80 80a12 12 0 0 0 17-17L197 132l20.49-20.49a36 36 0 0 0 0-50.91l-2.55-2.54l25.58-25.57a12 12 0 0 0-.03-16.98Zm-40 79L180 115l-39-39l20.49-20.49a12 12 0 0 1 17 0l22.06 22.06a12 12 0 0 1 0 17Z',
  'plugs-connected':'M240.49 15.51a12 12 0 0 0-17 0l-49.55 49.58l-2.54-2.55a36.05 36.05 0 0 0-50.91 0L100 83l-3.51-3.52a12 12 0 0 0-17 17L83 100l-20.46 20.49a36 36 0 0 0 0 50.91l2.55 2.54l-49.58 49.57a12 12 0 0 0 17 17l49.57-49.58l2.54 2.55a36.06 36.06 0 0 0 50.91 0L156 173l3.51 3.52a12 12 0 0 0 17-17L173 156l20.49-20.49a36 36 0 0 0 0-50.91l-2.55-2.54l49.58-49.57a12 12 0 0 0-.03-16.98m-121.95 161a12 12 0 0 1-17 0l-22.03-22.08a12 12 0 0 1 0-17L100 117l39 39Zm58-57.95L156 139l-39-39l20.49-20.49a12 12 0 0 1 17 0l22.06 22.06a12 12 0 0 1 0 17ZM85.27 33.37a12 12 0 0 1 21.46-10.74l8 16a12 12 0 1 1-21.46 10.74Zm-68 57.26a12 12 0 0 1 16.1-5.36l16 8a12 12 0 1 1-10.74 21.46l-16-8a12 12 0 0 1-5.36-16.1m221.46 74.74a12 12 0 0 1-16.1 5.36l-16-8a12 12 0 0 1 10.74-21.46l16 8a12 12 0 0 1 5.36 16.1m-68 57.26a12 12 0 1 1-21.46 10.74l-8-16a12 12 0 0 1 21.46-10.74Z'};
function plug(name) {
  const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg'),path=document.createElementNS(ns,'path');
  svg.setAttribute('viewBox','0 0 256 256');svg.setAttribute('aria-hidden','true');svg.setAttribute('focusable','false');
  svg.dataset.icon=name;path.setAttribute('fill','currentColor');path.setAttribute('d',PLUGS[name]);svg.append(path);return svg;
}
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
  if (!host.scopes.includes(BOOK)) throw Error('Question book scope is unavailable.');
  const session=createBookSession(host,device,refresh);
  let prepared=null,sent=false,busy=false,lastConnected=null,lastDocument=null,organizer=null,organizerLoad=null;
  const connected=()=>!!session.getState(BOOK).document;
  message.remove();

  // Top: one gray button, unplugged until the book is open in this frame.
  const bar=el('section',undefined,'question-connect');
  const connect=button(undefined,'passport-plug');connect.dataset.passportConnect='';
  connect.append(plug('plugs'),el('span','Connect Passport'));
  const plugged=el('p',undefined,'passport-plug is-connected');plugged.dataset.passportConnected='';
  plugged.append(plug('plugs-connected'),el('span','Passport connected'));
  bar.append(connect,plugged);
  const questions=el('section');
  const feedback=el('p','','question-feedback');feedback.setAttribute('role','status');feedback.setAttribute('aria-live','polite');
  const recipients=new Map(context.questions.flatMap(q=>(q.recipients||[context.recipient]).map(r=>[r.id,r.name])));
  const review=button(recipients.size===1?`Send to ${[...recipients.values()][0]}`:`Send to all ${recipients.size} agents`);
  review.dataset.questionSend='';
  const autofill=button('Autofill the rest','secondary question-autofill');autofill.dataset.questionAutofill='';autofill.hidden=true;
  const autofillStatus=el('p','','muted');autofillStatus.setAttribute('role','status');
  const end=el('div',undefined,'question-actions');end.append(review,autofill,autofillStatus);
  main.append(bar,questions,feedback,end);

  // ---- The mini Passport: a pop-up over this sheet, inside this frame ----
  const mini=el('dialog',undefined,'mini-passport');mini.setAttribute('aria-labelledby','mini-passport-title');
  const miniHead=el('div',undefined,'mini-passport__head'),miniTitle=el('h2','Passport');miniTitle.id='mini-passport-title';
  const miniClose=button('Close','secondary');
  miniHead.append(plug('plugs'),miniTitle,miniClose);
  const miniBody=el('div',undefined,'mini-passport__body');
  const miniNote=el('p','','mini-passport__note');miniNote.setAttribute('role','status');miniNote.setAttribute('aria-live','polite');
  mini.append(miniHead,miniBody,miniNote);main.append(mini);
  const say=text=>{miniNote.textContent=text;};
  const show=(...nodes)=>{miniBody.replaceChildren(...nodes);say('');};
  function closeMini() {if(mini.open)mini.close();connect.focus({preventScroll:true});refresh();}
  miniClose.addEventListener('click',closeMini);
  mini.addEventListener('cancel',event=>{event.preventDefault();closeMini();});
  // The frame has no allow-forms, so no <form>: the button and Enter submit.
  function onSubmit(go,inputs,handler) {
    go.addEventListener('click',()=>void handler());
    for (const input of inputs) input.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();if(!go.disabled)void handler();}});
  }
  function codeField(text) {
    const label=el('label',text),input=el('input',undefined,'code-input');
    Object.assign(input,{type:'text',inputMode:'numeric',maxLength:6,autocomplete:'one-time-code',spellcheck:false});
    input.setAttribute('pattern','[0-9]*');input.setAttribute('aria-label',text);
    input.addEventListener('input',()=>{input.value=input.value.replace(/\D/g,'').slice(0,6);});
    label.append(input);return [label,input];
  }
  // Every refusal the book session can give, in plain words.
  const RECOVERY_SAYS={
    'invalid-file':'That is not a Passport recovery key. Choose the recovery key you downloaded.',
    'backup-file':'That is an encrypted backup, not the recovery key. Choose the recovery key file.',
    'wrong-book':'That recovery key is for a different Passport. Choose the one for this Passport.',
    'failed':'That recovery key did not open your Passport. Choose the one you downloaded for it.',
    'open-book-first':'That key is for your older Business book. First open your Passport with your code or its own recovery key.'};
  const thrown=error=>error?.message==='unavailable'?'Passport is being updated. Try again in a minute.':
    error?.message==='unauthorized'?'Your sign-in ended. Sign in again, then open Passport.':
    error?.message==='conflict'?'Your Passport changed while opening. Try again.':'That did not work. Nothing changed. Try again.';
  function recoveryPicker(after) {
    const pick=button('Choose recovery key','gray'),file=el('input');file.type='file';file.hidden=true;
    file.accept='.json,application/json';file.dataset.recoveryFile='';
    pick.addEventListener('click',()=>file.click());
    file.addEventListener('change',async()=>{
      const chosen=file.files[0];file.value='';if(!chosen)return;
      pick.disabled=true;say('Opening your Passport…');
      let result=null,failure=null;
      try {result=await session.unlockWithRecoveryFile(chosen);} catch(error) {failure=error;}
      pick.disabled=false;
      if (!result) {say(thrown(failure));return;}
      if (!result.ok) {
        if (result.reason==='no-book') {stepSetup();say('There is no Passport here yet. Set one up first.');return;}
        say(RECOVERY_SAYS[result.reason]||'That file did not open your Passport. Choose the recovery key you downloaded.');return;
      }
      say('');
      if (result.merged) {await opened('Your Business book moved in.');return;}
      await after(result);
    });
    return [pick,file];
  }
  // Which step the pop-up shows comes from the book's own code status.
  async function route(note='') {
    show(el('p','Opening your Passport…','muted'));
    let status=null,failure=null;
    try {status=await session.codeStatus();} catch(error) {failure=error;}
    if (!mini.open) return;
    if (connected()) {closeMini();return;}
    if (!status) {show(el('p',thrown(failure)));return;}
    if (!status.hasBook) stepSetup();
    else if (status.disabled) stepRecovery('Too many tries. Open with your recovery key.');
    else if (!status.codeSet) stepFirstOpen();
    else stepCode();
    if (note) say(note);
  }
  async function openMini() {
    if (mini.open) return;
    show(el('p','Opening your Passport…','muted'));mini.showModal();
    await route();
  }
  async function opened(note='') {
    if (!connected()) await session.load(BOOK).catch(()=>{});
    if (!connected()) {say('Passport did not open. Try again.');return;}
    closeMini();
    if (note) feedback.textContent=note;
  }
  function stepCode() {
    const form=el('div',undefined,'mini-passport__form'),[label,input]=codeField('Your 6-digit code'),go=button('Open Passport','go');
    const forgot=button('Forgot your code? Use your recovery key','secondary');
    forgot.addEventListener('click',()=>stepRecovery('Open with your recovery key. Then pick a new code.',true));
    form.append(el('p','Type your 6-digit code to open your Passport here.'),label,go,forgot);
    onSubmit(go,[input],async()=>{
      if (!/^\d{6}$/.test(input.value)) {say('Type all 6 digits.');return;}
      go.disabled=true;say('');
      try {
        const result=await session.unlockWithCode(input.value);input.value='';
        if (result?.ok) {await opened();return;}
        const left=result?.attemptsLeft;
        if (result?.reason==='rate') say('Too many tries. Wait a minute.');
        else if (result?.reason==='disabled') stepRecovery('Too many tries. Open with your recovery key.');
        else if (result?.reason==='no-book') stepSetup();
        else if (result?.reason==='no-code') stepFirstOpen();
        else say(Number.isInteger(left)?`Wrong code. ${left} ${left===1?'try':'tries'} left.`:'Wrong code.');
      } catch(error) {say(error?.message==='unavailable'||error?.message==='unauthorized'||error?.message==='conflict'?
        thrown(error):'Passport did not open. Try again.');}
      finally {go.disabled=false;if(mini.open&&input.isConnected)input.focus();}
    });
    show(form);input.focus();
  }
  // After a recovery key opens the book: pick a code when the book has none
  // that fits (or it was turned off), or when the person forgot it.
  function stepRecovery(text,newCode=false) {
    show(el('p',text),...recoveryPicker(async result=>{
      if (result.needsCode) stepPickCode('Pick a 6-digit code.');
      else if (newCode) stepPickCode('Pick a new 6-digit code.');
      else await opened();
    }));
  }
  function stepFirstOpen() {
    show(el('p','Open your Passport with your recovery key once. Then pick a 6-digit code.'),
      ...recoveryPicker(async()=>stepPickCode('Pick a 6-digit code.')));
  }
  function pickCodeForm(text,action,submit,later=null) {
    const form=el('div',undefined,'mini-passport__form'),[first,code]=codeField('Pick a 6-digit code'),[second,again]=codeField('Type it again');
    const go=button(action,'go');form.append(el('p',text),first,second,go);
    if (later) {const skip=button('Not now','secondary');skip.addEventListener('click',later);form.append(skip);}
    onSubmit(go,[code,again],async()=>{
      if (!/^\d{6}$/.test(code.value)) {say('Use 6 digits.');return;}
      if (code.value!==again.value) {say('The two codes do not match.');again.value='';again.focus();return;}
      go.disabled=true;say('');
      try {const problem=await submit(code.value);if(problem)say(problem);}
      catch(error) {say(thrown(error));}
      finally {go.disabled=false;}
    });
    show(form);code.focus();
  }
  function stepPickCode(text) {
    // The book is already open here; "Not now" keeps it open without a code.
    pickCodeForm(text,'Save code',async code=>{
      let result;
      try {result=await session.setCode(code);}
      catch(error) {
        if (error?.message==='unavailable'&&connected()) return 'The code could not be saved right now. Your Passport is open. Tap Not now and pick a code next time.';
        throw error;
      }
      if (result?.ok) {await opened();return '';}
      if (result?.reason==='locked') {await route('Your Passport locked before the code was saved. Open it again.');return '';}
      return result?.reason==='invalid'?'Use 6 digits.':'That did not work. Nothing changed. Try again.';
    },()=>void opened());
  }
  function stepSetup() {
    pickCodeForm('Set up your Passport. Pick a 6-digit code you will type to open it here.','Set up Passport',async code=>{
      let made;
      try {made=await session.createBook(code);}
      catch(error) {
        if (error?.message==='exists') {await route('You already have a Passport. Open it with your code.');return '';}
        if (error?.message==='invalid') return 'Use 6 digits.';
        throw error;
      }
      const download=button('Download recovery key','gray');download.dataset.recoveryDownload='';
      download.addEventListener('click',()=>{
        const url=URL.createObjectURL(made.recoveryFile),a=el('a');a.href=url;a.download=made.filename||'passport-recovery.json';
        document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
      });
      const done=button('Done');done.addEventListener('click',()=>void opened());
      show(el('p','Your Passport is ready. Download your recovery key and keep it safe. It is the only way back in if you forget your code.'),download,done);
      return '';
    });
  }
  connect.addEventListener('click',()=>void openMini());

  // ---- Saved answers as suggestions (organizer optional) -----------------
  function loadOrganizer() {
    organizerLoad??=import('./organizer.mjs').then(m=>m.createOrganizer()).then(o=>{organizer=o;for(const row of rows)void renderSuggestions(row);return o;})
      .catch(()=>null);
    return organizerLoad;
  }
  async function renderSuggestions(row) {
    const turn=++row.suggestionTurn,book=session.getState(BOOK).document;
    row.suggestions.replaceChildren();
    if (!book||validValue(row.q,row.value)) return;
    const candidates=savedAnswers(book,context,row.q).filter(c=>JSON.stringify(c.value)!==JSON.stringify(row.value));
    if (!candidates.length) return;
    let ranked=null;
    if (organizer) try {ranked=await organizer.rank(row.q.title,candidates.map(c=>({id:c.id,text:c.text})));} catch {ranked=null;}
    if (turn!==row.suggestionTurn) return;
    const hits=orderSuggestions(row.q,candidates,ranked);
    if (!hits.length) return;
    row.suggestions.append(el('strong','From your Passport'));
    for (const hit of hits) {
      const item=el('div',undefined,'question-suggestion'),use=button('Use answer','secondary');
      item.append(el('small',`Saved answer · ${hit.tag}`,'question-source'),el('p',answerText(row.q,hit.value)),use);
      use.addEventListener('click',()=>{
        setValue(row,hit.value);row.edited=true;row.source={id:hit.id,tag:hit.tag};
        changedRow(row);void renderSuggestions(row);
      });
      row.suggestions.append(item);
    }
  }

  // ---- Rows ---------------------------------------------------------------
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
  const blank=q=>q.format==='multiple_choice'?[]:'';
  function changedRow(row) {row.generation++;prepared=null;sent=false;feedback.textContent='';refresh();}
  function renderRow(row) {
    const on=connected();
    row.saveBox.checked=on&&row.save!==false;
    // The source is the tag the answer came from: its book label, then its topic.
    row.from.hidden=!row.source;row.from.textContent=row.source?`From your Passport · ${row.source.tag}`:'';
  }
  const fileCount=()=>rows.reduce((n,row)=>n+row.files.length,0);
  function buildRow(q) {
    const section=el('section',undefined,'batch-question'),form=el('div'),status=el('p','','muted');
    status.setAttribute('role','status');
    const row={q,section,form,status,value:blank(q),edited:false,source:null,save:null,files:[],generation:0,suggestionTurn:0};
    const heading=el('h2',q.title);heading.id=`question-${q.id}`;section.append(heading);
    if (['short_answer','written_response'].includes(q.format)) {
      const input=el('textarea');input.maxLength=2000;input.rows=3;input.setAttribute('aria-labelledby',heading.id);
      form.append(input);row.input=input;
      input.addEventListener('input',()=>typed(row));
    } else {
      const options=q.format==='yes_no'?[{value:'yes',label:'Yes'},{value:'no',label:'No'}]:q.options;
      for (const option of options) {
        const label=el('label'),input=el('input');input.type=q.format==='multiple_choice'?'checkbox':'radio';
        input.name=`answer-${q.id}`;input.value=option.value;input.dataset.answerChoice='';
        label.append(input,document.createTextNode(option.label));form.append(label);
        input.addEventListener('change',()=>typed(row));
      }
    }
    row.suggestions=el('div',undefined,'question-suggestions');
    row.from=el('p','','question-source question-from');row.from.hidden=true;
    const attach=button('Attach files','secondary question-attach'),file=el('input'),fileList=el('ul',undefined,'question-files');
    file.type='file';file.multiple=true;file.hidden=true;attach.hidden=singleMode;
    attach.addEventListener('click',()=>file.click());
    const renderFiles=()=>{
      fileList.replaceChildren();
      row.files.forEach((item,index)=>{
        const li=el('li',item.name),remove=button('Remove','secondary');
        remove.setAttribute('aria-label',`Remove ${item.name}`);
        remove.addEventListener('click',()=>{row.files.splice(index,1);renderFiles();changedRow(row);});
        li.append(remove);fileList.append(li);
      });
    };
    file.addEventListener('change',async()=>{
      const picked=[...file.files];file.value='';
      try {
        for (const item of picked) {
          if (item.size>2*1024*1024||fileCount()>=3) throw Error('invalid');
          const bytes=new Uint8Array(await item.arrayBuffer());let text='';
          for(let offset=0;offset<bytes.length;offset+=8192)
            text+=String.fromCharCode(...bytes.subarray(offset,offset+8192));
          const entry={name:item.name,type:item.type||'application/octet-stream',data:btoa(text)};
          if (fileBytes(entry)===null) throw Error('invalid');
          row.files.push(entry);
        }
        if (row.input&&!row.value.trim()&&row.files.length) {
          setValue(row,`Attached files: ${row.files.map(f=>f.name).join(', ')}`);row.edited=true;row.source=null;
        }
        status.textContent='';
      } catch {status.textContent='File not added. Use at most 3 files, 2 MB each.';}
      renderFiles();changedRow(row);
    });
    const saveLabel=el('label',undefined,'question-save'),saveBox=el('input');saveBox.type='checkbox';
    saveBox.dataset.passportSave='';
    saveLabel.append(saveBox,document.createTextNode('Save to my Passport'));row.saveBox=saveBox;
    saveBox.addEventListener('change',()=>{
      if (!connected()) {row.save=true;saveBox.checked=false;void openMini();return;}
      row.save=saveBox.checked;
    });
    form.append(row.from,row.suggestions,attach,file,fileList,saveLabel);
    section.append(form,status);questions.append(section);
    return row;
  }
  function typed(row) {
    row.value=selectedValue(row);row.edited=true;row.source=null;
    changedRow(row);void renderSuggestions(row);
  }
  function scrub(row) {
    // Only an answer taken from the book leaves with the book. Typed work stays.
    if (!row.source) return;
    setValue(row,blank(row.q));row.source=null;row.generation++;prepared=null;
    row.status.textContent='Passport locked. The saved answer was taken out of this form.';
  }
  function refresh() {
    const on=connected(),book=session.getState(BOOK).document;
    if (on!==lastConnected) {lastConnected=on;host.reportConnected(on);if(on)void loadOrganizer();}
    connect.hidden=on;plugged.hidden=!on;
    for (const row of rows) {
      if (!on) scrub(row);
      renderRow(row);
      if (book!==lastDocument) void renderSuggestions(row);
    }
    lastDocument=book;
    review.disabled=busy||sent;
  }
  rows.push(...context.questions.map(buildRow));

  // ---- Autofill the rest (super admin; the page offers it) --------------
  channel.setAutofillOfferHandler?.(()=>{autofill.hidden=false;});
  autofill.addEventListener('click',async()=>{
    if (busy||sent||autofill.disabled) return;
    if (rows.every(row=>validValue(row.q,row.value))) {autofillStatus.textContent='Everything is answered already.';return;}
    autofill.disabled=true;autofill.textContent='Filling in the rest…';autofillStatus.textContent='';
    const asked=rows.map(row=>({id:row.q.id,title:row.q.title,format:row.q.format,options:structuredClone(row.q.options),
      answer:validValue(row.q,row.value)?answerText(row.q,row.value).slice(0,2000):null}));
    try {
      const result=await channel.requestAutofill(asked);
      if (!result.ok) {autofillStatus.textContent='Autofill did not answer. Nothing was changed.';return;}
      let filled=0;
      for (const answer of result.answers) {
        const row=rows.find(r=>r.q.id===answer.id);
        // Only boxes still blank when the answers land; nothing typed is replaced.
        if (!row||validValue(row.q,row.value)||!validValue(row.q,answer.value)) continue;
        setValue(row,answer.value);row.edited=true;row.source=null;row.generation++;filled++;
      }
      prepared=null;refresh();
      autofillStatus.textContent=!filled?'Nothing left to fill.':result.drafted?`Filled ${filled}. Read them over, then send.`:
        `Picked the first choice on ${filled}. The written ones are still blank.`;
    } catch {autofillStatus.textContent='Autofill did not answer. Nothing was changed.';}
    finally {autofill.disabled=false;autofill.textContent='Autofill the rest';}
  });

  let localInteraction=false;
  for(const event of ['input','change','click'])questions.addEventListener(event,()=>{localInteraction=true;});
  channel.setDraftHandler?.(answers=>{
    if(localInteraction||busy||sent)return false;
    for(const answer of answers){
      const row=rows.find(row=>row.q.id===answer.id);
      setValue(row,answer.value);row.edited=true;row.source=null;row.generation++;
    }
    prepared=null;refresh();
    return true;
  });
  channel.announceSheet?.();
  if(await host.reportQuestionUI())host.reportViewReady('questions');
  await session.load(BOOK).catch(()=>{});
  refresh();
  let lastRecheck=0;
  const recheck=()=>{
    if (Date.now()-lastRecheck<1000||connected()||mini.open)return;lastRecheck=Date.now();
    void session.load(BOOK).catch(()=>{});
  };
  window.addEventListener('focus',recheck);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)recheck();});
  host.setControlHandler(async(command)=>{
    if (command==='lock-all') {await session.lockAll();prepared=null;feedback.textContent='Passport locked.';return true;}
    return false;
  });
  function prepare() {
    if (Date.now()>=context.expiresAt && !prepared?.attempted) throw Error('expired');
    // Blank answers never go out; each answer goes only to the agents who asked it.
    const answers=rows.filter(r=>validValue(r.q,r.value)).map(r=>({id:r.q.id,
      value:structuredClone(r.value),files:structuredClone(r.files)}));
    if (singleMode&&answers.length!==1) throw Error('invalid');
    if (!validateBatchAnswers(answers,context)) throw Error('invalid');
    const signature=JSON.stringify(answers);
    if (prepared?.signature===signature) return prepared;
    return prepared={signature,answers,approvalId:crypto.randomUUID(),attempted:false};
  }
  async function labelsFor(row) {
    const signed=context.matching?.requests.find(r=>r.questionId===row.q.id)?.requestType||null,fallback=fallbackLabels(signed);
    const ready=organizer||await Promise.race([organizerLoad||Promise.resolve(null),new Promise(r=>setTimeout(()=>r(null),3000))]);
    if (!ready||ready.kind==='fallback') return fallback;
    try {
      const found=await ready.label(`${row.q.title}\n${answerText(row.q,row.value)}`);
      return {book:found?.book==='business'?'business':found?.book==='personal'?'personal':fallback.book,
        topic:typeof found?.topic==='string'?found.topic:fallback.topic};
    } catch {return fallback;}
  }
  async function saveAfterSend() {
    // Copied from the book unchanged: nothing new to keep.
    const picks=rows.filter(r=>r.save!==false&&!r.source&&validValue(r.q,r.value));
    if (!connected()||!picks.length) return '';
    try {
      const labels=await Promise.all(picks.map(labelsFor));
      await session.saveToScope(BOOK,doc=>picks.reduce((next,row,i)=>addAnswer(next,answerEntry(context,row.q,row.value,labels[i])),doc));
      for (const row of picks) row.status.textContent='Saved to your Passport.';
      return picks.length===1?'Saved 1 answer to your Passport.':`Saved ${picks.length} answers to your Passport.`;
    } catch {
      return 'Saving to your Passport did not work, so these answers are not in your Passport. They were still sent.';
    }
  }
  review.addEventListener('click',async()=>{
    if(busy||sent)return;busy=true;questions.inert=true;autofill.disabled=true;refresh();
    let receipt=null;
    try {
      // The current fields and attached files are the review. This explicit
      // Send is the only plaintext release.
      const result=prepare();
      result.attempted=true;
      receipt=await channel.release(result.answers,result.approvalId);
      sent=true;feedback.textContent='Sent.';
    } catch(error) {
      feedback.textContent=error.message==='unavailable'?'Delivery is not confirmed. Tap Send again to check.':
        error.message==='expired'?'These questions have closed. Close this sheet and open it again.':
        'Nothing was sent. Check your answers and try again.';
    }
    if (sent) {
      // Saving comes after the send; a failed save never undoes or blocks it.
      const note=await saveAfterSend();
      feedback.textContent=note?`Sent. ${note}`:'Sent.';
      try {channel.settled?.(receipt?.id);} catch { /* the host reloads on its own clock */ }
    }
    busy=false;questions.inert=sent;autofill.disabled=false;refresh();
  });
}
