"""Synthetic, local-only host plus opaque iframe acceptance. No model/provider calls."""
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
HOST = '''<!doctype html><title>Synthetic Passport host</title><link rel=icon href=data:,><style>html,body{margin:0;height:100%;overflow:hidden}iframe{display:block}</style><iframe id="vault" sandbox="allow-scripts allow-downloads" src="/hosted.html" style="width:100%;height:100vh;border:0"></iframe><script type="module">
import {PROTOCOL,validateReady,validateRequest,validateInit,validateResult} from './hosted-bridge.mjs';
const frame=document.querySelector('iframe');
window.receipts=[];window.conflict=false;window.fail=false;window.tamper=false;
window.crossOriginBlocked=()=>{try{return !frame.contentWindow.document}catch{return true}};
let nonce,capability=crypto.randomUUID().replaceAll('-','');
window.addEventListener('message',event=>{
 const q=event.data;
 if(event.source!==frame.contentWindow||event.origin!=='null')return;
 window.receipts.push(q);
 if(validateReady(q)){
  nonce=q.nonce;const init={protocol:PROTOCOL,type:'init',nonce,capability,scopes:['personal','business'],scope:'personal'};
  if(!validateInit(init))throw Error('bad init');frame.contentWindow.postMessage(init,'*');return;
 }
 if(!validateRequest(q)||q.nonce!==nonce||q.capability!==capability)return;
 const base={protocol:PROTOCOL,type:'result',nonce,capability,id:q.id,op:q.op,scope:q.scope};
 const saved=JSON.parse(localStorage.getItem(q.scope)||'null');
 let result;
 if(q.op==='load'){
  let envelope=saved?.envelope||null;
  if(window.tamper&&envelope)envelope={...envelope,ciphertext:('A'===envelope.ciphertext[0]?'B':'A')+envelope.ciphertext.slice(1)};
  result={...base,ok:true,etag:saved?.etag||null,envelope};
 }else if(window.fail) result={...base,ok:false,error:'unavailable'};
 else if(window.conflict||q.expectedEtag!==(saved?.etag||null))result={...base,ok:false,error:'conflict'};
 else if(q.op==='save'){
  const etag=crypto.randomUUID();localStorage.setItem(q.scope,JSON.stringify({envelope:q.envelope,etag}));
  result={...base,ok:true,etag};
 }else{localStorage.removeItem(q.scope);result={...base,ok:true,etag:null};}
 if(!validateResult(result))throw Error('bad result');
 frame.contentWindow.postMessage(result,'*');
});</script>'''

class Handler(SimpleHTTPRequestHandler):
    def log_message(self, *args): pass
    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()
    def do_GET(self):
        if self.path == '/host':
            body=HOST.encode();self.send_response(200);self.send_header('Content-Type','text/html');self.send_header('Content-Length',str(len(body)));self.end_headers();self.wfile.write(body)
        else: super().do_GET()

