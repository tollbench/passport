"""One-sheet acceptance (2026-10-27): mocked parent with a synthetic code door, the REAL
book session (book-session.mjs, code-lock.mjs, device-memory.mjs, vault.mjs), no provider calls.

The parent keeps only what a real host keeps: ciphertext, and the code row the browser
sealed (salt, proof, share, wrapped key). The 6 digits never leave the frame.
Only the organizer is a small stand-in. PASSPORT_SHOTS=<dir> saves 390 px screenshots.
"""
from pathlib import Path
import json
import os
from importlib.resources import files
import subprocess
from playwright.sync_api import sync_playwright, expect

ROOT = Path(os.environ.get('PASSPORT_WEB_ROOT') or str(files('toll_passport').joinpath('web')))
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
ORGANIZER = """export async function createOrganizer(){return {
  rank(question,items){const words=s=>new Set(s.toLowerCase().match(/[a-z]+/g)||[]),q=words(question);
    return items.map(i=>({id:i.id,score:[...words(i.text)].filter(w=>q.has(w)).length})).sort((a,b)=>b.score-a.score);},
  label(text){globalThis.__labels=(globalThis.__labels||0)+1;
    return {book:/project/i.test(text)?'business':'personal',topic:/project/i.test(text)?'project.description':null};}};}"""
PARENT = """<!doctype html><html><body style='margin:0'><iframe id='passport' sandbox='allow-scripts allow-same-origin allow-downloads'
 src='https://passport.example/hosted.html?view=questions' style='width:390px;height:780px;border:0'></iframe>
<script>
window.received=[];window.storage=ENVELOPES;window.questionContext=CONTEXT;window.offerAutofill=OFFER;
window.failSave=false;window.rate=false;let counter=1;
// Synthetic code door: keeps the sealed row only, counts tries, 10 wrong turns it off.
window.code=CODE_ROW;
// Each page is a new login: a book kept open by an earlier page asks for the code again.
const loginNonce=(crypto.randomUUID()+crypto.randomUUID()).replaceAll('-','');
const codeStatus=()=>code?{hasCode:true,vaultId:code.vaultId,salt:code.salt,iterations:code.iterations,
  attemptsLeft:code.disabled?0:10-code.attempts,disabled:code.disabled,loginNonce}:
  {hasCode:false,vaultId:null,salt:null,iterations:null,attemptsLeft:10,disabled:false,loginNonce};
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
 if(v.type==='request'&&v.protocol==='passport-hosted-v1'&&v.op.startsWith('code-')){
   const base={protocol:v.protocol,type:'result',nonce:v.nonce,capability:v.capability,id:v.id,op:v.op,scope:v.scope};
   if(v.op==='code-status')to({...base,ok:true,status:codeStatus()});
   else if(v.op==='code-set'){window.code={...v.code,attempts:0,disabled:false};to({...base,ok:true,status:codeStatus()});}
   else if(rate)to({...base,ok:false,error:'rate',attemptsLeft:code?10-code.attempts:10});
   else if(!code)to({...base,ok:false,error:'no-code',attemptsLeft:10});
   else if(code.disabled)to({...base,ok:false,error:'disabled',attemptsLeft:0});
   else if(v.auth!==code.auth){code.attempts++;code.disabled=code.attempts>=10;
     to({...base,ok:false,error:code.disabled?'disabled':'wrong',attemptsLeft:code.disabled?0:10-code.attempts});}
   else{code.attempts=0;to({...base,ok:true,opened:{share:code.share,wrappedKey:code.wrappedKey,vaultId:code.vaultId}});}
 }
 if(v.type==='release')to({protocol:v.protocol,type:'receipt',nonce:v.nonce,capability:v.capability,id:v.id,
   ok:true,receiptId:'synthetic-receipt'});
});
</script></body></html>"""


