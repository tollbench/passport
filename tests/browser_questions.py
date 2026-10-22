"""Synthetic opaque question flow; no real owners, agents, providers or network services."""
import json
import os
import tempfile
import threading
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

from importlib.resources import files
ASSETS = Path(str(files('toll_passport').joinpath('web')))
HOST = '''<!doctype html><title>Question fixture</title><style>body{margin:0}iframe{width:100%;height:100vh;border:0}</style>
<iframe id="vault" sandbox="allow-scripts allow-downloads" src="/hosted.html"></iframe><script type="module">
import {PROTOCOL,validateReady,validateRequest} from './hosted-bridge.mjs';
import {QUESTION_PROTOCOL,validateQuestionReady,validateAnswerRelease} from './question-channel.mjs';
const frame=document.querySelector('iframe'), cap='b'.repeat(64);let nonce,qn;
window.messages=[];window.releases=[];window.failSave=false;window.changed=false;
const context={requestId:crypto.randomUUID(),token:'signed-synthetic-question',scope:'personal',subject:'owner:synthetic:personal',taskId:'deal:synthetic:step:one',question:{id:crypto.randomUUID(),digest:'a'.repeat(64),title:'Which founder biography should I use?',format:'short_answer'},recipient:{id:'agent-one',name:'Synthetic Agent One'},label:'founder_bio',expiresAt:Date.now()+600000};
window.addEventListener('message',e=>{
 if(e.source!==frame.contentWindow||e.origin!=='null')return;const q=e.data;messages.push(q);
 const send=v=>frame.contentWindow.postMessage(v,'*');
 if(validateQuestionReady(q)){qn=q.nonce;send({protocol:QUESTION_PROTOCOL,type:'init',nonce:qn,capability:cap,context});return;}
 if(validateAnswerRelease(q)&&q.nonce===qn&&q.capability===cap){
  if(window.changed){send({protocol:QUESTION_PROTOCOL,type:'receipt',nonce:qn,capability:cap,id:q.id,ok:false,error:'conflict'});return;}
  if(!releases.some(v=>v.approvalId===q.approvalId))releases.push(q);
  send({protocol:QUESTION_PROTOCOL,type:'receipt',nonce:qn,capability:cap,id:q.id,ok:true,receiptId:'synthetic-receipt'});return;
 }
 if(validateReady(q)){nonce=q.nonce;send({protocol:PROTOCOL,type:'init',nonce,capability:cap,scopes:['personal','business'],scope:'personal'});return;}
 if(!validateRequest(q)||q.nonce!==nonce||q.capability!==cap)return;
 const base={protocol:PROTOCOL,type:'result',nonce,capability:cap,id:q.id,op:q.op,scope:q.scope},old=JSON.parse(localStorage.getItem(q.scope)||'null');
 if(q.op==='load'){send({...base,ok:true,envelope:old?.envelope||null,etag:old?.etag||null});return;}
 if(window.failSave){send({...base,ok:false,error:'unavailable'});return;}
 if(q.op==='save'){const etag=crypto.randomUUID();localStorage.setItem(q.scope,JSON.stringify({envelope:q.envelope,etag}));send({...base,ok:true,etag});}
});</script>'''
class Handler(SimpleHTTPRequestHandler):
    def log_message(self,*args): pass
    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin','*');self.send_header('Cache-Control','no-store');super().end_headers()
    def do_GET(self):
        if self.path=='/host':
            data=HOST.encode();self.send_response(200);self.send_header('Content-Type','text/html');self.end_headers();self.wfile.write(data)
        else:super().do_GET()

