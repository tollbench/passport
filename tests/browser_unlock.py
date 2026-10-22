"""Synthetic Personal/Business unlock errors and retries; no owner files or providers."""
import ast
import json
import os
from pathlib import Path
import tempfile
import threading
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from importlib.resources import files
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
ASSETS = Path(str(files('toll_passport').joinpath('web')))
# Reuse the existing synthetic ciphertext host without running its acceptance flow.
source = ast.parse((ROOT / 'tests/browser_hosted.py').read_text())
HOST = ast.literal_eval(next(n.value for n in source.body if isinstance(n, ast.Assign) and any(isinstance(t, ast.Name) and t.id == 'HOST' for t in n.targets)))

class Handler(SimpleHTTPRequestHandler):
    def log_message(self, *args): pass
    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()
    def do_GET(self):
        if self.path == '/host?scope=personal':
            body = HOST.encode()
            self.send_response(200)
            self.send_header('Content-Type', 'text/html')
            self.end_headers()
            self.wfile.write(body)
        else:
            super().do_GET()

with tempfile.TemporaryDirectory(prefix='passport-unlock-fixture-') as directory, ThreadingHTTPServer(('127.0.0.1', 0), partial(Handler, directory=str(ASSETS))) as server, sync_playwright() as playwright:
    threading.Thread(target=server.serve_forever, daemon=True).start()
    options = {'headless': True}
    if os.environ.get('PASSPORT_CHROME'):
        options['executable_path'] = os.environ['PASSPORT_CHROME']
    browser = playwright.chromium.launch(**options)
    context = browser.new_context(accept_downloads=True, viewport={'width':390, 'height':844})
    base = f'http://127.0.0.1:{server.server_port}'
    context.route('**/*', lambda route: route.continue_() if route.request.url.startswith(base + '/') else route.abort())
    page = context.new_page()
    page.set_default_timeout(10000)
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto(base + '/host?scope=personal')
    f = page.frame_locator('#vault')
    keys = {}
    for scope in ('personal', 'business'):
        if scope == 'business':
            f.locator('#vault-scope').select_option(scope)
            f.locator('dialog').get_by_role('button', name='Continue', exact=True).click()
        expect(f.locator('#create')).to_be_enabled()
        with page.expect_download() as download:
            f.locator('#create').click()
        path = Path(directory) / (scope + '.json')
        download.value.save_as(path)
        keys[scope] = path
        f.locator('#confirm-create').click()
        expect(f.locator('#book')).to_be_visible()
    f.locator('#lock').click()
    expect(f.locator('#locked-heading')).to_have_text('Your Business book is locked.')
    assert page.url.endswith('?scope=personal')
    saved = page.evaluate('[localStorage.getItem("personal"), localStorage.getItem("business")]')
    message_count = page.evaluate('receipts.length')
    def choose(value):
        expect(f.locator('#unlock')).to_be_enabled()
        with page.expect_file_chooser() as chooser:
            f.locator('.unlock-file').click()
        chooser.value.set_files(value)
    choose(str(keys['personal']))
    expect(f.locator('#status')).to_contain_text('belongs to a different book')
    expect(f.locator('#status')).to_contain_text('Business book is still locked')
    expect(f.locator('#unlock')).to_have_value('')
    expect(f.locator('#book')).to_be_hidden()
    # Same filename can be selected again after failure; all attempts stay local.
    choose(str(keys['personal']))
    expect(f.locator('#unlock')).to_have_value('')
    choose({'name':'invalid.json','mimeType':'application/json','buffer':b'{broken'})
    expect(f.locator('#status')).to_contain_text('Choose a valid Passport recovery file')
    envelope = json.loads(saved[1])['envelope']
    choose({'name':'backup.json','mimeType':'application/json','buffer':json.dumps(envelope).encode()})
    expect(f.locator('#status')).to_contain_text('This is an encrypted backup')
    wrong = json.loads(keys['business'].read_text())
    wrong['key'] = 'A' * 43 + '='
    choose({'name':'wrong-key.json','mimeType':'application/json','buffer':json.dumps(wrong).encode()})
    expect(f.locator('#status')).to_contain_text('could not open your Business book')
    assert 'timed-out write' not in f.locator('#status').inner_text()
    status = f.locator('#status').inner_text()
    choose([])  # Browser cancellation/empty selection leaves state and feedback alone.
    expect(f.locator('#status')).to_have_text(status)
    assert page.evaluate('receipts.length') == message_count
    assert page.evaluate('[localStorage.getItem("personal"), localStorage.getItem("business")]') == saved
    choose(str(keys['business']))
    expect(f.locator('#book-heading')).to_have_text('Your business book')
    expect(f.locator('#book')).to_be_visible()
    assert page.evaluate('receipts.length') == message_count
    f.locator('#vault-scope').select_option('personal')
    f.locator('dialog').get_by_role('button', name='Continue', exact=True).click()
    expect(f.locator('#locked-heading')).to_have_text('Your Personal book is locked.')
    choose(str(keys['personal']))
    expect(f.locator('#book-heading')).to_have_text('Your personal book')
    messages = json.dumps(page.evaluate('receipts'))
    assert all(json.loads(path.read_text())['key'] not in messages for path in keys.values())
    assert page.evaluate('[localStorage.getItem("personal"), localStorage.getItem("business")]') == saved
    assert not errors, errors
    browser.close()
    server.shutdown()
print('PASS 390px unlock: outer Personal/inner Business scope; wrong-book/file/backup/key feedback; cancellation and same-file retry; correct keys open both books; no unlock network/storage writes/key leakage')
