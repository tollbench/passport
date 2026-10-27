"""Synthetic host + opaque iframe: create with a code, wrong tries, right code, recovery file."""
import os
import tempfile
import threading
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

ASSETS = Path(os.environ.get('PASSPORT_WEB') or Path(__file__).resolve().parents[1] / 'src/toll_passport/web')
HOST = '''<!doctype html><title>Synthetic code host</title><link rel=icon href=data:,><iframe id="vault" sandbox="allow-scripts allow-downloads" src="/hosted.html" style="width:100%;height:95vh;border:0"></iframe><script type="module">
import {PROTOCOL,validateReady,validateRequest,validateResult} from './hosted-bridge.mjs';
const frame=document.querySelector('iframe');
window.receipts=[];let nonce,capability=crypto.randomUUID().replaceAll('-','');
const rows={personal:{envelope:null,etag:null},business:{envelope:null,etag:null}};
let code=null;const loginNonce='L'.repeat(43);
const status=()=>code?{hasCode:true,vaultId:code.vaultId,salt:code.salt,iterations:code.iterations,attemptsLeft:code.disabled?0:10-code.attempts,disabled:code.disabled,loginNonce}:
  {hasCode:false,vaultId:null,salt:null,iterations:null,attemptsLeft:10,disabled:false,loginNonce};
window.codeRow=()=>code;
window.addEventListener('message',event=>{
 const q=event.data;
 if(event.source!==frame.contentWindow||event.origin!=='null')return;
 window.receipts.push(q);
 if(validateReady(q)){nonce=q.nonce;frame.contentWindow.postMessage({protocol:PROTOCOL,type:'init',nonce,capability,scopes:['personal','business'],scope:'personal'},'*');return;}
 if(!validateRequest(q)||q.nonce!==nonce||q.capability!==capability)return;
 const base={protocol:PROTOCOL,type:'result',nonce,capability,id:q.id,op:q.op,scope:q.scope};
 let result;
 if(q.op==='load')result={...base,ok:true,etag:rows[q.scope].etag,envelope:rows[q.scope].envelope};
 else if(q.op==='save'){if(q.expectedEtag!==rows[q.scope].etag)result={...base,ok:false,error:'conflict'};else{const etag=crypto.randomUUID();rows[q.scope]={envelope:q.envelope,etag};result={...base,ok:true,etag};}}
 else if(q.op==='delete'){rows[q.scope]={envelope:null,etag:null};result={...base,ok:true,etag:null};}
 else if(q.op==='code-status')result={...base,ok:true,status:status()};
 else if(q.op==='code-set'){code={...q.code,attempts:0,disabled:false};result={...base,ok:true,status:status()};}
 else if(q.op==='code-unlock'){
  if(!code)result={...base,ok:false,error:'no-code',attemptsLeft:10};
  else if(code.disabled)result={...base,ok:false,error:'disabled',attemptsLeft:0};
  else if(q.auth!==code.auth){code.attempts++;if(code.attempts>=10)code.disabled=true;
    result=code.disabled?{...base,ok:false,error:'disabled',attemptsLeft:0}:{...base,ok:false,error:'wrong',attemptsLeft:10-code.attempts};}
  else{code.attempts=0;result={...base,ok:true,opened:{share:code.share,wrappedKey:code.wrappedKey,vaultId:code.vaultId}};}
 }
 if(!validateResult(result))throw Error('bad result '+q.op);
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
            body = HOST.encode()
            self.send_response(200); self.send_header('Content-Type', 'text/html')
            self.send_header('Content-Length', str(len(body))); self.end_headers(); self.wfile.write(body)
        else:
            super().do_GET()


def type_code(frame, slot, digits):
    frame.locator(f'#{slot} input').first.fill(digits)


with tempfile.TemporaryDirectory(prefix='passport-code-') as tmp, \
        ThreadingHTTPServer(('127.0.0.1', 0), partial(Handler, directory=str(ASSETS))) as server, sync_playwright() as p:
    threading.Thread(target=server.serve_forever, daemon=True).start()
    options = {'headless': True}
    if os.environ.get('PASSPORT_CHROME'): options['executable_path'] = os.environ['PASSPORT_CHROME']
    browser = p.chromium.launch(**options)
    context = browser.new_context(accept_downloads=True)
    page = context.new_page(); page.set_default_timeout(15000)
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.goto(f'http://127.0.0.1:{server.server_port}/host')
    f = page.frame_locator('#vault')
    expect(f.locator('#welcome')).to_be_visible()
    expect(f.locator('#create-code input')).to_have_count(6)
    assert f.locator('#create-code input').first.get_attribute('inputmode') == 'numeric'
    type_code(f, 'create-code', '482913')
    expect(f.locator('#welcome-heading')).to_have_text('Enter it again.')
    with page.expect_download() as download:
        type_code(f, 'create-code', '482913')
    recovery = Path(tmp) / 'recovery.json'; download.value.save_as(recovery)
    assert download.value.suggested_filename == 'passport-recovery.json'
    expect(f.locator('#book')).to_be_visible()
    expect(f.locator('#creation')).to_be_visible()
    assert '482913' not in str(page.evaluate('JSON.stringify(receipts)'))
    f.locator('#confirm-create').click()
    f.locator('#lock').click()
    expect(f.locator('#locked')).to_be_visible()
    expect(f.locator('#locked-heading')).to_have_text('Enter your 6-digit code.')
    expect(f.locator('#recovery-door')).to_be_hidden()
    type_code(f, 'unlock-code', '000000')
    expect(f.locator('#unlock-feedback')).to_contain_text('9 tries left')
    expect(f.locator('#book')).to_be_hidden()
    type_code(f, 'unlock-code', '482913')
    expect(f.locator('#book')).to_be_visible()
    assert page.evaluate('codeRow().attempts') == 0
    # Recovery file stays the backup.
    f.locator('#lock').click()
    expect(f.locator('#locked')).to_be_visible()
    f.locator('#use-recovery').click()
    expect(f.locator('#recovery-door')).to_be_visible()
    f.locator('#unlock').set_input_files(str(recovery))
    expect(f.locator('#book')).to_be_visible()
    # Change the code from the open book.
    f.locator('#book-tools > summary').click()
    f.locator('#change-code').click()
    expect(f.locator('#code-setup')).to_be_visible()
    type_code(f, 'setup-code', '111222')
    type_code(f, 'setup-code', '111222')
    expect(f.locator('#code-setup')).to_be_hidden()
    f.locator('#lock').click()
    type_code(f, 'unlock-code', '482913')
    expect(f.locator('#unlock-feedback')).to_contain_text('not right')
    type_code(f, 'unlock-code', '111222')
    expect(f.locator('#book')).to_be_visible()
    for width in (360, 320):
        page.set_viewport_size({'width': width, 'height': 800})
        f.locator('#lock').click()
        expect(f.locator('#unlock-code input').last).to_be_in_viewport()
        type_code(f, 'unlock-code', '111222')
        expect(f.locator('#book')).to_be_visible()
    assert not errors, errors
    browser.close()
print('browser code lock: ok')
