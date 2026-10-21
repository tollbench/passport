"""Installed-package opaque batch + trusted fixed addon acceptance; synthetic data only."""
import json, os, tempfile, threading
from pathlib import Path
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from importlib.resources import files
from playwright.sync_api import sync_playwright, expect
ASSETS=Path(str(files('toll_passport').joinpath('web')))
HOST='''<!doctype html><title>Batch fixture</title><style>html,body{margin:0;height:100%;overflow:hidden}iframe{display:block;width:100%;height:100%;border:0}</style><iframe id="vault" sandbox="allow-scripts allow-downloads" src="/hosted.html"></iframe><script type="module">
import {PROTOCOL,validateReady,validateRequest} from './hosted-bridge.mjs';
import {BATCH_PROTOCOL,validateBatchReady,validateBatchRelease} from './question-batch-channel.mjs';
const frame=document.querySelector('iframe'),cap='b'.repeat(64);let nonce,bn;window.messages=[];window.releases=[];window.failSave=false;window.changed=false;
const context={requestId:crypto.randomUUID(),token:'signed-batch',scope:'personal',subject:'owner:fixture:personal',taskId:'proposal:fixture',purpose:'Choose Fixture Agent and request a final plan',recipient:{id:'one',name:'Fixture Agent'},questions:[{id:'q1',digest:'a'.repeat(64),title:'Founder biography?',format:'short_answer',label:'founder_bio',options:[]},{id:'q2',digest:'c'.repeat(64),title:'Podcast type?',format:'single_choice',label:null,options:[{value:'business',label:'Business'},{value:'art',label:'Art'}]}],expiresAt:Date.now()+600000};
window.addEventListener('message',e=>{if(e.source!==frame.contentWindow||e.origin!=='null')return;const q=e.data;messages.push(q);const send=v=>frame.contentWindow.postMessage(v,'*');
if(validateBatchReady(q)){bn=q.nonce;send({protocol:BATCH_PROTOCOL,type:'init',nonce:bn,capability:cap,context});return;}
if(validateBatchRelease(q)&&q.nonce===bn&&q.capability===cap){if(window.changed){send({protocol:BATCH_PROTOCOL,type:'receipt',nonce:bn,capability:cap,id:q.id,ok:false,error:'conflict'});return;}if(!releases.some(r=>r.approvalId===q.approvalId))releases.push(q);send({protocol:BATCH_PROTOCOL,type:'receipt',nonce:bn,capability:cap,id:q.id,ok:true,receiptId:'batch-receipt'});return;}
if(validateReady(q)){nonce=q.nonce;send({protocol:PROTOCOL,type:'init',nonce,capability:cap,scopes:['personal','business'],scope:'personal'});return;}
if(!validateRequest(q)||q.nonce!==nonce||q.capability!==cap)return;const base={protocol:PROTOCOL,type:'result',nonce,capability:cap,id:q.id,op:q.op,scope:q.scope},old=JSON.parse(localStorage.getItem(q.scope)||'null');
if(q.op==='load'){send({...base,ok:true,envelope:old?.envelope||null,etag:old?.etag||null});return;}if(window.failSave){send({...base,ok:false,error:'unavailable'});return;}if(q.op==='save'){const etag=crypto.randomUUID();localStorage.setItem(q.scope,JSON.stringify({envelope:q.envelope,etag}));send({...base,ok:true,etag});}
});</script>'''
ADDON='''import {registerPanel} from './hosted.mjs';import{addEntry}from'./vault.mjs';
registerPanel({id:'fixture',label:'Private fixture',mount(api){globalThis.fixtureApi=api;let active=false;return{ownsEntry:e=>e.versions.at(-1).kind==='fixture.private',focus:()=>false,refresh(){api.root.replaceChildren();const s=api.getState();if(!s.document)return;const h=document.createElement('h2');h.textContent='Private addon';api.root.append(h);for(const e of s.document.entries.filter(e=>e.versions.at(-1).kind==='fixture.private')){const p=document.createElement('p');p.textContent=e.versions.at(-1).fields.content;api.root.append(p);}const b=document.createElement('button');b.textContent='Save private fixture';b.type='button';b.onclick=()=>api.run(async()=>{const s=api.getState();const next=addEntry(s.document,{kind:'fixture.private',title:'Private fixture',fields:{content:'PRIVATE_GOAL_CANARY'}});await api.save(next,{vaultId:s.document.vaultId,revision:s.document.revision,scope:s.scope});});api.root.append(b);}};}});'''
class Handler(SimpleHTTPRequestHandler):
 def log_message(self,*args): pass
 def end_headers(self):self.send_header('Access-Control-Allow-Origin','*');self.send_header('Cache-Control','no-store');super().end_headers()
 def do_GET(self):
  if self.path=='/host':data=HOST;mime='text/html'
  elif self.path=='/fixture-addon.mjs':data=ADDON;mime='text/javascript'
  elif self.path=='/hosted.html':data=(ASSETS/'hosted.html').read_text().replace('</head>','<script type="module" src="./fixture-addon.mjs" crossorigin="anonymous"></script></head>');mime='text/html'
  else:return super().do_GET()
  self.send_response(200);self.send_header('Content-Type',mime);self.end_headers();self.wfile.write(data.encode())
