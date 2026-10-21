"""Installed opaque-book topic chips and direct Send; synthetic records only."""
import ast,json,os,tempfile,threading
from pathlib import Path
from functools import partial
from http.server import SimpleHTTPRequestHandler,ThreadingHTTPServer
from importlib.resources import files
from playwright.sync_api import sync_playwright,expect
ASSETS=Path(str(files('toll_passport').joinpath('web')))
# Reuse the synthetic host protocol fixture without executing its acceptance run.
constants={n.targets[0].id:ast.literal_eval(n.value) for n in ast.parse(Path(__file__).with_name('browser_batches.py').read_text()).body if isinstance(n,ast.Assign) and isinstance(n.targets[0],ast.Name) and n.targets[0].id in ['HOST','ADDON']}
HOST=constants['HOST'].replace('Founder biography?','What food do you prefer?').replace("expiresAt:Date.now()+600000};", "expiresAt:Date.now()+600000,matching:{version:1,catalogVersion:'1',allowedRequestTypes:['person.food_preference','pet.diet','project.podcast_preferences'],requests:[{questionId:'q1',requestType:'person.food_preference'},{questionId:'q2',requestType:null}]}};")
class Handler(SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
 def end_headers(self):self.send_header('Access-Control-Allow-Origin','*');self.send_header('Cache-Control','no-store');super().end_headers()
 def do_GET(self):
  if self.path=='/host':body=HOST;mime='text/html'
  elif self.path=='/fixture-addon.mjs':body=constants['ADDON'];mime='text/javascript'
  elif self.path=='/hosted.html':body=(ASSETS/'hosted.html').read_text().replace('</head>','<script type="module" src="./fixture-addon.mjs" crossorigin="anonymous"></script></head>');mime='text/html'
  else:return super().do_GET()
  self.send_response(200);self.send_header('Content-Type',mime);self.end_headers();self.wfile.write(body.encode())
with tempfile.TemporaryDirectory(prefix='passport-topics-') as tmp,ThreadingHTTPServer(('127.0.0.1',0),partial(Handler,directory=str(ASSETS))) as server,sync_playwright() as p:
 threading.Thread(target=server.serve_forever,daemon=True).start();opts={'headless':True}
 if os.environ.get('PASSPORT_CHROME'):opts['executable_path']=os.environ['PASSPORT_CHROME']
 browser=p.chromium.launch(**opts);page=browser.new_page(accept_downloads=True,viewport={'width':int(os.environ.get('PASSPORT_VIEWPORT','390')),'height':844});page.set_default_timeout(10000);errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.goto(f'http://127.0.0.1:{server.server_port}/host');f=page.frame_locator('#vault');expect(f.locator('#create')).to_be_enabled()
 with page.expect_download() as download:f.locator('#create').focus();f.locator('#create').press('Enter')
 recovery=Path(tmp)/'recovery.json';download.value.save_as(recovery);f.locator('#confirm-create').click();batch=f.locator('#agent-question-batch');expect(batch.locator('h2')).to_be_focused();inner=page.frames[1]
 ids=inner.evaluate("""async()=>{const{addEntry}=await import('./vault.mjs');const{classificationFor}=await import('./topic-catalog.mjs');let s=fixtureApi.getState(),d=s.document;const ids={};for(const kind of ['person','pet']){d=addEntry(d,{kind:'passport.entity',title:'Alex',fields:{name:'Alex',entityKind:kind}});ids[kind]=d.entries.at(-1).id;}
 const c={subject:'owner:fixture:personal',taskId:'proposal:fixture',matching:{allowedRequestTypes:['person.food_preference','pet.diet']}},q={format:'short_answer'};
 for(const[kind,type,value]of[['person','person.food_preference','Vegetarian'],['pet','pet.diet','Kibble']]){d=addEntry(d,{kind:'answer',title:'Original food question',fields:{question:'Original food question',answer:value,value,subject:c.subject,classification:classificationFor(d,c,q,type,ids[kind],true),answerOptions:[]}});ids[kind+'Fact']=d.entries.at(-1).id;}
 await fixtureApi.save(d,{vaultId:s.document.vaultId,revision:s.document.revision,scope:s.scope});return ids;}""")
 row=batch.locator('[data-batch-question=q1]');answer=row.locator('textarea');topic=row.get_by_label('Topic',exact=True);entity=row.get_by_label('About',exact=True)
 def save_privately():
  before=inner.evaluate('fixtureApi.getState().document.revision')
  batch.get_by_role('button',name='Save privately',exact=True).click()
  inner.wait_for_function('before => fixtureApi.getState().document.revision > before',arg=before)
  expect(batch).to_contain_text('Saved privately. Nothing has been sent.')
 expect(answer).to_have_value('');entity.select_option(ids['person']);expect(answer).to_have_value('Vegetarian');expect(row.get_by_text('Saved answer source',exact=True)).to_be_visible();assert page.evaluate('releases.length')==0
 if os.environ.get('PASSPORT_CAPTURE'):row.scroll_into_view_if_needed();page.screenshot(path=os.environ['PASSPORT_CAPTURE'])
 row.get_by_role('button',name='Remove topic',exact=True).click();expect(answer).to_have_value('');expect(topic).to_have_value('')
 topic.select_option('person.food_preference');entity.select_option(ids['person']);expect(answer).to_have_value('Vegetarian');answer.fill('HUMAN_EDIT_CANARY');row.get_by_role('button',name='Remove topic',exact=True).click();expect(answer).to_have_value('HUMAN_EDIT_CANARY')
 save_privately()
 assert inner.evaluate("fixtureApi.getState().document.entries.filter(e=>e.versions.at(-1).kind==='answer').at(-1).versions.at(-1).fields.classification") is None
 assert inner.evaluate("id=>fixtureApi.getState().document.entries.find(e=>e.id===id).versions.length",ids['personFact'])==1
 topic.select_option('pet.diet');entity.select_option(ids['pet']);expect(answer).to_have_value('HUMAN_EDIT_CANARY')
 # Explicit replacement classifies retained human text, never substitutes pet autofill.
 save_privately()
 assert inner.evaluate("fixtureApi.getState().document.entries.filter(e=>e.versions.at(-1).fields.value==='HUMAN_EDIT_CANARY').at(-1).versions.at(-1).fields.classification.requestType")=='pet.diet'
 row.get_by_role('button',name='Remove topic',exact=True).click();page.evaluate('failSave=true');send=batch.get_by_role('button',name='Send to Fixture Agent',exact=True);send.click();expect(batch).to_contain_text('Sharing is paused');assert page.evaluate('releases.length')==0;expect(answer).to_have_value('HUMAN_EDIT_CANARY');assert f.locator('dialog').count()==0
 # Inline entity creation is private and never guesses an entity from the book scope.
 page.evaluate('failSave=false');other=batch.locator('[data-batch-question=q2]');other.get_by_label('Topic',exact=True).select_option('project.podcast_preferences');other.get_by_text('Add a project privately',exact=True).click();other.get_by_label('Name in your private book',exact=True).fill('PRIVATE_PROJECT_CANARY');other.get_by_role('button',name='Add privately',exact=True).click();expect(other.get_by_label('About',exact=True)).not_to_have_value('')
 # File-only text stays unclassified; uploaded contents never become inferred facts.
 topic.select_option('person.food_preference');entity.select_option(ids['person']);answer.fill('');row.locator('input[type=file]').set_input_files({'name':'notes.txt','mimeType':'text/plain','buffer':b'FILE_ONLY_CANARY'});expect(row).to_contain_text('notes.txt');row.get_by_label('notes.txt',exact=False).check();expect(answer).to_have_value('Attached files: notes.txt');save_privately();assert inner.evaluate("fixtureApi.getState().document.entries.filter(e=>e.versions.at(-1).kind==='answer').at(-1).versions.at(-1).fields.classification") is None
 row.get_by_label('notes.txt',exact=False).uncheck();answer.fill('HUMAN_EDIT_CANARY');row.get_by_role('button',name='Remove topic',exact=True).click()
 # No topic/entity/name/source/answer text is exposed before the explicit successful send.
 messages=json.dumps(page.evaluate('messages'));assert 'HUMAN_EDIT_CANARY' not in messages;assert ids['person'] not in messages;assert 'Vegetarian' not in messages;assert 'PRIVATE_PROJECT_CANARY' not in messages
 page.evaluate('failSave=false');send.click();expect(batch).to_contain_text('Receipt batch-receipt');assert page.evaluate('releases.length')==1;release=page.evaluate('releases[0]');assert release['answers']==[{'id':'q1','value':'HUMAN_EDIT_CANARY','files':[]}];assert f.locator('dialog').count()==0
 assert inner.evaluate("fixtureApi.getState().document.entries.filter(e=>e.versions.at(-1).kind==='answer').at(-1).versions.at(-1).fields.classification") is None
 assert json.loads(recovery.read_text())['key'] not in json.dumps(page.evaluate('messages'));assert not errors,errors
 browser.close();server.shutdown();print('PASS topic chips: exact local entity, no legacy hint authority, remove clears auto/preserves human, explicit replacement retains text, encrypted unclassified save, direct named Send, failed-save block, no modal or pre-send data leak, mobile.')
