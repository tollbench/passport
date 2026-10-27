"""One-sheet acceptance (2026-10-27): mocked parent, stubbed code session, no real vault host or provider calls.

The code-unlock calls (codeStatus/unlockWithCode/createBook/setCode/unlockWithRecoveryFile)
are stubbed over the real book session so this test pins the sheet, not the code store.
PASSPORT_SHOTS=<dir> saves 390 px screenshots.
"""
from pathlib import Path
import json
import os
from importlib.resources import files
import subprocess
from playwright.sync_api import sync_playwright, expect

ROOT = Path(os.environ.get('PASSPORT_WEB_ROOT', str(files('toll_passport').joinpath('web'))))
SHOTS = os.environ.get('PASSPORT_SHOTS')
AGENT_A = {'id': 'agent-a', 'name': 'Haiku'}
AGENT_B = {'id': 'agent-b', 'name': 'Bree'}
CONTEXT = {
    'requestId': '11111111-1111-4111-8111-111111111111', 'token': 'synthetic-signed',
    'scope': 'personal', 'subject': 'subject:personal',
    'bookSubjects': {'personal': 'subject:personal', 'business': 'subject:business'},
    'taskId': 'synthetic-task', 'purpose': 'Synthetic questions',
    'recipient': {'id': 'heat:x', 'name': 'the named agents'},
    'questions': [
        {'id': '1', 'digest': 'a'*64, 'title': 'What is your name?', 'format': 'short_answer',
         'label': None, 'options': [], 'recipients': [AGENT_A, AGENT_B], 'bookScope': 'personal'},
        {'id': '2', 'digest': 'b'*64, 'title': 'What does your project do?', 'format': 'written_response',
         'label': None, 'options': [], 'recipients': [AGENT_A], 'bookScope': 'personal'},
        {'id': '3', 'digest': 'c'*64, 'title': 'Pick a color', 'format': 'single_choice', 'label': None,
         'options': [{'value': 'red', 'label': 'Red'}, {'value': 'blue', 'label': 'Blue'}],
         'recipients': [AGENT_B], 'bookScope': 'personal'},
    ], 'expiresAt': 4102444800000,
}
SINGLE = {
    'requestId': '22222222-2222-4222-8222-222222222222', 'token': 'synthetic-single',
    'scope': 'personal', 'subject': 'subject:personal', 'taskId': 'synthetic-single-task',
    'question': {'id': 'one', 'digest': 'a'*64, 'title': 'What is your name?', 'format': 'short_answer'},
    'recipient': {'id': 'synthetic-agent', 'name': 'Synthetic Agent'}, 'label': None, 'expiresAt': 4102444800000,
}
STUB = """import {unlockVault,sealVault,validateDocument} from './vault.mjs';
const RECOVERY=__RECOVERY__,ENVELOPE=__ENVELOPE__;
// Self-contained stand-in for Builder A's session: real vault crypto, host transport, stubbed code doors.
export function createBookSession(host,device,onChange){
  const stub=globalThis.__stub={attempts:3,codeSet:true,hasBook:true,calls:[]};
  let envelope=null,etag=null,key=null,doc=null,loaded=false;
  const state=scope=>({scope,document:scope==='personal'?doc:null,vaultId:envelope?.vaultId||null,loaded,uncertain:false,error:false});
  async function load(scope){if(scope!=='personal')return state(scope);
    const r=await host.request('load','personal');envelope=r.envelope;etag=r.etag;loaded=true;onChange(scope);return state(scope);}
  async function open(recovery){if(!envelope)await load('personal');const o=await unlockVault(envelope,recovery);key=o.key;doc=o.document;onChange('personal');}
  async function saveToScope(scope,mutator){if(scope!=='personal'||!doc)throw Error('locked');
    const next=mutator(JSON.parse(JSON.stringify(doc)));validateDocument(next);const sealed=await sealVault(next,key);
    const r=await host.request('save','personal',{envelope:sealed,expectedEtag:etag});etag=r.etag;envelope=sealed;doc=next;onChange('personal');return state('personal');}
  return {getState:state,load,saveToScope,
    async lockAll(){key=null;doc=null;onChange('personal');},
    async unlockDevice(){throw Error('unavailable');},
    async codeStatus(){stub.calls.push('status');return {hasBook:stub.hasBook,codeSet:stub.codeSet,
      locked:!doc,attemptsLeft:stub.attempts,disabled:stub.attempts<=0};},
    async unlockWithCode(code){stub.calls.push('code');
      if(stub.attempts<=0)return {ok:false,reason:'disabled',attemptsLeft:0};
      if(code!=='246810'){stub.attempts--;return {ok:false,reason:stub.attempts?'wrong':'disabled',attemptsLeft:stub.attempts};}
      await open(RECOVERY);stub.attempts=3;return {ok:true};},
    async createBook(code){stub.calls.push('create:'+code);stub.hasBook=true;stub.codeSet=true;
      if(!envelope){const r=await host.request('save','personal',{envelope:ENVELOPE,expectedEtag:null});envelope=ENVELOPE;etag=r.etag;}
      await open(RECOVERY);
      return {recoveryFile:new Blob([JSON.stringify(RECOVERY)],{type:'application/json'}),filename:'passport-recovery.json'};},
    async setCode(code){stub.calls.push('set:'+code);stub.codeSet=true;stub.attempts=3;},
    async unlockWithRecoveryFile(file){stub.calls.push('recovery');await open(JSON.parse(await file.text()));}};
}"""
ORGANIZER = """export async function createOrganizer(){return {
  rank(question,items){const words=s=>new Set(s.toLowerCase().match(/[a-z]+/g)||[]),q=words(question);
    return items.map(i=>({id:i.id,score:[...words(i.text)].filter(w=>q.has(w)).length})).sort((a,b)=>b.score-a.score);},
  label(text){globalThis.__labels=(globalThis.__labels||0)+1;
    return {book:/project/i.test(text)?'business':'personal',topic:/project/i.test(text)?'project.description':null};}};}"""
