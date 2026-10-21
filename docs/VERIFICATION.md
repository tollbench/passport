# Verification

Initial local verification used synthetic data, Python 3.9, Node's built-in test runner and headless Chromium. No live agents, model providers, customer records or paid calls are involved.

- 11 core tests: authenticated encryption, fresh randomness, wrong keys/tampering, strict malformed imports, immutable versions, deletion, optional tags, exact selection, independent release keys, quotas and AES-256 enforcement.
- 12 Python tests: CLI, loopback binding, static allowlist, traversal rejection, Host validation, no write endpoints and security headers.
- Browser acceptance: create, answer without a label, unfamiliar label, file upload, ciphertext-only persistence, exact-field release, stale-preview invalidation, wrong-key rejection, lock/unlock, backup restore, cross-tab change handling, mobile width and absence of external requests.

Run the core/server tests using README instructions. For browser checks, install the wheel, then:

```sh
python -m pip install playwright
python -m playwright install chromium
toll-passport serve
# In a second terminal:
python tests/browser_smoke.py
```

Set `PASSPORT_CHROME` to an existing Chrome executable if needed. Browser checks create isolated contexts and temporary synthetic exports. Screenshots are written to the OS temporary directory. These checks do not establish independent security certification, OS/browser compromise resistance or hosted-service readiness.

Review caught and corrected stale share downloads after selection changes, stale plaintext previews across vault restoration, and received-field collisions with provenance names. Browser regression checks cover preview invalidation and restoration. Future hosted integration needs its own security review and acceptance evidence.

## a8 candidate: batch disclosure and fixed panels

The public contract suite has 40 passing Node tests. The fresh installed wheel
passed 13 Python server/CLI tests plus standalone, hosted, single-question and
batch/addon browser acceptance. The batch fixture uses only synthetic records and
opaque iframe traffic; it verifies exact selected answers/files, no draft/key
leakage, failed-save blocking, changed context, idempotent retry, lock/stale-save
invalidation and real pointer interactions on a 390px-wide viewport. CI runs the
batch fixture against installed package assets. Host authorization, actual
recipient delivery and proprietary goal behavior require host-side tests.