with tempfile.TemporaryDirectory(prefix='passport-batch-') as tmp,ThreadingHTTPServer(('127.0.0.1',0),partial(Handler,directory=str(ASSETS))) as server,sync_playwright() as p:
 threading.Thread(target=server.serve_forever,daemon=True).start();opts={'headless':True}
 if os.environ.get('PASSPORT_CHROME'):opts['executable_path']=os.environ['PASSPORT_CHROME']
 browser=p.chromium.launch(**opts);page=browser.new_page(accept_downloads=True,viewport={'width':390,'height':844});page.set_default_timeout(10000);errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.goto(f'http://127.0.0.1:{server.server_port}/host');f=page.frame_locator('#vault');batch=f.locator('#agent-question-batch')
 expect(batch).to_contain_text('Nothing is sent while locked');
 try:
  with page.expect_download() as d:
   expect(f.locator('#create')).to_be_enabled();f.locator('#create').focus();f.locator('#create').press('Enter')
 except Exception:
  print('CREATION FAILURE',errors,f.locator('#status').inner_text());raise
 recovery=Path(tmp)/'key.json';d.value.save_as(recovery);f.locator('#confirm-create').click()
 expect(batch.locator('h2')).to_be_focused();expect(f.locator('#panel-fixture')).to_be_visible()
 f.get_by_role('button',name='Save private fixture',exact=True).click();expect(f.locator('#panel-fixture')).to_contain_text('PRIVATE_GOAL_CANARY');assert 'PRIVATE_GOAL_CANARY' not in f.locator('#entries').inner_text()
 inner=page.frames[1];assert inner.evaluate('Object.keys(fixtureApi).sort()')==['getState','root','run','save']
 inner.evaluate('globalThis.oldState=fixtureApi.getState()')
 row=batch.locator('[data-batch-question="q1"]');row.locator('textarea').fill('BATCH_ANSWER_CANARY')
 row.locator('input[type=file]').set_input_files([{'name':'bio.txt','mimeType':'text/plain','buffer':b'CHOSEN_FILE_CANARY'},{'name':'private.txt','mimeType':'text/plain','buffer':b'PRIVATE_FILE_CANARY'}])
 expect(row).to_contain_text('bio.txt')
 try:
  option=batch.locator('[data-batch-question="q2"] input[value=business]');option.evaluate("e=>e.scrollIntoView({block:'center',behavior:'instant'})");option.check()
 except Exception:
  page.screenshot(path=str(Path(tmp)/'pointer-failure.png'));raise
 assert not row.get_by_label('bio.txt',exact=False).is_checked();assert page.evaluate('releases.length')==0
 batch.get_by_role('button',name='Save privately',exact=True).click();expect(batch).to_contain_text('Saved privately. Nothing has been sent.')
 assert all(canary not in json.dumps(page.evaluate('messages')) for canary in ['BATCH_ANSWER_CANARY','PRIVATE_GOAL_CANARY','PRIVATE_FILE_CANARY','CHOSEN_FILE_CANARY'])
 # Stale addon revisions cannot overwrite newly saved answers.
 assert inner.evaluate("async()=>{try{await fixtureApi.save({...oldState.document,revision:oldState.document.revision+1},{vaultId:oldState.document.vaultId,revision:oldState.document.revision,scope:oldState.scope});return false;}catch(e){return e.message==='conflict';}}")
 row.get_by_label('bio.txt',exact=False).check();page.evaluate('failSave=true');batch.get_by_role('button',name='Review answers and files',exact=True).click();expect(batch).to_contain_text('Sharing is paused');assert f.locator('dialog').count()==0;assert page.evaluate('releases.length')==0
 page.evaluate('failSave=false');batch.get_by_role('button',name='Review answers and files',exact=True).click();dialog=batch.locator('dialog');expect(dialog).to_contain_text('bio.txt');assert 'private.txt' not in dialog.inner_text();assert 'PRIVATE_GOAL_CANARY' not in dialog.inner_text();assert page.evaluate('releases.length')==0
 dialog.get_by_role('button',name='Keep private',exact=True).click();expect(dialog).not_to_be_visible()
 row.locator('textarea').fill('A'*2000);batch.get_by_role('button',name='Review answers and files',exact=True).click();expect(dialog).to_be_visible();assert dialog.evaluate('(e)=>{const r=e.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.bottom<=innerHeight;}');dialog.get_by_role('button',name='Keep private',exact=True).click();expect(dialog).not_to_be_visible()
 row.locator('textarea').fill('BATCH_ANSWER_CANARY');page.evaluate('changed=true');batch.get_by_role('button',name='Review answers and files',exact=True).click();dialog.get_by_role('button',name='Send to Fixture Agent',exact=True).click();expect(batch).to_contain_text('Not sent');assert page.evaluate('releases.length')==0
 page.evaluate('changed=false');batch.get_by_role('button',name='Check delivery of this batch',exact=True).click();dialog.get_by_role('button',name='Send to Fixture Agent',exact=True).click();expect(batch).to_contain_text('Receipt batch-receipt');assert page.evaluate('releases.length')==1
 release=page.evaluate('releases[0]');assert len(release['answers'])==2;assert release['answers'][0]['files'][0]['name']=='bio.txt';assert release['answers'][1]['value']=='business';assert 'private.txt' not in json.dumps(release)
 messages=page.evaluate('messages');storage=[m for m in messages if m.get('protocol')=='passport-hosted-v1'];assert 'BATCH_ANSWER_CANARY' not in json.dumps(storage);assert json.loads(recovery.read_text())['key'] not in json.dumps(messages)
 # A lock racing a local addon encryption never installs its stale result.
 result=inner.evaluate("async()=>{const s=fixtureApi.getState();const pending=fixtureApi.save({...s.document,revision:s.document.revision+1},{vaultId:s.document.vaultId,revision:s.document.revision,scope:s.scope});document.querySelector('#lock').click();try{await pending;return false;}catch(e){return e.message==='conflict';}}")
 assert result;expect(f.locator('#panel-fixture')).to_be_hidden();assert f.locator('#panel-fixture').inner_text()=='';assert 'PRIVATE_GOAL_CANARY' not in f.locator('body').inner_text();assert not errors,errors
 browser.close();server.shutdown();print('PASS opaque batch: private drafts/uploads/addon, stale save/lock guard, failed-save block, explicit exact files, cancel/change/retry, one recipient batch, no key/other-record leak, mobile.')
