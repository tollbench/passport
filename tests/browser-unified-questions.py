"""Focused local browser fixture; mocked parent sends no real vault or provider calls."""
from pathlib import Path
import json
import subprocess
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1] / 'src/toll_passport/web'
CONTEXT = {
    'requestId': '11111111-1111-4111-8111-111111111111', 'token': 'synthetic-signed',
    'scope': 'personal', 'subject': 'subject:personal',
    'bookSubjects': {'personal': 'subject:personal', 'business': 'subject:business'},
    'taskId': 'synthetic-task', 'purpose': 'Synthetic questions',
    'recipient': {'id': 'synthetic-agent', 'name': 'Synthetic Agent'},
    'questions': [
        {'id': 'one', 'digest': 'a'*64, 'title': 'What is your name?',
         'format': 'short_answer', 'label': None, 'options': [], 'bookScope': 'personal'},
        {'id': 'two', 'digest': 'b'*64, 'title': 'What does your project do?',
         'format': 'written_response', 'label': None, 'options': [], 'bookScope': 'business'},
    ], 'expiresAt': 4102444800000,
}
SINGLE = {
    'requestId': '22222222-2222-4222-8222-222222222222', 'token': 'synthetic-single',
    'scope': 'personal', 'subject': 'subject:personal',
    'bookSubjects': {'personal': 'subject:personal', 'business': 'subject:business'},
    'taskId': 'synthetic-single-task', 'question': {
        'id': 'one', 'digest': 'a'*64, 'title': 'What is your name?',
        'format': 'short_answer', 'bookScope': 'personal'},
    'recipient': {'id': 'synthetic-agent', 'name': 'Synthetic Agent'},
    'label': None, 'expiresAt': 4102444800000,
}
LOCK_PARENT = """<!doctype html><iframe id='passport' sandbox='allow-scripts allow-same-origin allow-downloads'
 src='https://passport.example/hosted.html'></iframe><script>
window.received=[];window.pendingLoad=null;window.readyNonce=null;
const child=document.getElementById('passport');
const to=data=>child.contentWindow.postMessage(data,'https://passport.example');
window.addEventListener('message',event=>{
 if(event.source!==child.contentWindow||event.origin!=='https://passport.example')return;
 const v=event.data;received.push(v);
 if(v.protocol==='passport-hosted-v1'&&v.type==='ready'){
   readyNonce=v.nonce;
   to({protocol:v.protocol,type:'init',nonce:v.nonce,capability:'a'.repeat(32),
     scopes:['personal','business'],scope:'personal',
     storageIdentity:{ownerBinding:'x'.repeat(32),parentOrigin:'https://app.example'}});
 }
 if(v.protocol==='passport-hosted-v1'&&v.type==='request'&&v.op==='load') pendingLoad=v;
});
window.lockPassport=()=>to({protocol:'passport-hosted-v1',type:'control',nonce:readyNonce,
 capability:'a'.repeat(32),id:'99999999-9999-4999-8999-999999999999',command:'lock-all'});
window.releaseLoad=envelope=>to({...pendingLoad,type:'result',ok:true,envelope,etag:'v1'});
</script>"""
PARENT = """<!doctype html><html><body><iframe id='passport' sandbox='allow-scripts allow-same-origin allow-downloads'
 src='https://passport.example/hosted.html?view=questions' style='width:680px;height:600px'></iframe>
<script>
window.received=[];window.storage=ENVELOPES;window.questionContext=CONTEXT;
window.failSave=false;window.holdSave=false;window.pendingSaves=[];let counter=1;
const child=document.getElementById('passport');
window.addEventListener('message',event=>{
 if(event.source!==child.contentWindow||event.origin!=='https://passport.example')return;
 const v=event.data;received.push(v);
 const to=data=>child.contentWindow.postMessage(data,'https://passport.example');
 if(v.type==='ready'&&v.protocol==='passport-hosted-v1')
   to({protocol:v.protocol,type:'init',nonce:v.nonce,capability:'a'.repeat(32),
     scopes:['personal','business'],scope:'personal',
     storageIdentity:{ownerBinding:'x'.repeat(32),parentOrigin:'https://app.example'}});
 if(v.type==='question-ui'&&v.protocol==='passport-hosted-v1')to({...v,type:'question-ui-ack'});
 if(v.type==='ready'&&v.protocol==='passport-question-batch-v1')
   to({protocol:v.protocol,type:'init',nonce:v.nonce,capability:'b'.repeat(64),context:questionContext});
 if(v.type==='request'&&v.protocol==='passport-hosted-v1'&&v.op==='load')
   to({...v,type:'result',ok:true,envelope:storage[v.scope]?.envelope||null,
      etag:storage[v.scope]?.etag||null});
 if(v.type==='request'&&v.protocol==='passport-hosted-v1'&&v.op==='save'){
   const base={protocol:v.protocol,type:'result',nonce:v.nonce,capability:v.capability,
      id:v.id,op:v.op,scope:v.scope};
   const finish=()=>{
     if(failSave||v.expectedEtag!==storage[v.scope]?.etag){to({...base,ok:false,error:'conflict'});return;}
     storage[v.scope]={envelope:v.envelope,etag:'v'+(++counter)};
     to({...base,ok:true,etag:storage[v.scope].etag});
   };
   if(holdSave)pendingSaves.push(finish);else finish();
 }
 if(v.type==='release'&&v.protocol==='passport-question-batch-v1')
   to({protocol:v.protocol,type:'receipt',nonce:v.nonce,capability:v.capability,id:v.id,
      ok:true,receiptId:'synthetic-receipt'});
});
</script></body></html>"""