PARENT = """<!doctype html><html><body style='margin:0'><iframe id='passport' sandbox='allow-scripts allow-same-origin allow-downloads'
 src='https://passport.example/hosted.html?view=questions' style='width:390px;height:780px;border:0'></iframe>
<script>
window.received=[];window.storage=ENVELOPES;window.questionContext=CONTEXT;window.offerAutofill=OFFER;
window.failSave=false;let counter=1;
const child=document.getElementById('passport');
const to=data=>child.contentWindow.postMessage(data,'https://passport.example');
window.lockSheet=()=>to({protocol:'passport-hosted-v1',type:'control',nonce:window.hostNonce,capability:'a'.repeat(32),
  id:'77777777-7777-4777-8777-777777777777',command:'lock-all'});
window.addEventListener('message',event=>{
 if(event.source!==child.contentWindow||event.origin!=='https://passport.example')return;
 const v=event.data;received.push(v);
 if(v.type==='ready'&&v.protocol==='passport-hosted-v1'){window.hostNonce=v.nonce;
   to({protocol:v.protocol,type:'init',nonce:v.nonce,capability:'a'.repeat(32),
     scopes:['personal','business'],scope:'personal',
     storageIdentity:{ownerBinding:'x'.repeat(32),parentOrigin:'https://app.example'}});}
 if(v.type==='question-ui'&&v.protocol==='passport-hosted-v1')to({...v,type:'question-ui-ack'});
 if(v.type==='ready'&&v.protocol==='passport-question-batch-v1')
   to({protocol:v.protocol,type:'init',nonce:v.nonce,capability:'b'.repeat(64),context:questionContext});
 if(v.type==='ready'&&v.protocol==='passport-question-v1')
   to({protocol:v.protocol,type:'init',nonce:v.nonce,capability:'b'.repeat(64),context:questionContext});
 if(v.type==='sheet'&&offerAutofill)to({protocol:v.protocol,type:'autofill-offer',nonce:v.nonce,capability:v.capability});
 if(v.type==='autofill-request')to({protocol:v.protocol,type:'autofill-result',nonce:v.nonce,capability:v.capability,id:v.id,
   ok:true,drafted:true,answers:[{id:'1',value:'SHOULD_NOT_REPLACE'},{id:'3',value:'blue'}]});
 if(v.type==='request'&&v.protocol==='passport-hosted-v1'&&v.op==='load')
   to({...v,type:'result',ok:true,envelope:storage[v.scope]?.envelope||null,etag:storage[v.scope]?.etag||null});
 if(v.type==='request'&&v.protocol==='passport-hosted-v1'&&v.op==='save'){
   const base={protocol:v.protocol,type:'result',nonce:v.nonce,capability:v.capability,id:v.id,op:v.op,scope:v.scope};
   if(failSave||v.expectedEtag!==(storage[v.scope]?.etag??null)){to({...base,ok:false,error:'conflict'});return;}
   storage[v.scope]={envelope:v.envelope,etag:'v'+(++counter)};to({...base,ok:true,etag:storage[v.scope].etag});
 }
 if(v.type==='release')to({protocol:v.protocol,type:'receipt',nonce:v.nonce,capability:v.capability,id:v.id,
   ok:true,receiptId:'synthetic-receipt'});
});
</script></body></html>"""


