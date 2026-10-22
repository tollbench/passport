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

The public contract suite has 41 passing Node tests. The fresh installed wheel
passed 13 Python server/CLI tests plus standalone, hosted, single-question and
batch/addon browser acceptance. The batch fixture uses only synthetic records and
opaque iframe traffic; it verifies exact selected answers/files, no draft/key
leakage, failed-save blocking, changed context, idempotent retry, lock/stale-save
invalidation and real pointer interactions on a 390px-wide viewport. CI runs the
batch fixture against installed package assets. Host authorization, actual
recipient delivery and proprietary goal behavior require host-side tests.

## a9 candidate: deterministic topic matching

49 Node tests and 13 installed-wheel Python tests pass. Fresh installed a9 assets
passed standalone, hosted, assigned-question, legacy batch/addon and new topic
browser fixtures. The new fixture runs in an opaque iframe at mobile and desktop
widths with synthetic person/pet/project records. It checks exact identity,
removal of untouched automatic answers, preservation and explicit reclassification
of human drafts, private encrypted saves, file-only material, failed-save blocking,
direct named-recipient Send and no pre-send answer/entity/key disclosure. Source
provenance must be visibly available before capture. Catalog JSON/module parity,
choice option equality, stale/conflicting records and repeated-save fact/version
behavior have focused Node coverage. These are functional boundary checks, not
independent security certification; host delivery and authorization remain separate.

## a10 candidate: selected item copies and local imports

64 Node tests and 13 installed-wheel Python tests pass. Installed-wheel browser
acceptance covers all five earlier flows plus the opaque item picker at mobile
width. Synthetic item tests check exact pinned versions/fields/files, private
upload preview, usable folder creation, no preapproval disclosure, failed-save
blocking, same-session encrypted save acknowledgement, idempotent grant retry,
private receipt and compact reference-only intent records. A canonical Unicode
manifest fixture is verified by JavaScript and Python. Import tests preserve
original versions and refuse changed-source overwrite of owner-enriched notes.
Host authorization/revocation/database concurrency and actual owner-flow use are
separate acceptance gates; public fixtures do not imply those are deployed.

## a11 candidate: hosted information library

64 Node tests and 13 installed-wheel Python tests pass. All seven installed-wheel
browser families pass: standalone, hosted storage/recovery, assigned question,
batch/fixed extension, deterministic topics, item picker, and the new information
library. The library fixture verifies real empty/recovery/locked/open/loading/error
states, including an absent initial host connection; create remains unavailable
on load failure. It exercises real-pointer upload/editor controls, title/tag
search, note/file/answer filters, compact item expansion, no fabricated content,
clearing of search/counts/plaintext on lock and scope change, and ciphertext-only
parent messages. Desktop and 390px mobile screenshots contain synthetic records.
Restoration remains a secondary expandable action on the new-book screen.

No crypto, encrypted schema or channel contract changes are included. Public
fixtures verify the fixed-panel contract; each host must verify its own actual
extensions and rollout. These results do not imply a hosted deployment, owner
data import, or independent security certification.