def main():
    node='/private/tmp/toll-passport-venv/lib/python3.9/site-packages/playwright/driver/node'
    create="""import {createVault,exportRecovery} from './src/toll_passport/web/vault.mjs';
let out={};for(const scope of ['personal','business']){const v=await createVault();
out[scope]={envelope:v.envelope,etag:'v1',recovery:await exportRecovery(v.key,v.document.vaultId)};}
console.log(JSON.stringify(out));"""
    fixtures=json.loads(subprocess.check_output([node,'--input-type=module','-e',create],cwd=ROOT.parents[2]))
    public={scope:{'envelope':row['envelope'],'etag':row['etag']} for scope,row in fixtures.items()}
    html = PARENT.replace('CONTEXT', json.dumps(CONTEXT)).replace('ENVELOPES',json.dumps(public))
    single_html = PARENT.replace('CONTEXT', json.dumps(SINGLE)).replace('ENVELOPES',json.dumps(public))
    single_html = single_html.replace('passport-question-batch-v1','passport-question-v1')
    topic_context={**CONTEXT,'requestId':'44444444-4444-4444-8444-444444444444',
      'taskId':'synthetic-company-task','questions':[
        {'id':'one','digest':'c'*64,'title':'Describe Tollbench','format':'short_answer',
         'label':None,'options':[],'bookScope':'business'},
        {'id':'two','digest':'d'*64,'title':'What does the company do?',
         'format':'short_answer','label':None,'options':[],'bookScope':'business'}],
      'matching':{'version':1,'catalogVersion':'1',
        'allowedRequestTypes':['organization.description','project.description'],
        'requests':[{'questionId':'one','requestType':'organization.description','contextKey':'company-profile'},
          {'questionId':'two','requestType':None,'contextKey':'company-profile'}]}}
    topic_html=PARENT.replace('CONTEXT',json.dumps(topic_context)).replace('ENVELOPES',json.dumps(public))
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True,
            executable_path='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
            args=['--no-sandbox'])
        page = browser.new_page(ignore_https_errors=True, viewport={'width': 760, 'height': 700})
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        def route(request):
            url = request.request.url
            if url == 'https://app.example/':
                request.fulfill(status=200, content_type='text/html', body=html)
            elif url == 'https://app.example/single':
                request.fulfill(status=200, content_type='text/html', body=single_html)
            elif url == 'https://app.example/topic':
                request.fulfill(status=200, content_type='text/html', body=topic_html)
            elif url == 'https://app.example/locked':
                request.fulfill(status=200, content_type='text/html', body=LOCK_PARENT)
            elif url.startswith('https://passport.example/'):
                path=url.split('https://passport.example/',1)[1].split('?',1)[0]
                if path == 'client-policy.mjs':
                    request.fulfill(status=200,content_type='text/javascript',
                        body="export const ALLOWED_PARENT_ORIGINS = Object.freeze(['https://app.example']);")
                else:
                    file=ROOT/path
                    request.fulfill(status=200, content_type=('text/html' if path.endswith('.html') else
                        'text/css' if path.endswith('.css') else 'text/javascript'),body=file.read_bytes())
            else:
                request.abort()
        page.route('**/*', route)
        page.goto('https://app.example/')
        frame = page.frame_locator('#passport')
        frame.get_by_text('What is your name?').wait_for(timeout=10000)
        assert frame.get_by_text('What does your project do?').count() == 1
        assert frame.get_by_role('button',name='Connect Passport').count() >= 1
        assert page.evaluate("received.filter(v=>v.type==='view-ready').length") == 1
        assert page.evaluate("received.some(v=>v.type==='connection-state'&&v.connected===false)")
        assert page.evaluate("received.some(v=>JSON.stringify(v).includes('What is your name?'))") is False
        assert not errors, errors
        # Test-only enrollment inside the isolated origin, equivalent to explicit recovery+Remember in the book view.
        frame_handle=page.frame(name=None,url='https://passport.example/hosted.html?view=questions')
        for scope,row in fixtures.items():
            frame_handle.evaluate("""async ({scope,envelope,recovery})=>{
              const {unlockVault}=await import('/vault.mjs');
              const {createDeviceMemory,indexedDbDeviceStorage}=await import('/device-memory.mjs');
              const opened=await unlockVault(envelope,recovery);
              await createDeviceMemory(indexedDbDeviceStorage()).remember(
                {ownerBinding:'x'.repeat(32),parentOrigin:'https://app.example'},scope,envelope.vaultId,opened.key);
            }""",{'scope':scope,'envelope':row['envelope'],'recovery':row['recovery']})
        page.evaluate("document.getElementById('passport').src+='&again=1'")
        frame=page.frame_locator('#passport')
        answer=frame.locator('textarea').first
        answer.wait_for(timeout=10000)
        page.wait_for_function("received.some(v=>v.type==='connection-state'&&v.connected===true)")
        answer.fill('SYNTHETIC_PRIVATE_ANSWER')
        frame.locator('textarea').nth(1).fill('SYNTHETIC_BUSINESS_ANSWER')
        frame.get_by_text('Not saved to Passport. Only in this form.').first.wait_for(timeout=10000)
        assert page.evaluate("received.filter(v=>v.type==='request'&&v.op==='save').length") == 0
        assert frame.get_by_role('dialog').count()==0
        expect(frame.locator('.question-source').first).to_contain_text('For Synthetic Agent')
        assert page.evaluate("received.filter(v=>v.type==='request'&&v.op==='save').length") == 0
        page.evaluate("document.getElementById('passport').src+='&unsaved-reopen=1'")
        frame=page.frame_locator('#passport')
        frame.get_by_text('Passport · Connected').wait_for(timeout=10000)
        expect(frame.locator('textarea').first).to_have_value('',timeout=10000)
        expect(frame.locator('textarea').nth(1)).to_have_value('',timeout=10000)
        frame.locator('textarea').first.fill('SYNTHETIC_PRIVATE_ANSWER')
        frame.locator('textarea').nth(1).fill('SYNTHETIC_BUSINESS_ANSWER')
        frame.get_by_role('button',name='Save to Passport').click()
        page.wait_for_function("received.filter(v=>v.type==='request'&&v.op==='save').length===2")
        frame.get_by_text('Saved to Passport. Nothing sent.').first.wait_for(timeout=10000)
        assert page.evaluate("received.filter(v=>v.type==='request'&&v.op==='save').map(v=>v.scope)") == ['personal','business']
        assert page.evaluate("received.some(v=>v.type==='release')") is False
        assert page.evaluate("received.some(v=>v.type==='request'&&JSON.stringify(v).includes('SYNTHETIC_PRIVATE_ANSWER'))") is False
        for scope,row in fixtures.items():
            saved=page.evaluate('(scope)=>storage[scope].envelope',scope)
            private=frame_handle.evaluate("""async ({envelope,recovery})=>{
              const {unlockVault}=await import('/vault.mjs');
              return (await unlockVault(envelope,recovery)).document.entries.map(e=>e.versions.at(-1).kind);
            }""",{'envelope':saved,'recovery':row['recovery']})
            assert 'answer' in private and 'answer_draft' in private
        page.evaluate("questionContext.requestId='33333333-3333-4333-8333-333333333333';document.getElementById('passport').src+='&new-request=1'")
        frame=page.frame_locator('#passport')
        expect(frame.locator('textarea').first).to_have_value('SYNTHETIC_PRIVATE_ANSWER',timeout=10000)
        expect(frame.locator('textarea').nth(1)).to_have_value('SYNTHETIC_BUSINESS_ANSWER',timeout=10000)
        expect(frame.locator('.question-source').first).to_contain_text('For Synthetic Agent')
        assert frame.get_by_role('dialog').count()==0
        frame.locator('[data-question-send]').click()
        assert page.evaluate("received.filter(v=>v.type==='release').length") == 1
        assert page.evaluate("received.filter(v=>v.type==='request'&&v.op==='save').length") == 2
        assert page.evaluate("received.find(v=>v.type==='release').answers.map(a=>a.value)") == [
            'SYNTHETIC_PRIVATE_ANSWER','SYNTHETIC_BUSINESS_ANSWER']
        frame.locator('textarea').nth(1).fill('')
        frame.get_by_role('button',name='Save to Passport').click()
        page.wait_for_function("received.filter(v=>v.type==='request'&&v.op==='save').length===3")
        frame.get_by_text('Saved to Passport. Nothing sent.').first.wait_for(timeout=10000)
        page.evaluate("document.getElementById('passport').src+='&cleared=1'")
        frame=page.frame_locator('#passport')
        frame.get_by_text('Passport · Connected').wait_for(timeout=10000)
        expect(frame.locator('textarea').nth(1)).to_have_value('',timeout=10000)
        page.evaluate("failSave=true;document.getElementById('passport').src+='&failure=1'")
        frame=page.frame_locator('#passport')
        frame.get_by_text('Passport · Connected').wait_for(timeout=10000)
        expect(frame.locator('textarea').first).to_have_value('SYNTHETIC_PRIVATE_ANSWER',timeout=10000)
        frame.locator('textarea').first.fill('UNSAVED_NEW_ANSWER')
        frame.get_by_role('button',name='Save to Passport').click()
        frame.get_by_text('Not saved to Passport. Your answer remains in this form.').wait_for(timeout=10000)
        expect(frame.locator('textarea').first).to_have_value('UNSAVED_NEW_ANSWER')
        assert not frame.locator('[data-question-send]').is_disabled()
        assert page.evaluate("received.filter(v=>v.type==='release').length") == 1
        page.evaluate('failSave=false;holdSave=true')
        page.evaluate("document.getElementById('passport').src+='&race-fresh=1'")
        frame=page.frame_locator('#passport')
        frame.get_by_text('Passport · Connected').wait_for(timeout=10000)
        frame.locator('textarea').first.fill('SNAPSHOT_A')
        frame.locator('textarea').nth(1).fill('SNAPSHOT_B')
        frame.get_by_role('button',name='Save to Passport').click()
        page.wait_for_function('pendingSaves.length===1')
        frame.locator('textarea').nth(1).fill('SNAPSHOT_B_LATE')
        page.evaluate('holdSave=false;pendingSaves.shift()()')
        frame.get_by_text('Some answers were not saved. They remain in this form.').wait_for(timeout=10000)
        page.evaluate("document.getElementById('passport').src+='&race-reopen=1'")
        frame=page.frame_locator('#passport')
        expect(frame.locator('textarea').first).to_have_value('SNAPSHOT_A',timeout=10000)
        expect(frame.locator('textarea').nth(1)).to_have_value('',timeout=10000)
        assert not errors,errors
        topic_page=browser.new_page(ignore_https_errors=True)
        topic_page.route('**/*',route)
        topic_page.goto('https://app.example/topic')
        topic_frame=topic_page.frame_locator('#passport')
        topic_frame.get_by_text('Describe Tollbench').wait_for(timeout=10000)
        topic_handle=topic_page.frame(url='https://passport.example/hosted.html?view=questions')
        for scope,row in fixtures.items():
            topic_handle.evaluate("""async ({scope,envelope,recovery})=>{
              const {unlockVault}=await import('/vault.mjs');
              const {createDeviceMemory,indexedDbDeviceStorage}=await import('/device-memory.mjs');
              const opened=await unlockVault(envelope,recovery);
              await createDeviceMemory(indexedDbDeviceStorage()).remember(
                {ownerBinding:'x'.repeat(32),parentOrigin:'https://app.example'},scope,envelope.vaultId,opened.key);
            }""",{'scope':scope,'envelope':row['envelope'],'recovery':row['recovery']})
        topic_page.evaluate("document.getElementById('passport').src+='&connected=1'")
        topic_frame=topic_page.frame_locator('#passport')
        topic_frame.get_by_text('Passport · Connected').wait_for(timeout=10000)
        second=topic_frame.locator('.batch-question').nth(1)
        second.locator('summary').click()
        second.get_by_label('Topic').select_option('organization.description')
        second.locator('.question-add-who input').fill('Synthetic Co')
        second.get_by_role('button',name='Add privately').click()
        second.locator('textarea').fill('Makes plans for teams')
        second.get_by_text('Not saved to Passport. Only in this form.').wait_for(timeout=10000)
        topic_frame.get_by_role('button',name='Save to Passport').click()
        second.get_by_text('Saved to Passport. Nothing sent.').wait_for(timeout=10000)
        topic_page.evaluate("document.getElementById('passport').src+='&again=1'")
        topic_frame=topic_page.frame_locator('#passport')
        first=topic_frame.locator('.batch-question').first
        first.get_by_text('About Synthetic Co').wait_for(timeout=10000)
        first.get_by_role('button',name='Use answer').click()
        expect(first.locator('textarea')).to_have_value('Makes plans for teams')
        first.get_by_text('Not saved to Passport. Only in this form.').wait_for(timeout=10000)
        topic_frame.get_by_role('button',name='Save to Passport').click()
        first.get_by_text('Saved to Passport. Nothing sent.').wait_for(timeout=10000)
        topic_page.evaluate("document.getElementById('passport').src+='&source-reopen=1'")
        topic_frame=topic_page.frame_locator('#passport')
        first=topic_frame.locator('.batch-question').first
        expect(first.locator('textarea')).to_have_value('Makes plans for teams',timeout=10000)
        first.get_by_label('Send this answer').uncheck()
        first.get_by_label('Send this answer').check()
        first.get_by_text('Not saved to Passport. Only in this form.').wait_for(timeout=10000)
        expect(first.locator('.question-source').last).to_contain_text('About Synthetic Co')
        expect(first.locator('.question-source').last).to_contain_text('Source: What does the company do?')
        assert topic_frame.get_by_role('dialog').count()==0
        assert topic_page.evaluate("received.some(v=>v.type==='release')") is False
        topic_page.close()
        page.evaluate("""()=>{
          window.bookFrame=document.createElement('iframe');bookFrame.id='book-frame';
          bookFrame.sandbox='allow-scripts allow-same-origin allow-downloads';
          bookFrame.src='https://passport.example/hosted.html';document.body.append(bookFrame);
          window.addEventListener('message',event=>{
            if(event.source!==bookFrame.contentWindow||event.origin!=='https://passport.example')return;
            const v=event.data,to=data=>bookFrame.contentWindow.postMessage(data,'https://passport.example');
            if(v.protocol==='passport-hosted-v1'&&v.type==='ready'){
              window.bookNonce=v.nonce;
              to({protocol:v.protocol,type:'init',nonce:v.nonce,capability:'c'.repeat(32),
                scopes:['personal','business'],scope:'personal',
                storageIdentity:{ownerBinding:'x'.repeat(32),parentOrigin:'https://app.example'}});
            }
            if(v.protocol==='passport-hosted-v1'&&v.type==='request'&&v.op==='load')
              to({...v,type:'result',ok:true,envelope:storage[v.scope]?.envelope||null,
                etag:storage[v.scope]?.etag||null});
          });
        }""")
        book=page.frame_locator('#book-frame')
        book.locator('#book').wait_for(state='visible',timeout=10000)
        page.evaluate("""()=>bookFrame.contentWindow.postMessage({protocol:'passport-hosted-v1',
          type:'control',nonce:bookNonce,capability:'c'.repeat(32),
          id:'88888888-8888-4888-8888-888888888888',command:'lock-all'},
          'https://passport.example')""")
        book.locator('#book').wait_for(state='hidden',timeout=10000)
        expect(frame.locator('textarea').first).to_have_value('',timeout=10000)
        assert 'UNSAVED_NEW_ANSWER' not in frame.locator('body').inner_text()
        assert not frame.locator('[data-question-send]').is_disabled()
        assert page.evaluate("received.filter(v=>v.type==='connection-state').at(-1).connected") is False
        single=browser.new_page(ignore_https_errors=True, viewport={'width':760,'height':700})
        single_errors=[]
        single.on('pageerror',lambda error:single_errors.append(str(error)))
        single.route('**/*',route)
        single.goto('https://app.example/single')
        sf=single.frame_locator('#passport')
        sf.get_by_text('What is your name?').wait_for(timeout=10000)
        assert single.evaluate("received.filter(v=>v.type==='view-ready').length") == 1
        single_frame=single.frame(url='https://passport.example/hosted.html?view=questions')
        row=fixtures['personal']
        single_frame.evaluate("""async ({envelope,recovery})=>{
          const {unlockVault}=await import('/vault.mjs');
          const {createDeviceMemory,indexedDbDeviceStorage}=await import('/device-memory.mjs');
          const opened=await unlockVault(envelope,recovery);
          await createDeviceMemory(indexedDbDeviceStorage()).remember(
            {ownerBinding:'x'.repeat(32),parentOrigin:'https://app.example'},'personal',envelope.vaultId,opened.key);
        }""",{'envelope':row['envelope'],'recovery':row['recovery']})
        single.evaluate("document.getElementById('passport').src+='&again=1'")
        sf=single.frame_locator('#passport')
        sf.locator('textarea').fill('SYNTHETIC_SINGLE_ANSWER')
        sf.get_by_text('Not saved to Passport. Only in this form.').wait_for(timeout=10000)
        sf.locator('[data-question-send]').click()
        assert single.evaluate("received.filter(v=>v.type==='release').length") == 1
        assert single.evaluate("received.filter(v=>v.type==='request'&&v.op==='save').length") == 0
        assert single.evaluate("received.find(v=>v.type==='release').answer") == 'SYNTHETIC_SINGLE_ANSWER'
        assert not single_errors,single_errors
        locked=browser.new_page(ignore_https_errors=True)
        locked_errors=[]
        locked.on('pageerror',lambda error:locked_errors.append(str(error)))
        locked.route('**/*',route)
        locked.goto('https://app.example/locked')
        locked.wait_for_function('!!window.pendingLoad',timeout=5000)
        locked.evaluate('lockPassport()')
        locked.wait_for_function("received.some(v=>v.type==='control-result'&&v.ok===true)")
        locked.evaluate('(envelope)=>releaseLoad(envelope)',fixtures['personal']['envelope'])
        locked.wait_for_timeout(100)
        assert locked.frame_locator('#passport').locator('body').get_attribute('data-book-state') != 'open'
        assert not locked_errors,locked_errors
        print('PASS: batch and single questions, two books, explicit release, failed save, late load lock',flush=True)
        locked.close();single.close();page.close()
        browser.close()

if __name__ == '__main__':
    main()
