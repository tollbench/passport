"""Synthetic browser acceptance checks; run against a local Passport server."""
import json
import os
import tempfile
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

with tempfile.TemporaryDirectory(prefix='passport-browser-') as tmp, sync_playwright() as p:
    options = {'headless': True}
    if os.environ.get('PASSPORT_CHROME'):
        options['executable_path'] = os.environ['PASSPORT_CHROME']
    browser = p.chromium.launch(**options)
    context = browser.new_context(accept_downloads=True)
    page = context.new_page()
    requests, errors = [], []
    page.on('request', lambda r: requests.append((r.method, r.url)))
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.goto('http://127.0.0.1:8765/')
    expect(page.locator('#create')).to_be_visible()
    with page.expect_download() as d:
        page.locator('#create').click()
    recovery = Path(tmp)/'recovery.json'
    d.value.save_as(recovery)
    expect(page.locator('#book')).to_be_visible()
    page.locator('#entry-form [name=title]').fill('PRIVATE_TITLE_CANARY')
    page.locator('#entry-form [name=content]').fill('PRIVATE_BODY_CANARY')
    page.locator('#entry-form [name=tag]').fill('My unusual label')
    page.locator('#entry-form button').click()
    expect(page.locator('#entries')).to_contain_text('PRIVATE_BODY_CANARY')
    page.locator('#question-form [name=question]').fill('Who should we target?')
    page.locator('#question-form [name=answer]').fill('Builders')
    page.locator('#question-form [name=subject]').fill('Example business')
    page.locator('#question-form button').click()
    expect(page.locator('#entries')).to_contain_text('Builders')
    page.locator('#upload').set_input_files({'name':'example.txt','mimeType':'text/plain','buffer':b'PRIVATE_FILE_CANARY'})
    expect(page.locator('#entries')).to_contain_text('example.txt')
    with page.expect_download() as d:
        page.locator('#backup').click()
    backup = Path(tmp)/'backup.json'
    d.value.save_as(backup)
    body=backup.read_text()
    assert all(s not in body for s in ('PRIVATE_TITLE_CANARY','PRIVATE_BODY_CANARY','PRIVATE_FILE_CANARY','Builders'))
    stored=page.evaluate("""async()=>{const db=await new Promise(r=>{const q=indexedDB.open('passport-local-v1');q.onsuccess=()=>r(q.result)});return await new Promise(r=>{const q=db.transaction('vault').objectStore('vault').getAll();q.onsuccess=()=>r(q.result)})}""")
    assert len(stored)==1 and set(stored[0])=={'format','vaultId','revision','nonce','ciphertext'}
    page.locator('#entries .record').first.get_by_role('button',name='Choose what to share').click()
    page.locator('input[value="content"]').check()
    page.locator('#share-form [name=recipient]').fill('Example agent')
    page.locator('#share-form [name=purpose]').fill('Use only the selected body')
    page.locator('#share-form button').first.click()
    expect(page.locator('#share-preview')).to_contain_text('PRIVATE_BODY_CANARY')
    assert 'PRIVATE_TITLE_CANARY' not in page.locator('#share-preview').inner_text()
    page.locator('input[value="content"]').uncheck()
    expect(page.get_by_role('button',name='Download encrypted package',exact=True)).to_have_count(0)
    page.locator('input[value="content"]').check()
    # An edit while encryption is pending must not revive the stale download.
    page.evaluate("""()=>{window.originalEncrypt=crypto.subtle.encrypt.bind(crypto.subtle);crypto.subtle.encrypt=async(...a)=>{await new Promise(r=>setTimeout(r,150));return window.originalEncrypt(...a)}}""")
    page.locator('#share-form button').first.click()
    page.locator('#share-form [name=purpose]').fill('Changed during encryption')
    expect(page.locator('#share-form button').first).to_be_enabled()
    expect(page.get_by_role('button',name='Download encrypted package',exact=True)).to_have_count(0)
    page.evaluate('()=>{crypto.subtle.encrypt=window.originalEncrypt;delete window.originalEncrypt}')
    page.locator('#share-form button').first.click()
    with page.expect_download() as d:
        page.get_by_role('button',name='Download encrypted package',exact=True).click()
    shared=Path(tmp)/'shared.json';d.value.save_as(shared)
    with page.expect_download() as d:
        page.get_by_role('button',name='Download separate package key',exact=True).click()
    sharedkey=Path(tmp)/'shared-key.json';d.value.save_as(sharedkey)
    assert 'PRIVATE_BODY_CANARY' not in shared.read_text()
    released=page.evaluate("""async ({e,r})=>{const m=await import('/vault.mjs');return m.decryptRelease(e,r)}""",{'e':json.loads(shared.read_text()),'r':json.loads(sharedkey.read_text())})
    assert released['fields']=={'content':'PRIVATE_BODY_CANARY'} and 'title' not in released and 'files' not in released
    page.locator('#lock').click()
    expect(page.locator('#locked')).to_be_visible()
    assert 'PRIVATE_BODY_CANARY' not in page.locator('body').inner_text()
    page.locator('#unlock').set_input_files(str(sharedkey))
    expect(page.locator('#status')).to_contain_text('Could not complete')
    expect(page.locator('#book')).to_be_hidden()
    page.locator('#unlock').set_input_files(str(recovery))
    expect(page.locator('#entries')).to_contain_text('PRIVATE_BODY_CANARY')
    # Restore into a second empty browser context: both files required, content preserved.
    other=browser.new_context(accept_downloads=True);q=other.new_page();q.goto('http://127.0.0.1:8765/')
    with q.expect_file_chooser() as fc:
        q.locator('#restore').set_input_files(str(backup))
    fc.value.set_files(str(recovery))
    expect(q.locator('#entries')).to_contain_text('example.txt')
    expect(q.locator('#entries')).to_contain_text('PRIVATE_BODY_CANARY')
    # Changing the vault invalidates every sharing preview.
    q.locator('#entries .record').first.get_by_role('button',name='Choose what to share').click()
    q.locator('input[value="content"]').check()
    q.locator('#share-form [name=recipient]').fill('A');q.locator('#share-form [name=purpose]').fill('B')
    q.locator('#share-form button').first.click()
    expect(q.locator('#share-preview')).to_contain_text('PRIVATE_BODY_CANARY')
    q.on('dialog', lambda d:d.accept())
    with q.expect_file_chooser() as fc:
        q.locator('#restore-open').set_input_files(str(backup))
    fc.value.set_files(str(recovery))
    expect(q.locator('#share')).to_be_hidden()
    expect(q.locator('#share-preview')).to_be_empty()
    # Incoming fields never collide with provenance fields introduced by the UI.
    fixture=q.evaluate("""async()=>{const m=await import('/vault.mjs');const v=await m.createVault();const d=m.addEntry(v.document,{kind:'note',title:'Incoming',fields:{sourceRecipient:'KEEP_ORIGINAL',sourcePurpose:'KEEP_PURPOSE'}});const e=d.entries[0];return m.encryptRelease(m.selectRelease(d,{entryId:e.id,version:1,fields:['sourceRecipient','sourcePurpose'],recipient:'Recipient label',purpose:'Purpose label'}))}""")
    q.locator('details summary').click()
    q.locator('#receive').set_input_files({'name':'release.json','mimeType':'application/json','buffer':json.dumps(fixture['envelope']).encode()})
    q.locator('#receive-key').set_input_files({'name':'key.json','mimeType':'application/json','buffer':json.dumps(fixture['recovery']).encode()})
    q.locator('#open-release').click()
    q.get_by_role('button',name='Save received information privately',exact=True).click()
    expect(q.locator('#entries')).to_contain_text('KEEP_ORIGINAL')
    expect(q.locator('#entries')).to_contain_text('KEEP_PURPOSE')
    # Cross-tab change locks an existing unlocked view rather than overwriting it.
    tab=context.new_page();tab.goto('http://127.0.0.1:8765/')
    tab.locator('#unlock').set_input_files(str(recovery))
    expect(tab.locator('#book')).to_be_visible()
    tab.locator('#entry-form [name=title]').fill('Second tab')
    tab.locator('#entry-form [name=content]').fill('Concurrent update')
    tab.locator('#entry-form button').click()
    expect(page.locator('#locked')).to_be_visible()
    page.locator('#unlock').set_input_files(str(recovery))
    expect(page.locator('#entries')).to_contain_text('Concurrent update')
    page.set_viewport_size({'width':390,'height':844})
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
    page.screenshot(path=str(Path(tempfile.gettempdir())/'passport-mobile.png'),full_page=True)
    page.set_viewport_size({'width':1000,'height':1000})
    page.screenshot(path=str(Path(tempfile.gettempdir())/'passport-desktop.png'),full_page=True)
    assert not errors, errors
    assert all(method=='GET' and url.startswith('http://127.0.0.1:8765/') for method,url in requests),requests
    print('PASS: create, optional tags, answers, upload, ciphertext storage, exact release, stale-preview invalidation, lock/recovery, wrong-key rejection, backup restore, cross-tab conflict, mobile layout, no external requests')
    browser.close()
