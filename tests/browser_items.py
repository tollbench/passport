"""Installed opaque item picker, folder snapshot and exact approval; synthetic only."""
import ast,json,os,tempfile,threading
from pathlib import Path
from functools import partial
from http.server import SimpleHTTPRequestHandler,ThreadingHTTPServer
from importlib.resources import files
from playwright.sync_api import sync_playwright,expect
ASSETS=Path(str(files('toll_passport').joinpath('web')))
ADDON=next(ast.literal_eval(n.value) for n in ast.parse(Path(__file__).with_name('browser_batches.py').read_text()).body if isinstance(n,ast.Assign) and isinstance(n.targets[0],ast.Name) and n.targets[0].id=='ADDON')
HOST='''<!doctype html><title>Item fixture</title><style>html,body{margin:0;height:100%;overflow:hidden}iframe{display:block;width:100%;height:100%;border:0}</style><iframe id="vault" sandbox="allow-scripts allow-downloads" src="/hosted.html"></iframe><script type="module">
import {PROTOCOL,validateReady,validateRequest} from './hosted-bridge.mjs';
import {ITEM_PROTOCOL,validateItemReady,validateItemRelease} from './item-share-channel.mjs';
const frame=document.querySelector('iframe'),cap='c'.repeat(64);let nonce,inonce,ack;window.messages=[];window.releases=[];window.failSave=false;window.failGrant=false;
const context={requestId:crypto.randomUUID(),token:'signed-items',scope:'business',recipient:{id:'one',name:'Fixture Agent'},accessScope:{id:'flow:fixture',label:'Fixture flow'},purpose:'Prepare this flow using selected information',expiresAt:Date.now()+600000,grantExpiresAt:Date.now()+3600000,limits:{maxItems:50,maxFileBytes:2097152,maxTotalBytes:5242880}};
window.addEventListener('message',e=>{if(e.source!==frame.contentWindow||e.origin!=='null')return;const q=e.data;messages.push(q);const send=v=>frame.contentWindow.postMessage(v,'*');
if(validateItemReady(q)){inonce=q.nonce;send({protocol:ITEM_PROTOCOL,type:'init',nonce:inonce,capability:cap,context});return;}
if(validateItemRelease(q)&&q.nonce===inonce&&q.capability===cap){if(!ack||ack.scope!=='business'||ack.revision!==q.savedRevision)throw Error('No same-session save acknowledgement');if(!releases.some(r=>r.approvalId===q.approvalId))releases.push(q);send({protocol:ITEM_PROTOCOL,type:'receipt',nonce:inonce,capability:cap,id:q.id,...(failGrant?{ok:false,error:'unavailable'}:{ok:true,grantId:'grant-one',receiptId:'item-receipt'})});return;}
if(validateReady(q)){nonce=q.nonce;send({protocol:PROTOCOL,type:'init',nonce,capability:cap,scopes:['personal','business'],scope:'business'});return;}
if(!validateRequest(q)||q.nonce!==nonce||q.capability!==cap)return;const base={protocol:PROTOCOL,type:'result',nonce,capability:cap,id:q.id,op:q.op,scope:q.scope},old=JSON.parse(localStorage.getItem(q.scope)||'null');
if(q.op==='load'){send({...base,ok:true,envelope:old?.envelope||null,etag:old?.etag||null});return;}if(failSave){send({...base,ok:false,error:'unavailable'});return;}if(q.op==='save'){const etag=crypto.randomUUID();localStorage.setItem(q.scope,JSON.stringify({envelope:q.envelope,etag}));ack={revision:q.envelope.revision,scope:q.scope==='personal'?'business':q.scope,etag};send({...base,ok:true,etag});}
});</script>'''
class Handler(SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
 def end_headers(self):self.send_header('Access-Control-Allow-Origin','*');self.send_header('Cache-Control','no-store');super().end_headers()
 def do_GET(self):
  if self.path=='/host':body=HOST;mime='text/html'
  elif self.path=='/fixture-addon.mjs':body=ADDON;mime='text/javascript'
  elif self.path=='/hosted.html':body=(ASSETS/'hosted.html').read_text().replace('</head>','<script type="module" src="./fixture-addon.mjs" crossorigin="anonymous"></script></head>');mime='text/html'
  else:return super().do_GET()
  self.send_response(200);self.send_header('Content-Type',mime);self.end_headers();self.wfile.write(body.encode())
with tempfile.TemporaryDirectory(prefix='passport-items-') as tmp,ThreadingHTTPServer(('127.0.0.1',0),partial(Handler,directory=str(ASSETS))) as server,sync_playwright() as p:
 threading.Thread(target=server.serve_forever,daemon=True).start();opts={'headless':True}
 if os.environ.get('PASSPORT_CHROME'):opts['executable_path']=os.environ['PASSPORT_CHROME']
 browser=p.chromium.launch(**opts);page=browser.new_page(accept_downloads=True,viewport={'width':390,'height':844});page.set_default_timeout(10000);errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.goto(f'http://127.0.0.1:{server.server_port}/host');f=page.frame_locator('#vault');expect(f.locator('#create')).to_be_enabled()
 with page.expect_download() as dl:f.locator('#create').focus();f.locator('#create').press('Enter')
 recovery=Path(tmp)/'recovery.json';dl.value.save_as(recovery);f.locator('#confirm-create').click();picker=f.locator('#item-sharing');expect(picker.locator('h2')).to_be_focused();inner=page.frames[1]
 refs=inner.evaluate("""async()=>{const{addEntry}=await import('./vault.mjs');let s=fixtureApi.getState(),d=s.document;d=addEntry(d,{kind:'note',title:'Fixture biography',fields:{text:'EXACT_OLD_NOTE',secret:'DO_NOT_RELEASE',structured:{private:true}}});const note=d.entries.at(-1).id;d=addEntry(d,{kind:'file',title:'Fixture file',fields:{},files:[{name:'bio.txt',type:'text/plain',data:btoa('APPROVED_FILE')}]});const file=d.entries.at(-1).id;await fixtureApi.save(d,{vaultId:s.document.vaultId,revision:s.document.revision,scope:s.scope});return{note,file};}""")
 picker.get_by_label('Upload files into this book',exact=True).set_input_files({'name':'upload-private.txt','mimeType':'text/plain','buffer':b'UNSHARED_UPLOAD'});expect(picker.get_by_role('heading',name='upload-private.txt · Version 1',exact=True)).to_be_visible();assert page.evaluate('releases.length')==0;expect(picker.get_by_role('button',name='Approve sharing with Fixture Agent',exact=True)).to_be_visible();picker.locator('fieldset').filter(has=page.get_by_text('upload-private.txt · Version 1',exact=False)).locator('legend input').uncheck()
 note=picker.locator('fieldset').filter(has=page.get_by_text('Fixture biography · Version 1',exact=False));file=picker.locator('fieldset').filter(has=page.get_by_text('Fixture file · Version 1',exact=False))
 note.locator('legend input').check();file.locator('legend input').check();picker.get_by_text('Create a folder from selected items',exact=True).click();picker.get_by_label('Folder name',exact=True).fill('Fixture folder');picker.get_by_role('button',name='Save folder privately',exact=True).scroll_into_view_if_needed();picker.get_by_role('button',name='Save folder privately',exact=True).click();expect(picker.get_by_role('button',name='Select folder: Fixture folder',exact=True)).to_be_visible()
 inner.evaluate("""async id=>{const{addEntry}=await import('./vault.mjs');const s=fixtureApi.getState();await fixtureApi.save(addEntry(s.document,{id,kind:'note',title:'Fixture biography new',fields:{text:'NEW_UNAPPROVED_VERSION'}}),{vaultId:s.document.vaultId,revision:s.document.revision,scope:s.scope});}""",refs['note'])
 picker.get_by_role('button',name='Select folder: Fixture folder',exact=True).click();pinned=picker.locator('fieldset').filter(has=page.get_by_text('Fixture biography · Pinned version 1',exact=False));pinned.get_by_label('text',exact=True).check();file=picker.locator('fieldset').filter(has=page.get_by_text('Fixture file · Version 1',exact=False));file.get_by_label('bio.txt',exact=False).check()
 expect(pinned.get_by_label('structured · stays private: structured or unsupported field',exact=True)).to_be_disabled();picker.get_by_role('button',name='Preview selected information',exact=True).click();expect(picker).to_contain_text('EXACT_OLD_NOTE');assert page.evaluate('releases.length')==0;assert 'EXACT_OLD_NOTE' not in json.dumps(page.evaluate('messages'))
 if os.environ.get('PASSPORT_CAPTURE'):picker.locator('h3').scroll_into_view_if_needed();page.screenshot(path=os.environ['PASSPORT_CAPTURE'])
 approve=picker.get_by_role('button',name='Approve sharing with Fixture Agent',exact=True);page.evaluate('failSave=true');approve.click();expect(picker).to_contain_text('This attempt was not sent.');assert page.evaluate('releases.length')==0
 page.evaluate('failSave=false;failGrant=true');approve.click();expect(picker).to_contain_text('Delivery is not confirmed.');assert page.evaluate('releases.length')==1;first=page.evaluate('releases[0]');assert first['savedRevision']>1
 page.evaluate('failGrant=false');approve.click();expect(picker).to_contain_text('Receipt item-receipt.');assert page.evaluate('releases.length')==1
 release=page.evaluate('releases[0]');wire=json.dumps(release);assert 'EXACT_OLD_NOTE' in wire and 'NEW_UNAPPROVED_VERSION' not in wire and 'DO_NOT_RELEASE' not in wire and 'UNSHARED_UPLOAD' not in wire;assert refs['note'] not in wire and refs['file'] not in wire;assert release['items'][0]['sourceVersion']==1;assert json.loads(recovery.read_text())['key'] not in json.dumps(page.evaluate('messages'))
 assert inner.evaluate("fixtureApi.getState().document.entries.some(e=>e.versions.at(-1).fields.receipt?.grantId==='grant-one')")
 assert not errors,errors;browser.close();server.shutdown()
print('PASS opaque item picker: usable folder creation/pinned snapshot, exact field/file preview, no preapproval disclosure, failed save gate, same-session save acknowledgement, idempotent grant retry, private receipt and mobile pointer approval.')
