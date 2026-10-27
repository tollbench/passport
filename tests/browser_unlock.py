"""Synthetic one-book unlock errors and retries, plus the older Business book moving in.

No owner files or providers. The host has no code door, so the recovery file is the way in;
browser_code_lock.py covers the code. PASSPORT_WEB_ROOT=<web dir> tests a source tree.
"""
import ast
import json
import os
from pathlib import Path
import subprocess
import tempfile
import threading
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from importlib.resources import files
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
ASSETS = Path(os.environ.get('PASSPORT_WEB_ROOT') or os.environ.get('PASSPORT_WEB') or str(files('toll_passport').joinpath('web')))
# Reuse the existing synthetic ciphertext host without running its acceptance flow.
source = ast.parse((ROOT / 'tests/browser_hosted.py').read_text())
HOST = ast.literal_eval(next(n.value for n in source.body if isinstance(n, ast.Assign) and any(isinstance(t, ast.Name) and t.id == 'HOST' for t in n.targets)))
# An older Business book (before one book) and an unrelated book, made with the real vault code.
MAKE = """import {createVault,exportRecovery,addEntry,sealVault} from 'VAULT';
const legacy=await createVault();
const doc=addEntry(legacy.document,{kind:'note',title:'BUSINESS_NOTE_CANARY',fields:{content:'From the older Business book'},tags:[],files:[]});
const other=await createVault();
console.log(JSON.stringify({business:{envelope:await sealVault(doc,legacy.key),etag:'legacy-etag'},
  businessRecovery:await exportRecovery(legacy.key,doc.vaultId),otherRecovery:await exportRecovery(other.key,other.document.vaultId)}));"""


class Handler(SimpleHTTPRequestHandler):
    def log_message(self, *args): pass

    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def do_GET(self):
        if self.path == '/host':
            body = HOST.encode()
            self.send_response(200)
            self.send_header('Content-Type', 'text/html')
            self.end_headers()
            self.wfile.write(body)
        else:
            super().do_GET()


fixture = json.loads(subprocess.check_output([os.environ.get('PASSPORT_NODE', 'node'), '--input-type=module', '-e',
                                              MAKE.replace('VAULT', (ASSETS / 'vault.mjs').as_uri())]))
