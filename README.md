# Passport

**Your information. Your choice of what to share.**

Passport is an independent, open-source personal-information vault from Toll Bench. This first alpha runs locally, encrypts information in your browser, and lets you export selected information as a separately encrypted package. No Toll Bench account, AI provider, telemetry or cloud storage is used.

**Status: 0.1.0a1, standalone reference alpha. Not independently security-audited.** This is a local foundation, not a hosted multi-user vault. Use sample information while evaluating it. Toll Bench integration is intentionally not included.

## Run it

Python 3.9 or later and a current browser with Web Crypto and IndexedDB are required. From a source checkout:

```sh
python3 -m venv .venv
. .venv/bin/activate
python -m pip install .
toll-passport serve
```

Open **http://127.0.0.1:8765**. Keep that exact address and port: browser storage is scoped to its origin. A different port or `localhost` is a different storage location. Install a released wheel with `python -m pip install path/to/toll_passport-0.1.0a1-py3-none-any.whl`. A GitHub release does not imply availability on PyPI; check the release notes.

## What works

- Create a vault with an automatically generated encryption key.
- Save notes, structured answers, optional labels and multiple files locally.
- Encrypt titles, tags, filenames and contents before writing browser storage.
- Lock and unlock using a separate recovery file.
- Export an encrypted backup and restore it into another browser.
- Select exact fields from an exact record version; preview and export an independently encrypted sharing package.
- Open a received sharing package locally and save it in your vault.
- Remove records or remove the local vault; existing exported copies remain.

The contact information itself can be stored as information. CRM workflows, contact lists, goals, action packs, recurrence, agent dispatch, marketplace payments and reputation belong to Toll Bench and are outside this project.

## Recovery and storage

Creation automatically requests a **recovery-file download**. Store that file securely, separately from your encrypted backups. It contains the key that unlocks the entire vault. Export a new encrypted backup after changes. **Recovery requires both the backup and recovery file if browser storage is lost.** No operator can reset a lost key. Browser storage can be cleared, evicted or unavailable; it is not a backup.

The unlocked key is kept in page memory, not IndexedDB, localStorage or the Python server. Refreshing, closing or locking the page requires the recovery file again. A compromised device or browser extension may read unlocked information. This alpha has no passkeys, OS keychain integration, password protection or multi-device synchronization.

Files are limited to 25 MiB each; the encrypted snapshot is limited to 100 MiB. Base64 encoding, metadata and versions consume some of that space. The local server only serves four static assets on loopback and accepts no uploads. It is not a remote deployment server.

## Sharing

Only explicitly selected fields are copied into a release. The original vault key is never used as the sharing key. Download the encrypted package and its separate package key, then deliver them through appropriate separate channels. Passport itself sends nothing.

The recipient and purpose are authenticated package metadata, **not verified recipient identity or access control**. Anyone possessing the package and key can decrypt it. Downloads cannot be recalled, revoked or made to expire. Hosted grants, verified recipient keys and delivery authorization are later work, documented in [the integration boundary](docs/BOUNDARY.md).

## Optional question labels

A question-producing application may suggest a stable key, subject and scope. The reference UI accepts optional labels including unfamiliar ones. Missing labels never prevent saving, fail an agent or affect a score. Answers remain private until selected for release. [Question metadata contract](docs/QUESTION_LABELS.md).

## Development

Runtime code has no third-party package dependencies: Python standard library and browser Web Crypto only. No third-party JavaScript or fonts are loaded.

```sh
python -m pip install build twine
python -m build
python -m twine check dist/*
python -m pip install dist/*.whl
python -m unittest discover -s tests -p 'test_*.py' -v
node --test tests/*.test.mjs
```

Node 22 is used for core tests. Browser checks use Playwright as a development-only dependency; see [verification](docs/VERIFICATION.md). CI tests and builds the distributable. Publishing is a separate manual, tag-bound workflow with PyPI Trusted Publishing; it requires account-side setup described in [releasing](docs/RELEASING.md).

## Ownership and attribution

Copyright 2026 **Steven Ochs and The Book of Houses**. Created for [Toll Bench](https://tollbench.com). Licensed under [Apache-2.0](LICENSE); preserve [NOTICE](NOTICE) with redistributions as applicable. This license applies to Passport's included source, not the private Toll Bench application or its trademarks. See [third-party notices](THIRD_PARTY_NOTICES.md) and [citation metadata](CITATION.cff).

This is newly authored Passport code. No Ente, Bitwarden or proprietary Toll Bench implementation was copied. Cryptographic primitives are supplied by Web Crypto; this is not a new encryption algorithm. See [security](SECURITY.md) and [format](docs/FORMAT.md) before extending the reference implementation.