def main():
    node = os.environ.get('PASSPORT_NODE', 'node')
    create = """import {createVault,exportRecovery,addEntry,sealVault} from 'VAULT';
const v=await createVault();let doc=v.document;
const saved=(question,value)=>{doc=addEntry(doc,{kind:'answer',title:question,fields:{question,answer:value,value,
  subject:'subject:personal',scope:'reusable',taskId:'older-task',label:'',answerOptions:[]}});};
saved('What is your name?','Ada Lovelace');saved('Describe your company','Makes plans for teams');
console.log(JSON.stringify({envelope:await sealVault(doc,v.key),etag:'v1',recovery:await exportRecovery(v.key,doc.vaultId)}));"""
    fixture = json.loads(subprocess.check_output([node, '--input-type=module', '-e',
                                                  create.replace('VAULT', (ROOT/'vault.mjs').as_uri())]))
    public = {'personal': {'envelope': fixture['envelope'], 'etag': 'v1'}}
    stub = STUB.replace('__RECOVERY__', json.dumps(fixture['recovery'])).replace('__ENVELOPE__', json.dumps(fixture['envelope']))

    def parent(context, offer=True, storage=public):
        return (PARENT.replace('CONTEXT', json.dumps(context)).replace('ENVELOPES', json.dumps(storage))
                .replace('OFFER', 'true' if offer else 'false'))
    pages = {'https://app.example/': parent(CONTEXT), 'https://app.example/single': parent(SINGLE, False),
             'https://app.example/fresh': parent(CONTEXT, False, {})}
    with sync_playwright() as playwright:
        options = {'headless': True}
        if os.environ.get('PASSPORT_CHROME'):
            options['executable_path'] = os.environ['PASSPORT_CHROME']
        browser = playwright.chromium.launch(**options)
        context = browser.new_context(ignore_https_errors=True, viewport={'width': 390, 'height': 780})
        opened, mine = [], []
        context.on('page', lambda p: opened.append(p))
        new_page = lambda: mine.append(context.new_page()) or mine[-1]

        def route(request):
            url = request.request.url
            if url in pages:
                request.fulfill(status=200, content_type='text/html', body=pages[url])
            elif url.startswith('https://passport.example/'):
                path = url.split('https://passport.example/', 1)[1].split('?', 1)[0]
                if path == 'client-policy.mjs':
                    body = "export const ALLOWED_PARENT_ORIGINS = Object.freeze(['https://app.example']);"
                elif path == 'book-session.mjs':
                    body = stub
                elif path == 'organizer.mjs':
                    body = ORGANIZER
                else:
                    body = (ROOT/path).read_bytes()
                request.fulfill(status=200, body=body, content_type=('text/html' if path.endswith('.html') else
                                'text/css' if path.endswith('.css') else 'text/javascript'))
            else:
                request.abort()
        context.route('**/*', route)
        page = new_page()
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        shot = lambda name: SHOTS and page.screenshot(path=str(Path(SHOTS)/name))
        page.goto('https://app.example/')
        frame = page.frame_locator('#passport')
        frame.get_by_text('What is your name?').wait_for(timeout=10000)
        # Unplugged gray button; no new-tab link; nothing private has crossed.
        connect = frame.locator('[data-passport-connect]')
        expect(connect).to_be_visible()
        expect(connect).to_have_text('Connect Passport')
        assert connect.locator('svg[data-icon="plugs"]').count() == 1
        expect(frame.locator('[data-passport-connected]')).to_be_hidden()
        assert frame.locator('a[target=_blank], a[href]').count() == 0
        page.wait_for_function("received.some(v=>v.type==='connection-state'&&v.connected===false)")
        # Each question: the question, the answer, Attach files, one save box. Nothing else.
        sections = frame.locator('.batch-question')
        assert sections.count() == 3
        for i in range(3):
            section = sections.nth(i)
            assert section.locator('input[type=checkbox]').count() == 1
            expect(section.get_by_label('Save to my Passport')).not_to_be_checked()
            assert section.get_by_role('button', name='Attach files').count() == 1
            assert section.locator('details, select').count() == 0
        body = frame.locator('body').inner_text()
        for gone in ['Save in', 'Topic', 'Choose project', 'Name of project', 'Add privately', 'For Haiku',
                     'Source:', 'Send this answer', 'Personal', 'Business']:
            assert gone not in body, gone
        assert frame.get_by_role('button', name='Save to Passport', exact=True).count() == 0
        expect(frame.locator('[data-question-send]')).to_have_text('Send to all 2 agents')
        expect(frame.locator('[data-question-autofill]')).to_be_visible()
        shot('sheet-not-connected-390.png')
        # A save box while not connected opens the mini Passport over the sheet.
        sections.nth(0).get_by_label('Save to my Passport').click()
        dialog = frame.locator('dialog.mini-passport')
        expect(dialog).to_be_visible()
        expect(sections.nth(0).get_by_label('Save to my Passport')).not_to_be_checked()
        frame.get_by_role('button', name='Close', exact=True).click()
        expect(dialog).to_be_hidden()
        connect.click()
        expect(dialog).to_be_visible()
        code = dialog.get_by_label('Your 6-digit code')
        expect(code).to_have_attribute('inputmode', 'numeric')
        code.fill('111111')
        dialog.get_by_role('button', name='Open Passport').click()
        expect(dialog.locator('.mini-passport__note')).to_have_text('Wrong code. 2 tries left.')
        shot('mini-passport-wrong-code-390.png')
        code.fill('246810')
        dialog.get_by_role('button', name='Open Passport').click()
        expect(dialog).to_be_hidden()
        expect(frame.locator('[data-passport-connected]')).to_have_text('Passport connected')
        assert frame.locator('[data-passport-connected] svg[data-icon="plugs-connected"]').count() == 1
        expect(connect).to_be_hidden()
        page.wait_for_function("received.some(v=>v.type==='connection-state'&&v.connected===true)")
        for i in range(3):
            expect(sections.nth(i).get_by_label('Save to my Passport')).to_be_checked()
        # Saved answers show as suggestions; exact wording first, the organizer ranks the rest.
        first = sections.nth(0)
        expect(first.locator('.question-suggestion').first).to_contain_text('Ada Lovelace')
        expect(sections.nth(1).locator('.question-suggestions')).to_contain_text('Makes plans for teams')
        first.get_by_role('button', name='Use answer').first.click()
        expect(first.locator('textarea')).to_have_value('Ada Lovelace')
        expect(first.locator('.question-from')).to_have_text('From your Passport · What is your name?')
        sections.nth(1).locator('textarea').fill('NEW_PROJECT_ANSWER')
        expect(sections.nth(1).locator('.question-from')).to_be_hidden()
        shot('sheet-connected-390.png')
        # Autofill goes out only on the tap, and fills only what is still blank.
        assert page.evaluate("received.some(v=>v.type==='autofill-request')") is False
        frame.locator('[data-question-autofill]').click()
        expect(sections.nth(2).get_by_label('Blue')).to_be_checked()
        expect(first.locator('textarea')).to_have_value('Ada Lovelace')
        asked = page.evaluate("received.find(v=>v.type==='autofill-request').questions")
        assert [q['answer'] for q in asked] == ['Ada Lovelace', 'NEW_PROJECT_ANSWER', None], asked
        assert page.evaluate("received.some(v=>v.type==='release'||v.type==='request'&&v.op==='save')") is False
        # Send releases first; the checked answers save after. The book copy is not re-saved.
        frame.locator('[data-question-send]').click()
        frame.locator('.question-feedback').get_by_text('Saved 2 answers to your Passport.').wait_for(timeout=10000)
        order = page.evaluate("received.filter(v=>['release','settled'].includes(v.type)||v.type==='request'&&v.op==='save').map(v=>v.type==='request'?'save':v.type)")
        assert order == ['release', 'save', 'settled'], order
        release = page.evaluate("received.find(v=>v.type==='release')")
        assert [(a['id'], a['value']) for a in release['answers']] == [
            ('1', 'Ada Lovelace'), ('2', 'NEW_PROJECT_ANSWER'), ('3', 'blue')]
        assert page.evaluate("received.find(v=>v.type==='settled').id") == release['id']
        handle = page.frame(url='https://passport.example/hosted.html?view=questions')
        saved = handle.evaluate("""async ({envelope,recovery})=>{
          const {unlockVault}=await import('/vault.mjs');
          return (await unlockVault(envelope,recovery)).document.entries.map(e=>e.versions.at(-1))
            .filter(v=>v.fields.taskId==='synthetic-task')
            .map(v=>({...v.fields,book:(v.labels||v.fields.labels).book}));}""",
            {'envelope': page.evaluate("storage.personal.envelope"), 'recovery': fixture['recovery']})
        assert [(f['question'], f['value'], f['book']) for f in saved] == [
            ('What does your project do?', 'NEW_PROJECT_ANSWER', 'business'), ('Pick a color', 'blue', 'personal')], saved
        assert page.evaluate("received.some(v=>v.type==='open-book')") is False
        assert not errors, errors
        # A failed save never blocks or undoes the send, and says so.
        failed = new_page()
        failed.on('pageerror', lambda error: errors.append(str(error)))
        failed.goto('https://app.example/')
        ff = failed.frame_locator('#passport')
        ff.locator('[data-passport-connect]').click()
        ff.get_by_label('Your 6-digit code').fill('246810')
        ff.get_by_role('button', name='Open Passport').click()
        ff.locator('[data-passport-connected]').wait_for(timeout=10000)
        ff.locator('.batch-question textarea').first.fill('TYPED_NAME')
        failed.evaluate('failSave=true')
        ff.locator('[data-question-send]').click()
        ff.get_by_text('They were still sent.').wait_for(timeout=10000)
        assert failed.evaluate("received.filter(v=>v.type==='release').length") == 1
        # Lock takes a book answer back out of the form; typed work stays.
        failed.close()
        locked = new_page()
        locked.on('pageerror', lambda error: errors.append(str(error)))
        locked.goto('https://app.example/')
        lf = locked.frame_locator('#passport')
        lf.locator('[data-passport-connect]').click()
        lf.get_by_label('Your 6-digit code').fill('246810')
        lf.get_by_role('button', name='Open Passport').click()
        lf.locator('.batch-question').first.get_by_role('button', name='Use answer').first.click()
        lf.locator('.batch-question textarea').nth(1).fill('KEEP_TYPED')
        locked.evaluate('lockSheet()')
        expect(lf.locator('.batch-question textarea').first).to_have_value('', timeout=10000)
        expect(lf.locator('.batch-question textarea').nth(1)).to_have_value('KEEP_TYPED')
        expect(lf.locator('[data-passport-connect]')).to_be_visible()
        # Too many tries: the recovery file opens it, then a new code is picked.
        lf.locator('[data-passport-connect]').click()
        for _ in range(3):
            lf.get_by_label('Your 6-digit code').fill('000000')
            lf.get_by_role('button', name='Open Passport').click()
        lf.get_by_text('Too many tries. Open with your recovery file.').wait_for(timeout=10000)
        lf.locator('[data-recovery-file]').set_input_files(files=[{'name': 'recovery.json', 'mimeType': 'application/json',
                                                                  'buffer': json.dumps(fixture['recovery']).encode()}])
        lf.get_by_label('Pick a 6-digit code').fill('135790')
        lf.get_by_label('Type it again').fill('135790')
        lf.get_by_role('button', name='Save code').click()
        lf.locator('[data-passport-connected]').wait_for(timeout=10000)
        assert 'set:135790' in locked.frame(url='https://passport.example/hosted.html?view=questions').evaluate('__stub.calls')
        locked.close()
        # No book yet: set one up in the same pop-up and offer the recovery key.
        fresh = new_page()
        fresh.on('pageerror', lambda error: errors.append(str(error)))
        fresh.goto('https://app.example/fresh')
        nf = fresh.frame_locator('#passport')
        nf.locator('.batch-question').first.wait_for(timeout=10000)
        fresh.frame(url='https://passport.example/hosted.html?view=questions').evaluate('__stub.hasBook=false')
        nf.locator('[data-passport-connect]').click()
        nf.get_by_label('Pick a 6-digit code').fill('112233')
        nf.get_by_label('Type it again').fill('112233')
        nf.get_by_role('button', name='Set up Passport').click()
        with fresh.expect_download() as download:
            nf.locator('[data-recovery-download]').click()
        assert download.value.suggested_filename == 'passport-recovery.json'
        nf.get_by_role('button', name='Done').click()
        nf.locator('[data-passport-connected]').wait_for(timeout=10000)
        assert fresh.evaluate("received.some(v=>v.type==='autofill-request')") is False
        expect(nf.locator('[data-question-autofill]')).to_be_hidden()
        fresh.close()
        # Single question: same sheet, disconnected Send releases and saves nothing.
        single = new_page()
        single.on('pageerror', lambda error: errors.append(str(error)))
        single.goto('https://app.example/single')
        sf = single.frame_locator('#passport')
        sf.locator('.batch-question textarea').fill('SYNTHETIC_SINGLE_ANSWER')
        assert sf.get_by_role('button', name='Attach files').is_hidden()
        sf.locator('[data-question-send]').click()
        single.wait_for_function("received.filter(v=>v.type==='release').length===1")
        assert single.evaluate("received.find(v=>v.type==='release').answer") == 'SYNTHETIC_SINGLE_ANSWER'
        assert single.evaluate("received.filter(v=>v.type==='request'&&v.op==='save').length") == 0
        single.close()
        assert len(opened) == len(mine) == 5, (opened, mine)  # no tab or pop-up ever opened
        assert not errors, errors
        print('PASS: one sheet, mini Passport code/recovery/setup, suggestions, autofill blanks only, send then save, no new tab', flush=True)
        page.close()
        browser.close()


if __name__ == '__main__':
    main()