with tempfile.TemporaryDirectory(prefix='passport-unlock-fixture-') as directory, ThreadingHTTPServer(('127.0.0.1', 0), partial(Handler, directory=str(ASSETS))) as server, sync_playwright() as playwright:
    threading.Thread(target=server.serve_forever, daemon=True).start()
    options = {'headless': True}
    if os.environ.get('PASSPORT_CHROME'):
        options['executable_path'] = os.environ['PASSPORT_CHROME']
    browser = playwright.chromium.launch(**options)
    context = browser.new_context(accept_downloads=True, viewport={'width': 390, 'height': 844})
    base = f'http://127.0.0.1:{server.server_port}'
    context.route('**/*', lambda route: route.continue_() if route.request.url.startswith(base + '/') else route.abort())
    page = context.new_page()
    page.set_default_timeout(10000)
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto(base + '/host')
    # The older Business book is already in storage when the one book is made.
    page.evaluate('value => localStorage.setItem("business", JSON.stringify(value))', fixture['business'])
    page.reload()
    f = page.frame_locator('#vault')
    expect(f.locator('#create')).to_be_enabled()
    assert f.locator('#vault-scope').is_hidden()  # one book, no switcher
    with page.expect_download() as download:
        f.locator('#create').click()
    assert download.value.suggested_filename == 'passport-recovery.json'
    key = Path(directory) / 'renamed-key.json'  # Renamed files prove validation is content-based, not filename-based.
    download.value.save_as(key)
    f.locator('#confirm-create').click()
    expect(f.locator('#book')).to_be_visible()
    expect(f.locator('#book-heading')).to_have_text('Your book')
    expect(f.locator('#legacy-merge')).to_be_visible()
    if f.locator('#book-tools').get_attribute('open') is None:
        f.locator('#book-tools > summary').focus()
        f.locator('#book-tools > summary').press('Enter')
    expect(f.locator('#book-tools')).to_have_attribute('open', '')
    with page.expect_download() as exported:
        f.locator('#recovery').click()
    assert exported.value.suggested_filename == 'passport-recovery.json'
    with page.expect_download() as exported:
        f.locator('#backup').click()
    assert exported.value.suggested_filename == 'passport-encrypted-backup.json'
    f.locator('#lock').click()
    expect(f.locator('#locked-heading')).to_have_text('Open your book with its recovery file.')
    saved = page.evaluate('[localStorage.getItem("personal"), localStorage.getItem("business")]')
    message_count = page.evaluate('receipts.length')

    def choose(value, control='#unlock', opener='.unlock-file'):
        expect(f.locator(control)).to_be_enabled()
        with page.expect_file_chooser() as chooser:
            f.locator(opener).click()
        chooser.value.set_files(value)

    def as_file(value, name):
        return {'name': name, 'mimeType': 'application/json', 'buffer': json.dumps(value).encode()}
    choose(as_file(fixture['otherRecovery'], 'other.json'))
    expect(f.locator('#status')).to_contain_text('belongs to a different book')
    expect(f.locator('#status')).to_contain_text('Your book is still locked')
    expect(f.locator('#unlock')).to_have_value('')
    expect(f.locator('#book')).to_be_hidden()
    # Same file can be selected again after failure; all attempts stay local.
    choose(as_file(fixture['otherRecovery'], 'other.json'))
    expect(f.locator('#unlock')).to_have_value('')
    choose({'name': 'invalid.json', 'mimeType': 'application/json', 'buffer': b'{broken'})
    expect(f.locator('#status')).to_contain_text('Choose a valid Passport recovery file')
    envelope = json.loads(saved[0])['envelope']
    choose(as_file(envelope, 'backup.json'))
    expect(f.locator('#status')).to_contain_text('This is an encrypted backup')
    # The older Business book's key cannot open the one book; it moves in after.
    choose(as_file(fixture['businessRecovery'], 'business.json'))
    expect(f.locator('#status')).to_contain_text('older Business book. Open your book first')
    wrong = json.loads(key.read_text())
    wrong['key'] = 'A' * 43 + '='
    choose(as_file(wrong, 'wrong-key.json'))
    expect(f.locator('#status')).to_contain_text('could not open your book')
    assert 'timed-out write' not in f.locator('#status').inner_text()
    status = f.locator('#status').inner_text()
    choose([])  # Browser cancellation/empty selection leaves state and feedback alone.
    expect(f.locator('#status')).to_have_text(status)
    assert page.evaluate('receipts.length') == message_count
    assert page.evaluate('[localStorage.getItem("personal"), localStorage.getItem("business")]') == saved
    choose(str(key))
    expect(f.locator('#book-heading')).to_have_text('Your book')
    expect(f.locator('#book')).to_be_visible()
    # Opening only asks the host whether a code door exists; nothing is written.
    extra = page.evaluate('receipts.slice(%d).map(q=>q.op||q.type)' % message_count)
    assert set(extra) <= {'code-status'}, extra
    # Move the Business book in: a wrong file changes nothing; the right one copies it with a Business label.
    expect(f.locator('#legacy-merge')).to_be_visible()
    choose(as_file(fixture['otherRecovery'], 'other.json'), '#legacy-recovery', '#legacy-merge .file-button')
    expect(f.locator('#status')).to_contain_text('not for your older Business book')
    assert page.evaluate('[localStorage.getItem("personal"), localStorage.getItem("business")]') == saved
    choose(as_file(fixture['businessRecovery'], 'business.json'), '#legacy-recovery', '#legacy-merge .file-button')
    expect(f.locator('#status')).to_contain_text('Your Business book moved in')
    expect(f.locator('#legacy-merge')).to_be_hidden()
    moved = f.locator('#entries .record').filter(has_text='BUSINESS_NOTE_CANARY')
    expect(moved).to_have_count(1)
    expect(moved.locator('.record-label')).to_have_text('Business')
    assert 'Business book moved in' not in f.locator('#entries').inner_text()  # the merge marker stays hidden
    after = page.evaluate('[localStorage.getItem("personal"), localStorage.getItem("business")]')
    assert after[1] == saved[1] and after[0] != saved[0]  # the old Business ciphertext is untouched
    # Lock and reopen: the move happens once.
    f.locator('#lock').click()
    choose(str(key))
    expect(f.locator('#legacy-merge')).to_be_hidden()
    expect(f.locator('#entries .record').filter(has_text='BUSINESS_NOTE_CANARY')).to_have_count(1)
    messages = json.dumps(page.evaluate('receipts'))
    for secret in [json.loads(key.read_text())['key'], fixture['businessRecovery']['key'], 'BUSINESS_NOTE_CANARY']:
        assert secret not in messages
    assert not any(q.get('op') in ('save', 'delete') and q.get('scope') != 'personal' for q in page.evaluate('receipts'))
    assert not errors, errors
    browser.close()
    server.shutdown()
print('PASS 390px one-book unlock: wrong-book/file/backup/key/legacy-key feedback; cancellation and same-file retry; '
      'the right key opens the book; the older Business book moves in once with a Business label, its ciphertext untouched; '
      'no unlock network/storage writes/key leakage')