with tempfile.TemporaryDirectory(prefix='passport-question-') as tmp, ThreadingHTTPServer(('127.0.0.1',0),partial(Handler,directory=str(ASSETS))) as server,sync_playwright() as p:
    threading.Thread(target=server.serve_forever,daemon=True).start()
    options={'headless':True}
    if os.environ.get('PASSPORT_CHROME'):options['executable_path']=os.environ['PASSPORT_CHROME']
    browser=p.chromium.launch(**options);page=browser.new_page(accept_downloads=True);page.set_default_timeout(10000)
    errors=[];requests=[];page.on('pageerror',lambda e:errors.append(str(e)));page.on('request',lambda r:requests.append((r.method,r.url,r.post_data)))
    base=f'http://127.0.0.1:{server.server_port}';page.goto(base+'/host');f=page.frame_locator('#vault')
    expect(f.locator('[data-question-locked]')).to_be_visible();expect(f.locator('[data-question-editor]')).to_be_hidden()
    f.locator('#create').focus()
    with page.expect_download() as d:f.locator('#create').press('Enter')
    recovery=Path(tmp)/'recovery.json';d.value.save_as(recovery);f.locator('#confirm-create').click()
    expect(f.locator('[data-question-editor]')).to_be_visible()
    expect(f.locator('[data-question-title]')).to_be_focused()
    assert f.locator('[data-question-title]').evaluate('(el) => { const r=el.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight; }')
    f.locator('#add-information').click()
    f.locator('#entry-form [name=title]').fill('Private unrelated note');f.locator('#entry-form [name=content]').fill('NEVER_RELEASE_OTHER_INFORMATION');f.locator('#entry-form button').click()
    answer=f.locator('#agent-question textarea');answer.fill('APPROVED_ANSWER_CANARY')
    assert 'APPROVED_ANSWER_CANARY' not in json.dumps(page.evaluate('messages'))
    assert 'APPROVED_ANSWER_CANARY' not in page.locator('body').inner_text()
    page.evaluate('window.failSave=true');f.locator('[data-question-review]').click()
    expect(f.locator('[data-question-feedback]')).to_contain_text('Sharing is paused');expect(answer).to_have_value('APPROVED_ANSWER_CANARY')
    assert page.evaluate('releases.length')==0;assert f.locator('dialog').count()==0
    page.evaluate('window.failSave=false');f.locator('[data-question-review]').click()
    expect(f.locator('dialog')).to_contain_text('Tollbench and Synthetic Agent One can read')
    assert 'APPROVED_ANSWER_CANARY' not in json.dumps(page.evaluate('messages'))
    page.screenshot(path=str(Path(tempfile.gettempdir())/'passport-question-review.png'))
    f.locator('dialog').get_by_role('button',name='Keep private',exact=True).click();assert page.evaluate('releases.length')==0
    page.reload();expect(f.locator('[data-question-locked]')).to_be_visible();f.locator('#unlock').set_input_files(str(recovery))
    expect(f.locator('[data-question-title]')).to_be_focused()
    assert f.locator('[data-question-title]').evaluate('(el) => { const r=el.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight; }')
    page.screenshot(path=str(Path(tempfile.gettempdir())/'passport-question-unlocked.png'))
    expect(answer).to_have_value('APPROVED_ANSWER_CANARY');expect(f.locator('[data-question-feedback]')).to_contain_text('Private suggestion')
    # A server-side changed question cannot receive the displayed old answer.
    page.evaluate('window.changed=true');f.locator('[data-question-review]').click();f.locator('dialog').get_by_role('button',name='Send this answer',exact=True).click()
    expect(f.locator('[data-question-feedback]')).to_contain_text('Not sent');assert page.evaluate('releases.length')==0
    page.evaluate('window.changed=false');f.locator('[data-question-review]').click();f.locator('dialog').get_by_role('button',name='Send this answer',exact=True).click()
    expect(f.locator('[data-question-feedback]')).to_contain_text('Answer sent to Synthetic Agent One');assert page.evaluate('releases.length')==1
    release=page.evaluate('releases[0]');assert release['answer']=='APPROVED_ANSWER_CANARY'
    assert set(release)=={'protocol','type','nonce','capability','id','token','approvalId','answer'}
    messages=page.evaluate('messages');storage=[m for m in messages if m.get('protocol')=='passport-hosted-v1']
    assert 'APPROVED_ANSWER_CANARY' not in json.dumps(storage)
    assert 'NEVER_RELEASE_OTHER_INFORMATION' not in json.dumps(messages)
    assert json.loads(recovery.read_text())['key'] not in json.dumps(messages)
    assert all(method=='GET' and url.startswith(base) and body is None for method,url,body in requests)
    page.set_viewport_size({'width':390,'height':844})
    answer.fill('A'*2000);f.locator('[data-question-review]').click()
    dialog=f.locator('dialog');expect(dialog).to_be_visible()
    assert dialog.evaluate('(el)=>{const r=el.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight;}')
    cancel=dialog.get_by_role('button',name='Keep private',exact=True);cancel.scroll_into_view_if_needed()
    assert cancel.evaluate('(el)=>{const r=el.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight;}')
    page.screenshot(path=str(Path(tempfile.gettempdir())/'passport-question-mobile-review.png'))
    cancel.click()
    assert page.frames[1].evaluate('document.documentElement.scrollWidth <= innerWidth')
    page.screenshot(path=str(Path(tempfile.gettempdir())/'passport-question-mobile.png'))
    assert not errors,errors
    browser.close();server.shutdown()
    print('PASS opaque question: locked request, local private draft/prefill, failed-save gate, explicit cancel/approve, changed-question refusal, exact selected release, ciphertext storage, no other info/key leak, mobile')