def main():
    node = os.environ.get('PASSPORT_NODE', 'node')
    create = """import {createVault,exportRecovery,addEntry,sealVault} from 'VAULT';
import {sealCode} from 'CODE';
const v=await createVault();let doc=v.document;
const saved=(question,value,labels)=>{doc=addEntry(doc,{kind:'answer',title:question,fields:{question,answer:value,value,
  subject:'subject:personal',scope:'reusable',taskId:'older-task',label:'',answerOptions:[]},...(labels?{labels}:{})});};
saved('What is your name?','Ada Lovelace');
saved('Describe your company','Makes plans for teams',{book:'business',topic:'project.description'});
const other=await createVault();
console.log(JSON.stringify({envelope:await sealVault(doc,v.key),etag:'v1',recovery:await exportRecovery(v.key,doc.vaultId),
  code:await sealCode('246810',v.key,doc.vaultId),other:await exportRecovery(other.key,other.document.vaultId)}));"""
    fixture = json.loads(subprocess.check_output([node, '--input-type=module', '-e',
                                                  create.replace('VAULT', (ROOT/'vault.mjs').as_uri())
                                                  .replace('CODE', (ROOT/'code-lock.mjs').as_uri())]))
    public = {'personal': {'envelope': fixture['envelope'], 'etag': 'v1'}}
    row = json.dumps({**fixture['code'], 'attempts': 0, 'disabled': False})

    def parent(context, offer=True, storage=public, code=row):
        return (PARENT.replace('CONTEXT', json.dumps(context)).replace('ENVELOPES', json.dumps(storage))
                .replace('OFFER', 'true' if offer else 'false').replace('CODE_ROW', code))
    pages = {'https://app.example/': parent(CONTEXT), 'https://app.example/single': parent(SINGLE, False),
             'https://app.example/fresh': parent(CONTEXT, False, {}, 'null'),
             'https://app.example/nocode': parent(CONTEXT, False, public, 'null')}
    recovery_file = lambda value, name='recovery.json': [{'name': name, 'mimeType': 'application/json',
                                                          'buffer': json.dumps(value).encode()}]
    codes = ['246810', '135790', '112233', '975310']
    with sync_playwright() as playwright:
        options = {'headless': True}
        if os.environ.get('PASSPORT_CHROME'):
            options['executable_path'] = os.environ['PASSPORT_CHROME']
        browser = playwright.chromium.launch(**options)
        context = browser.new_context(ignore_https_errors=True, viewport={'width': 390, 'height': 780})
        context.set_default_timeout(20000)
        opened, mine = [], []
        context.on('page', lambda p: opened.append(p))
        new_page = lambda: mine.append(context.new_page()) or mine[-1]
        served = []

        def route(request):
            url = request.request.url
            if url in pages:
                request.fulfill(status=200, content_type='text/html', body=pages[url])
            elif url.startswith('https://passport.example/'):
                path = url.split('https://passport.example/', 1)[1].split('?', 1)[0]
                served.append(path)
                if path == 'client-policy.mjs':
                    body = "export const ALLOWED_PARENT_ORIGINS = Object.freeze(['https://app.example']);"
                elif path == 'organizer.mjs':
                    body = ORGANIZER
                else:
                    body = (ROOT/path).read_bytes()
                request.fulfill(status=200, body=body, content_type=('text/html' if path.endswith('.html') else
                                'text/css' if path.endswith('.css') else 'text/javascript'))
            else:
                request.abort()
        context.route('**/*', route)
        errors = []

        def no_plain_codes(page):
            # Only the stretched proof and the sealed row ever reach the host.
            sent = json.dumps(page.evaluate('received'))
            assert not any(code in sent for code in codes), 'a plain code crossed to the host'
        page = new_page()
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
        assert 'book-session.mjs' in served and 'code-lock.mjs' in served  # the real session, not a stand-in
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
        expect(dialog.locator('.mini-passport__note')).to_have_text('Wrong code. 9 tries left.')
        assert page.evaluate('code.attempts') == 1
        shot('mini-passport-wrong-code-390.png')
        # The host's per-minute limit reads as a wait, not a lost try.
        page.evaluate('rate=true')
        code.fill('111112')
        dialog.get_by_role('button', name='Open Passport').click()
        expect(dialog.locator('.mini-passport__note')).to_have_text('Too many tries. Wait a minute.')
        page.evaluate('rate=false')
        code.fill('246810')
        dialog.get_by_role('button', name='Open Passport').click()
        expect(dialog).to_be_hidden()
        assert page.evaluate('code.attempts') == 0
        expect(frame.locator('[data-passport-connected]')).to_have_text('Passport connected')
        assert frame.locator('[data-passport-connected] svg[data-icon="plugs-connected"]').count() == 1
        expect(connect).to_be_hidden()
        page.wait_for_function("received.some(v=>v.type==='connection-state'&&v.connected===true)")
        for i in range(3):
            expect(sections.nth(i).get_by_label('Save to my Passport')).to_be_checked()
        # Saved answers show as suggestions; exact wording first, the organizer ranks the rest.
        first = sections.nth(0)
        expect(first.locator('.question-suggestion').first).to_contain_text('Ada Lovelace')
        expect(first.locator('.question-suggestion').first).to_contain_text('Saved answer · Personal')
        second = sections.nth(1)
        expect(second.locator('.question-suggestions')).to_contain_text('Makes plans for teams')
        first.get_by_role('button', name='Use answer').first.click()
        expect(first.locator('textarea')).to_have_value('Ada Lovelace')
        # The source is the tag it came from, never the old question text.
        expect(first.locator('.question-from')).to_have_text('From your Passport · Personal')
        plans = second.locator('.question-suggestion').filter(has_text='Makes plans for teams')
        expect(plans).to_contain_text('Saved answer · Business · Project description')
        plans.get_by_role('button', name='Use answer').click()
        expect(second.locator('.question-from')).to_have_text('From your Passport · Business · Project description')
        second.locator('textarea').fill('NEW_PROJECT_ANSWER')
        expect(second.locator('.question-from')).to_be_hidden()
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
            .map(v=>({...v.fields,labels:v.labels||null,fieldLabels:Object.hasOwn(v.fields,'labels')}));}""",
            {'envelope': page.evaluate("storage.personal.envelope"), 'recovery': fixture['recovery']})
        # Labels ride the saved version, never the fields.
        assert [(f['question'], f['value'], f['labels'], f['fieldLabels']) for f in saved] == [
            ('What does your project do?', 'NEW_PROJECT_ANSWER', {'book': 'business', 'topic': 'project.description'}, False),
            ('Pick a color', 'blue', {'book': 'personal'}, False)], saved
        assert page.evaluate("received.some(v=>v.type==='open-book')") is False
        no_plain_codes(page)
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
        failed.close()
        # Lock takes a book answer back out of the form; typed work stays.
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
        # The 10th wrong try turns the code off: the recovery key opens it, then a new code is picked.
        lf.locator('[data-passport-connect]').click()
        lf.get_by_label('Your 6-digit code').wait_for()
        locked.evaluate('code.attempts=9')
        lf.get_by_label('Your 6-digit code').fill('000000')
        lf.get_by_role('button', name='Open Passport').click()
        lf.get_by_text('Too many tries. Open with your recovery key.').wait_for(timeout=10000)
        lf.locator('[data-recovery-file]').set_input_files(files=recovery_file({'format': 'passport-vault-v1'}))
        lf.get_by_text('That is an encrypted backup, not the recovery key.').wait_for()
        lf.locator('[data-recovery-file]').set_input_files(files=recovery_file(fixture['recovery']))
        lf.get_by_label('Pick a 6-digit code').fill('135790')
        lf.get_by_label('Type it again').fill('135790')
        lf.get_by_role('button', name='Save code').click()
        expect(lf.locator('dialog.mini-passport')).to_be_hidden(timeout=15000)
        lf.locator('[data-passport-connected]').wait_for(timeout=10000)
        got = locked.evaluate('[code.attempts,code.disabled,code.vaultId]')
        assert got == [0, False, fixture['code']['vaultId']], got
        assert locked.evaluate('code.auth') != fixture['code']['auth']
        # Forgot the code: the recovery key opens it and a new code replaces the old one.
        locked.evaluate('lockSheet()')
        expect(lf.locator('[data-passport-connect]')).to_be_visible(timeout=10000)
        lf.locator('[data-passport-connect]').click()
        lf.get_by_role('button', name='Forgot your code? Use your recovery key').click()
        lf.locator('[data-recovery-file]').set_input_files(files=recovery_file(fixture['recovery']))
        lf.get_by_label('Pick a 6-digit code').fill('975310')
        lf.get_by_label('Type it again').fill('975310')
        lf.get_by_role('button', name='Save code').click()
        expect(lf.locator('dialog.mini-passport')).to_be_hidden(timeout=15000)
        lf.locator('[data-passport-connected]').wait_for(timeout=10000)
        no_plain_codes(locked)
        locked.close()
        # A book that has no code yet: the recovery key once, then a code. Every refusal in plain words.
        nocode = new_page()
        nocode.on('pageerror', lambda error: errors.append(str(error)))
        nocode.goto('https://app.example/nocode')
        nc = nocode.frame_locator('#passport')
        nc.locator('[data-passport-connect]').click()
        nc.get_by_text('Open your Passport with your recovery key once. Then pick a 6-digit code.').wait_for()
        nc.locator('[data-recovery-file]').set_input_files(files=[{'name': 'broken.json', 'mimeType': 'application/json', 'buffer': b'{broken'}])
        nc.get_by_text('That is not a Passport recovery key.').wait_for()
        nc.locator('[data-recovery-file]').set_input_files(files=recovery_file(fixture['other']))
        nc.get_by_text('That recovery key is for a different Passport.').wait_for()
        nc.locator('[data-recovery-file]').set_input_files(files=recovery_file(fixture['recovery']))
        nc.get_by_label('Pick a 6-digit code').wait_for()
        assert nocode.evaluate('code') is None
        nc.get_by_role('button', name='Not now').click()
        expect(nc.locator('dialog.mini-passport')).to_be_hidden()
        nc.locator('[data-passport-connected]').wait_for(timeout=10000)
        assert nocode.evaluate('code') is None
        nocode.close()
        # No book yet: set one up in the same pop-up and offer the recovery key.
        fresh = new_page()
        fresh.on('pageerror', lambda error: errors.append(str(error)))
        fresh.goto('https://app.example/fresh')
        nf = fresh.frame_locator('#passport')
        nf.locator('.batch-question').first.wait_for(timeout=10000)
        nf.locator('[data-passport-connect]').click()
        nf.get_by_label('Pick a 6-digit code').fill('112233')
        nf.get_by_label('Type it again').fill('112234')
        nf.get_by_role('button', name='Set up Passport').click()
        nf.get_by_text('The two codes do not match.').wait_for()
        nf.get_by_label('Type it again').fill('112233')
        nf.get_by_role('button', name='Set up Passport').click()
        with fresh.expect_download() as download:
            nf.locator('[data-recovery-download]').click()
        assert download.value.suggested_filename == 'passport-recovery.json'
        nf.get_by_role('button', name='Done').click()
        expect(nf.locator('dialog.mini-passport')).to_be_hidden()
        nf.locator('[data-passport-connected]').wait_for(timeout=10000)
        assert fresh.evaluate('storage.personal.envelope.vaultId') == fresh.evaluate('code.vaultId')
        assert fresh.evaluate("received.some(v=>v.type==='autofill-request')") is False
        expect(nf.locator('[data-question-autofill]')).to_be_hidden()
        no_plain_codes(fresh)
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
        assert len(opened) == len(mine) == 6, (opened, mine)  # no tab or pop-up ever opened
        assert not errors, errors
        print('PASS: one sheet on the real book session: code/rate/off/recovery/forgot/no-code/setup in the mini Passport, '
              'plain refusals, tag source line, labels on the version, autofill blanks only, send then save, no new tab', flush=True)
        page.close()
        browser.close()


if __name__ == '__main__':
    main()