with tempfile.TemporaryDirectory(prefix='passport-hosted-') as tmp, ThreadingHTTPServer(('127.0.0.1',0),partial(Handler,directory=str(ASSETS))) as server, sync_playwright() as p:
    threading.Thread(target=server.serve_forever,daemon=True).start()
    options={'headless':True}
    if os.environ.get('PASSPORT_CHROME'): options['executable_path']=os.environ['PASSPORT_CHROME']
    browser=p.chromium.launch(**options); context=browser.new_context(accept_downloads=True);page=context.new_page();page.set_default_timeout(10000)
    requests=[];errors=[];failed_requests=[]
    page.on('request',lambda r:requests.append((r.method,r.url)))
    page.on('requestfailed',lambda r:failed_requests.append((r.url,r.failure)))
    page.on('pageerror',lambda e:errors.append(str(e)))
    base=f'http://127.0.0.1:{server.server_port}'
    page.goto(base+'/host'); f=page.frame_locator('#vault')
    expect(f.locator('#create')).to_be_visible()
    assert page.evaluate('crossOriginBlocked()')
    assert page.locator('#vault').get_attribute('sandbox')=='allow-scripts allow-downloads'
    with page.expect_download() as d:f.locator('#create').click()
    recovery=Path(tmp)/'recovery.json';d.value.save_as(recovery)
    expect(f.locator('#creation')).to_be_visible()
    assert not page.evaluate("receipts.some(q=>q.op==='save')")
    f.locator('#confirm-create').click();expect(f.locator('#book')).to_be_visible()
    expect(f.locator('#book-intro')).to_be_hidden()
    expect(f.locator('#book-heading')).to_be_focused()
    assert f.locator('body > header').count() == 0
    expect(f.locator('.book-contents')).to_be_visible()
    f.get_by_role('link',name='02 Your files').click()
    expect(f.locator('#files-chapter')).to_be_focused()
    f.get_by_role('link',name='01 Your information').click()
    assert page.evaluate("receipts.filter(q=>q.op==='save').length")==1
    f.locator('#entry-form [name=title]').fill('PRIVATE_TITLE_CANARY')
    f.locator('#entry-form [name=content]').fill('PRIVATE_BODY_CANARY')
    f.locator('#entry-form button').click();expect(f.locator('#status')).to_contain_text('Saved privately')
    f.locator('#upload').set_input_files({'name':'private-file.txt','mimeType':'text/plain','buffer':b'PRIVATE_FILE_CANARY'})
    expect(f.locator('#entries')).to_contain_text('private-file.txt')
    question=f.locator('#question-form')
    for name,value in {'question':'Who is this for?','subject':'business:fixture','tag':'audience','taskId':'task:one','answer':'PRIVATE_ANSWER_CANARY'}.items():question.locator(f'[name={name}]').fill(value)
    question.get_by_role('button',name='Save answer privately',exact=True).click();expect(f.locator('#entries .record')).to_have_count(3)
    for name,value in {'subject':'business:fixture','tag':'audience','taskId':'task:one'}.items():question.locator(f'[name={name}]').fill(value)
    expect(f.locator('#answer-suggestions')).to_contain_text('PRIVATE_ANSWER_CANARY')
    f.get_by_role('button',name='Use this answer',exact=True).click();expect(question.locator('[name=answer]')).to_have_value('PRIVATE_ANSWER_CANARY')
    # Explicit selected release downloads stay inside frame; they never enter the bridge.
    f.locator('#entries .record').first.get_by_role('button',name='Choose what to share').click()
    f.locator('input[value="content"]').check()
    f.locator('#share-form [name=recipient]').fill('Synthetic recipient');f.locator('#share-form [name=purpose]').fill('Synthetic purpose')
    f.locator('#share-form button').first.click();expect(f.locator('#share-preview')).to_contain_text('PRIVATE_BODY_CANARY')
    with page.expect_download() as d:f.get_by_role('button',name='Download encrypted package',exact=True).click()
    shared=Path(tmp)/'shared.json';d.value.save_as(shared);assert 'PRIVATE_BODY_CANARY' not in shared.read_text()
    # Conflict leaves both saved snapshot and input intact, and does not report saved.
    saved=page.evaluate("localStorage.getItem('personal')")
    page.evaluate('window.conflict=true')
    f.locator('#entry-form [name=title]').fill('Conflict draft');f.locator('#entry-form [name=content]').fill('UNSAVED_CANARY')
    f.locator('#entry-form button').click();expect(f.locator('#status')).to_contain_text('Save not confirmed')
    expect(f.locator('#entry-form [name=content]')).to_have_value('UNSAVED_CANARY')
    assert page.evaluate("localStorage.getItem('personal')")==saved
    page.evaluate('window.conflict=false;window.fail=true')
    f.locator('#entry-form button').click();expect(f.locator('#status')).to_contain_text('Action not confirmed')
    expect(f.locator('#entry-form [name=content]')).to_have_value('UNSAVED_CANARY')
    page.evaluate('window.fail=false')
    # Switching requires in-frame consent and clears keys, plaintext, forms, suggestions, previews.
    f.locator('#vault-scope').select_option('business')
    f.locator('dialog').get_by_role('button',name='Cancel',exact=True).click();expect(f.locator('#vault-scope')).to_have_value('personal')
    expect(f.locator('#entry-form [name=content]')).to_have_value('UNSAVED_CANARY')
    f.locator('#vault-scope').select_option('business');f.locator('dialog').get_by_role('button',name='Continue',exact=True).click()
    expect(f.locator('#create')).to_be_visible()
    assert 'PRIVATE_BODY_CANARY' not in f.locator('body').inner_text()
    expect(f.locator('#answer-suggestions')).to_be_empty();expect(f.locator('#share-preview')).to_be_empty()
    f.locator('#vault-scope').select_option('personal');expect(f.locator('#locked')).to_be_visible()
    expect(f.locator('#unlock')).to_be_enabled();f.locator('#unlock').set_input_files(str(recovery));expect(f.locator('#entries')).to_contain_text('PRIVATE_BODY_CANARY')
    expect(f.locator('#book-heading')).to_be_focused()
    f.locator('#book-tools > summary').click()
    # Backup + recovery restore into empty business scope, with no host key exposure.
    with page.expect_download() as d:f.locator('#backup').click()
    backup=Path(tmp)/'backup.json';d.value.save_as(backup)
    f.locator('#vault-scope').select_option('business');f.locator('dialog').get_by_role('button',name='Continue',exact=True).click();expect(f.locator('#create')).to_be_visible()
    with page.expect_file_chooser() as fc:f.locator('#restore').set_input_files(str(backup))
    fc.value.set_files(str(recovery));expect(f.locator('#entries')).to_contain_text('PRIVATE_BODY_CANARY')
    # Delete real hosted snapshot and verify personal scope survives.
    f.locator('#delete-vault').click();f.locator('dialog').get_by_role('button',name='Continue',exact=True).click();expect(f.locator('#create')).to_be_visible()
    assert page.evaluate("localStorage.getItem('business')")==None
    assert page.evaluate("localStorage.getItem('personal')")==saved
    all_messages=json.dumps(page.evaluate('receipts'))
    secrets=['PRIVATE_BODY_CANARY','PRIVATE_TITLE_CANARY','PRIVATE_FILE_CANARY','PRIVATE_ANSWER_CANARY','UNSAVED_CANARY',json.loads(recovery.read_text())['key']]
    assert all(secret not in all_messages for secret in secrets)
    # Reload persists only ciphertext; wrong recovery and tampered ciphertext fail closed.
    page.reload();expect(f.locator('#locked')).to_be_visible()
    wrong=json.loads(recovery.read_text());wrong['key']='A'*43+'='
    expect(f.locator('#unlock')).to_be_enabled();f.locator('#unlock').set_input_files({'name':'wrong.json','mimeType':'application/json','buffer':json.dumps(wrong).encode()});expect(f.locator('#status')).to_contain_text('Action not confirmed')
    expect(f.locator('#book')).to_be_hidden()
    page.evaluate('window.tamper=true');f.locator('#reload-vault').focus();f.locator('#reload-vault').press('Enter');f.locator('dialog').get_by_role('button',name='Continue',exact=True).click()
    expect(f.locator('#locked')).to_be_visible();expect(f.locator('#unlock')).to_be_enabled();f.locator('#unlock').set_input_files(str(recovery));expect(f.locator('#status')).to_contain_text('Action not confirmed');expect(f.locator('#book')).to_be_hidden()
    page.evaluate('window.tamper=false');f.locator('#reload-vault').focus();f.locator('#reload-vault').press('Enter');f.locator('dialog').get_by_role('button',name='Continue',exact=True).click()
    expect(f.locator('#unlock')).to_be_enabled();f.locator('#unlock').set_input_files(str(recovery));expect(f.locator('#entries')).to_contain_text('PRIVATE_BODY_CANARY')
    actual=page.frames[1]
    assert actual.evaluate("async()=>{try{await fetch('https://example.invalid/leak');return false}catch{return true}}")
    assert all('CSP' in failure for url,failure in failed_requests if url.startswith('https://example.invalid'))
    page.set_viewport_size({'width':390,'height':844})
    assert actual.evaluate('document.documentElement.scrollWidth<=innerWidth')
    page.screenshot(path=str(Path(tempfile.gettempdir())/'passport-hosted-mobile.png'),full_page=True)
    page.set_viewport_size({'width':1100,'height':1000})
    page.screenshot(path=str(Path(tempfile.gettempdir())/'passport-hosted-desktop.png'),full_page=True)
    assert not errors,errors
    allowed={'/host','/hosted.html','/style.css','/hosted.mjs','/hosted-bridge.mjs','/vault.mjs','/answers.mjs','/question-channel.mjs','/question-answer.mjs'}
    assert all(method=='GET' and url.removeprefix(base) in allowed for method,url in requests if not url.startswith('https://example.invalid')),requests
    assert all(secret not in json.dumps(page.evaluate("Object.values(localStorage)")) for secret in secrets)
    print('PASS hosted: opaque sandbox, recovery-before-create, encrypted persistence, notes/files/answers/reuse, selected export, conflict/failure draft retention, scope consent+clearing, backup restore, delete isolation, reload/recovery, tamper/wrong-key rejection, ciphertext-only bridge/storage, CSP network block, mobile layout, no unexpected requests or page errors')
    browser.close();server.shutdown()
