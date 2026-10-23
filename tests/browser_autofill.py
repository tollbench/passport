"""Deterministic inline autofill, ambiguity, edits, lock and explicit shared Send."""
import ast,json,os,tempfile,threading
from pathlib import Path
from functools import partial
from http.server import SimpleHTTPRequestHandler,ThreadingHTTPServer
from importlib.resources import files
from playwright.sync_api import sync_playwright,expect
ASSETS=Path(str(files('toll_passport').joinpath('web')))
constants={n.targets[0].id:ast.literal_eval(n.value) for n in ast.parse(Path(__file__).with_name('browser_batches.py').read_text()).body if isinstance(n,ast.Assign) and isinstance(n.targets[0],ast.Name) and n.targets[0].id in ['HOST','ADDON']}
HOST=constants['HOST'].replace("expiresAt:Date.now()+600000};", "expiresAt:Date.now()+600000,matching:{version:1,catalogVersion:'1',allowedRequestTypes:['person.biography'],requests:[{questionId:'q1',requestType:'person.biography'},{questionId:'q2',requestType:null}]}};context.questions.forEach(q=>q.recipients=[{id:'one',name:'Lite'},{id:'two',name:'Fable'}]);context.questions[0].originals=[{agent:'Lite',title:'Founder biography?'},{agent:'Fable',title:'Introduce yourself'}];")
class Handler(SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
 def end_headers(self):self.send_header('Access-Control-Allow-Origin','*');self.send_header('Cache-Control','no-store');super().end_headers()
 def do_GET(self):
  if self.path=='/host':body=HOST;mime='text/html'
  elif self.path=='/fixture-addon.mjs':body=constants['ADDON'];mime='text/javascript'
  elif self.path=='/hosted.html':body=(ASSETS/'hosted.html').read_text().replace('</head>','<script type="module" src="./fixture-addon.mjs" crossorigin="anonymous"></script></head>');mime='text/html'
  else:return super().do_GET()
  self.send_response(200);self.send_header('Content-Type',mime);self.end_headers();self.wfile.write(body.encode())
with tempfile.TemporaryDirectory(prefix='passport-autofill-') as tmp,ThreadingHTTPServer(('127.0.0.1',0),partial(Handler,directory=str(ASSETS))) as server,sync_playwright() as p:
 threading.Thread(target=server.serve_forever,daemon=True).start();browser=p.chromium.launch(headless=True);page=browser.new_page(accept_downloads=True,viewport={'width':390,'height':844});page.set_default_timeout(10000);errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.goto(f'http://127.0.0.1:{server.server_port}/host');f=page.frame_locator('#vault');expect(f.locator('#create')).to_be_enabled()
 with page.expect_download() as download:f.locator('#create').click()
 recovery=Path(tmp)/'recovery.json';download.value.save_as(recovery);f.locator('#confirm-create').click();batch=f.locator('#agent-question-batch');inner=page.frames[1]
 row=batch.locator('[data-batch-question=q1]');answer=row.locator('textarea');expect(answer).to_have_value('');expect(row).to_contain_text('Asked by Lite, Fable');expect(row).to_contain_text('No saved answer')
 ids=inner.evaluate("""async()=>{const{addEntry}=await import('./vault.mjs');const{classificationFor}=await import('./topic-catalog.mjs');let s=fixtureApi.getState(),d=s.document;d=addEntry(d,{kind:'passport.entity',title:'Steven',fields:{name:'Steven',entityKind:'person'}});const id=d.entries.at(-1).id,c={subject:'owner:fixture:personal',taskId:'proposal:fixture',matching:{allowedRequestTypes:['person.biography']}},q={format:'short_answer'};d=addEntry(d,{kind:'answer',title:'Original biography',fields:{question:'Original biography',value:'BIOGRAPHY_CANARY',subject:c.subject,classification:classificationFor(d,c,q,'person.biography',id,true),answerOptions:[]}});const fact=d.entries.at(-1).id;await fixtureApi.save(d,{vaultId:s.document.vaultId,revision:s.document.revision,scope:s.scope});return{id,fact};}""")
 expect(answer).to_have_value('BIOGRAPHY_CANARY');expect(batch).to_contain_text('Passport filled 1 answer');assert page.evaluate('releases.length')==0
 row.locator('.topic-chip').click();expect(row).to_contain_text('Original biography');row.get_by_role('button',name='Clear this answer',exact=True).click();expect(answer).to_have_value('')
 # An unrelated private save/refresh must not restore a deliberately cleared answer.
 inner.evaluate("async()=>{const{addEntry}=await import('./vault.mjs');const s=fixtureApi.getState();await fixtureApi.save(addEntry(s.document,{kind:'note',title:'Unrelated',fields:{content:'private'}}),{vaultId:s.document.vaultId,revision:s.document.revision,scope:s.scope});}")
 expect(answer).to_have_value('');row.locator('.topic-chip').click();row.get_by_role('button',name='Use this saved answer',exact=True).click();expect(answer).to_have_value('BIOGRAPHY_CANARY')
 # Two saved sources require an explicit choice and remain separate records.
 inner.evaluate("""async()=>{const{addEntry}=await import('./vault.mjs');const s=fixtureApi.getState(),v=s.document.entries.find(e=>e.versions.at(-1).kind==='answer').versions.at(-1);await fixtureApi.save(addEntry(s.document,{kind:'answer',title:'Alternate biography',fields:{...v.fields,question:'Alternate biography',value:'ALTERNATE_CANARY'}}),{vaultId:s.document.vaultId,revision:s.document.revision,scope:s.scope});}""")
 row.locator('.topic-chip').click();expect(row.get_by_role('button',name='Use this saved answer',exact=True)).to_have_count(2)
 # Source selection is explicit and is preserved on save rather than generating a third fact.
 row.get_by_role('button',name='Use this saved answer',exact=True).nth(1).click();selected=answer.input_value();batch.get_by_role('button',name='Save privately',exact=True).click();expect(batch).to_contain_text('Saved privately. Nothing has been sent.')
 assert inner.evaluate("fixtureApi.getState().document.entries.filter(e=>e.versions.at(-1).kind==='answer').length")==2
 # Human edits never get overwritten by subsequent state refresh.
 answer.fill('MY_EDIT_CANARY');batch.get_by_role('button',name='Save privately',exact=True).click();expect(batch).to_contain_text('Saved privately. Nothing has been sent.');expect(answer).to_have_value('MY_EDIT_CANARY')
 assert 'MY_EDIT_CANARY' not in json.dumps(page.evaluate('messages'));assert 'BIOGRAPHY_CANARY' not in json.dumps(page.evaluate('messages'))
 if os.environ.get('PASSPORT_CAPTURE'):row.scroll_into_view_if_needed();page.screenshot(path=os.environ['PASSPORT_CAPTURE'])
 page.evaluate('failSave=true');answer.fill('FINAL_EDIT_CANARY');batch.get_by_role('button',name='Send to all 2 agents',exact=True).click();expect(batch).to_contain_text('Sharing is paused');assert page.evaluate('releases.length')==0
 page.evaluate('failSave=false');batch.get_by_role('button',name='Send to all 2 agents',exact=True).click();expect(batch).to_contain_text('Receipt batch-receipt');assert page.evaluate('releases.length')==1;assert f.locator('dialog').count()==0
 assert page.evaluate('releases[0].answers[0].value')=='FINAL_EDIT_CANARY';assert json.loads(recovery.read_text())['key'] not in json.dumps(page.evaluate('messages'))
 f.locator('#lock').click();expect(row).to_have_count(0);assert not errors,errors
 browser.close();server.shutdown();print('PASS inline autofill: unique match, clear sticks, source choice, source reuse, edits, exact shared audience, no pre-send leak, save failure, direct Send, lock cleanup, mobile.')
