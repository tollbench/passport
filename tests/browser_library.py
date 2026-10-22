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
  if(window.skipHost)return;
  nonce=q.nonce;const init={protocol:PROTOCOL,type:'init',nonce,capability,scopes:['personal','business'],scope:'personal'};
  if(!validateInit(init))throw Error('bad init');frame.contentWindow.postMessage(init,'*');return;
 }
 if(!validateRequest(q)||q.nonce!==nonce||q.capability!==capability)return;
 const base={protocol:PROTOCOL,type:'result',nonce,capability,id:q.id,op:q.op,scope:q.scope};
 const saved=JSON.parse(localStorage.getItem(q.scope)||'null');
 let result;
 if(q.op==='load'){
  if(window.failLoad){frame.contentWindow.postMessage({...base,ok:false,error:'unavailable'},'*');return;}
  if(window.deferLoad){window.resumeLoad=()=>{window.deferLoad=false;frame.contentWindow.postMessage({...base,ok:true,envelope:saved?.envelope||null,etag:saved?.etag||null},'*')};return;}
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


with tempfile.TemporaryDirectory(prefix='passport-library-') as tmp, ThreadingHTTPServer(('127.0.0.1',0),partial(Handler,directory=str(ASSETS))) as server, sync_playwright() as p:
    threading.Thread(target=server.serve_forever,daemon=True).start()
    options={'headless':True}
    if os.environ.get('PASSPORT_CHROME'): options['executable_path']=os.environ['PASSPORT_CHROME']
    browser=p.chromium.launch(**options); context=browser.new_context(accept_downloads=True,viewport={'width':590,'height':1000});page=context.new_page();page.set_default_timeout(10000)
    errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    base=f'http://127.0.0.1:{server.server_port}';page.goto(base+'/host');f=page.frame_locator('#vault')
    proof=Path(os.environ.get('PASSPORT_LIBRARY_PROOF',tempfile.gettempdir()));proof.mkdir(parents=True,exist_ok=True)
    expect(f.locator('body')).to_have_attribute('data-book-state','empty')
    expect(f.locator('#welcome')).to_contain_text('Your browser creates a new encryption key')
    expect(f.locator('#restore-book')).not_to_have_attribute('open','')
    expect(f.locator('#restore')).to_be_hidden()
    page.screenshot(path=str(proof/'passport-library-new.png'),full_page=True)
    with page.expect_download() as d:f.locator('#create').click()
    recovery=Path(tmp)/'key.json';d.value.save_as(recovery)
    expect(f.locator('body')).to_have_attribute('data-book-state','recovery')
    assert not page.evaluate("receipts.some(q=>q.op==='save')")
    f.locator('#confirm-create').click();expect(f.locator('body')).to_have_attribute('data-book-state','open')
    expect(f.locator('#entries')).to_contain_text('Your library starts here.')
    expect(f.locator('#information-editor')).not_to_have_attribute('open','')
    expect(f.locator('#answer-editor')).not_to_have_attribute('open','')
    page.screenshot(path=str(proof/'passport-library-empty.png'),full_page=True)
    for title,content,tag in [('Founder story','A short account of how this example company began. This is synthetic demonstration information.','about_business'),('Podcast preferences','Practical shows for people building small businesses.','podcast_preferences')]:
        f.locator('#add-information').click();form=f.locator('#entry-form');form.locator('[name=title]').fill(title);form.locator('[name=content]').fill(content);form.locator('[name=tag]').fill(tag);form.locator('button').click();expect(f.locator('#information-editor')).not_to_have_attribute('open','')
    with page.expect_file_chooser() as fc:f.locator('.library-upload').click()
    fc.value.set_files({'name':'Example company overview.txt','mimeType':'text/plain','buffer':b'SYNTHETIC_PRIVATE_FILE'})
    expect(f.locator('#entries .record')).to_have_count(3)
    f.locator('#answer-editor > summary').evaluate("e=>e.scrollIntoView({block:'center',behavior:'instant'})");f.locator('#answer-editor > summary').click();expect(f.locator('#answer-editor')).to_have_attribute('open','');form=f.locator('#question-form')
    for name,value in {'question':'Who is this project for?','subject':'business:example','tag':'audience','answer':'Independent business owners.','taskId':'task:example'}.items():form.locator(f'[name={name}]').fill(value)
    form.locator('button').last.click();expect(f.locator('#entries .record')).to_have_count(4)
    expect(f.locator('#book-count')).to_contain_text('4 saved items')
    f.locator('[data-library-kind=file]').click();expect(f.locator('#entries .record')).to_have_count(1);expect(f.locator('#entries')).to_contain_text('Example company overview.txt')
    f.locator('[data-library-kind=answer]').click();expect(f.locator('#entries .record')).to_have_count(1);expect(f.locator('#entries')).to_contain_text('Who is this project for?')
    f.locator('[data-library-kind=all]').click();f.locator('#library-search').fill('PODCAST_preferences');expect(f.locator('#entries .record')).to_have_count(1)
    f.locator('#library-search').fill('never-matches');expect(f.locator('#entries')).to_contain_text('No items match')
    f.locator('#library-search').fill('');expect(f.locator('#entries .record')).to_have_count(4)
    f.locator('#entries .record').first.locator('summary').click();expect(f.locator('#entries .record').first.locator('.record-body')).to_be_visible()
    f.locator('#book-heading').scroll_into_view_if_needed();page.screenshot(path=str(proof/'passport-library-open.png'),full_page=True)
    page.set_viewport_size({'width':390,'height':844});page.screenshot(path=str(proof/'passport-library-mobile.png'),full_page=True)
    inner=page.frames[1];assert inner.evaluate('document.documentElement.scrollWidth<=innerWidth')
    f.locator('#library-search').fill('Founder story');f.locator('#lock').click();expect(f.locator('body')).to_have_attribute('data-book-state','locked')
    expect(f.locator('#library-search')).to_have_value('');expect(f.locator('#entries')).to_be_empty();expect(f.locator('#book-count')).to_be_empty();expect(f.locator('#library-results')).to_be_empty()
    assert 'Founder story' not in f.locator('body').inner_text();assert 'podcast_preferences' not in f.locator('body').inner_text()
    f.locator('#locked').scroll_into_view_if_needed();page.screenshot(path=str(proof/'passport-library-locked-mobile.png'),full_page=True)
    page.set_viewport_size({'width':590,'height':1000});f.locator('#intro-heading').scroll_into_view_if_needed();page.screenshot(path=str(proof/'passport-library-locked.png'),full_page=True)
    f.locator('#unlock').set_input_files(str(recovery));expect(f.locator('#entries .record')).to_have_count(4)
    f.locator('#vault-scope').select_option('business');f.locator('dialog').get_by_role('button',name='Continue',exact=True).click();expect(f.locator('body')).to_have_attribute('data-book-state','empty');expect(f.locator('#intro-heading')).to_have_text('Your business information.');assert 'Founder story' not in f.locator('body').inner_text()
    # Loading and failed loads never masquerade as an empty account or allow creation.
    page.evaluate('window.failLoad=true');f.locator('#reload-vault').click();f.locator('dialog').get_by_role('button',name='Continue',exact=True).click();expect(f.locator('body')).to_have_attribute('data-book-state','error');expect(f.locator('#create')).to_be_hidden();expect(f.locator('#book-map')).to_be_hidden()
    page.evaluate('window.failLoad=false;window.deferLoad=true');f.locator('#reload-vault').click();f.locator('dialog').get_by_role('button',name='Continue',exact=True).click();expect(f.locator('body')).to_have_attribute('data-book-state','loading');expect(f.locator('#create')).to_be_hidden();page.wait_for_function("typeof window.resumeLoad === 'function'");page.evaluate('window.resumeLoad()');expect(f.locator('body')).to_have_attribute('data-book-state','empty')
    messages=json.dumps(page.evaluate('receipts'));assert all(value not in messages for value in ['Founder story','podcast_preferences','SYNTHETIC_PRIVATE_FILE',json.loads(recovery.read_text())['key']])
    # A failed initial handshake has no live host Reload action: explain reopening instead.
    disconnected=browser.new_page();disconnected.add_init_script('window.skipHost=true');disconnected.goto(base+'/host');missing=disconnected.frame_locator('#vault')
    expect(missing.locator('body')).to_have_attribute('data-book-state','error',timeout=35000)
    expect(missing.locator('#intro-description')).to_contain_text('Close this book and open it again')
    expect(missing.locator('#reload-vault')).to_be_hidden();expect(missing.locator('#create')).to_be_hidden()
    disconnected.close()
    assert not errors,errors
    browser.close();server.shutdown()
    print('PASS library: real new/recovery/locked/open/loading/error states, collapsed editors, actual note/file/answer library, exact title/tag search and type filters, plaintext clearing on lock/scope, encrypted-only host messages, desktop/mobile layout')
