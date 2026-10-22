# Verified Passport releases

## 2026-10-22 — Explicit per-question audiences, 0.1.0a12

Source/tag: [`da9a1e2de27efa9b9d4e3abc489354091eb562ff`](https://github.com/tollbench/passport/commit/da9a1e2de27efa9b9d4e3abc489354091eb562ff), `v0.1.0a12`.

- [Exact-source CI](https://github.com/tollbench/passport/actions/runs/39815096618): both Python versions, 67 Node tests, 13 installed-wheel Python tests and all seven browser families passed.
- [Trusted Publishing](https://github.com/tollbench/passport/actions/runs/39816667281): build and publish succeeded through the existing tag-bound OIDC workflow.
- [PyPI release](https://pypi.org/project/toll-passport/0.1.0a12/) and [GitHub prerelease](https://github.com/tollbench/passport/releases/tag/v0.1.0a12).

Downloaded public wheel/sdist matched the reviewed local build and publication
workflow artifacts byte for byte. All 23 wheel runtime files and 61 source files
matched the tagged source; metadata, Steven Ochs and Tollbench attribution,
license/NOTICE and absence of runtime dependencies were checked separately.
Both PyPI integrity endpoints returned attestation bundles. A fresh isolated
installation of the downloaded public wheel passed all 13 Python tests. GitHub
release digests match the same wheel, sdist and SHA256SUMS.

| Artifact | SHA-256 |
| --- | --- |
| `toll_passport-0.1.0a12-py3-none-any.whl` | `3db6d3cdd7502a2d37f62a0ffbd19ae00cbb3aead3e3285d3962dafcb5cc4522` |
| `toll_passport-0.1.0a12.tar.gz` | `4fb5971a98f910f13b40f5fda540d4592829386046a0fb31de1817467579b3ab` |

The installed candidate wheel also passed the existing single-recipient batch
browser and a separate synthetic shared-audience host composition: private
save/reopen/local matching, removable topic, failed-save/cancel refusal and
explicit selected copies. Host membership and delivery policy are not included
in this public package. CI initially queued for hosted runners and its run summary
lagged completed jobs; both final run summaries now report success. No credentials,
owner data or private application code were read into or distributed by this
release. No site deployment occurred. Integration pin: `toll-passport==0.1.0a12`.

## 2026-10-21 — Hosted information library, 0.1.0a11

Source/tag: [`e22e7addae8738917053e28187dd999ab819d400`](https://github.com/tollbench/passport/commit/e22e7addae8738917053e28187dd999ab819d400), `v0.1.0a11`.

- [Exact-source CI](https://github.com/tollbench/passport/actions/runs/39716705638): passed Python 3.9/3.13, 64 Node tests, 13 installed-wheel Python tests and all seven installed-wheel browser families.
- [Trusted Publishing](https://github.com/tollbench/passport/actions/runs/39717175928): succeeded through the existing tag-bound publisher.
- [PyPI release](https://pypi.org/project/toll-passport/0.1.0a11/) and [GitHub prerelease](https://github.com/tollbench/passport/releases/tag/v0.1.0a11).

Downloaded public PyPI wheel and sdist matched the reviewed local build and
publication-workflow artifacts byte for byte. All 23 packaged runtime files
matched the tag; all 61 non-generated source-distribution files matched tagged
source. Version, Steven Ochs and Tollbench attribution, Apache-2.0 metadata/NOTICE
and absence of runtime dependencies were verified. A fresh isolated installation
of the downloaded public wheel passed all 13 Python tests and matched all runtime
files. GitHub prerelease asset digests match the same wheel, sdist and SHA256SUMS.

| Artifact | SHA-256 |
| --- | --- |
| `toll_passport-0.1.0a11-py3-none-any.whl` | `d3962b440e0f0f188811b30b12d6be1b23899a7006fa36b3e7afce3bc20d76d4` |
| `toll_passport-0.1.0a11.tar.gz` | `27eed897eba5ce59bf689acfc2295d2585e2490104efb3d4ce08921efd4c02a5` |

The hosted library now separates new-book setup, existing-book recovery, loading
and errors, then shows actual notes, files and saved answers after unlock. Local
title/tag search and stored-kind filters make the information browsable. No AI
classification, automatic imports, new runtime modules, crypto changes, schema
changes or expanded disclosure authority are included. The private host's actual
feed/book/question and fixed goal-panel composition also passed synthetic browser
checks against the same final wheel before publication. Those private features
are not distributed in this package.

Publication does not imply deployment, owner-data import or independent security
certification. The reviewed integration pin is `toll-passport==0.1.0a11`; installing
it remains a separately coordinated host operation. No owner recovery keys or publishing
credentials were read or changed. Previous releases remain immutable.

## 2026-10-21 — Selected item copies and repeat-safe imports, 0.1.0a10

Source/tag: [`f89d48a70a3f9935a4e87c042ef80bc0d4e6f7dc`](https://github.com/tollbench/passport/commit/f89d48a70a3f9935a4e87c042ef80bc0d4e6f7dc), `v0.1.0a10`.

- [Exact-source CI](https://github.com/tollbench/passport/actions/runs/39693640778): passed both Python versions, 64 Node tests, 13 installed-wheel Python tests and all six installed-wheel browser families.
- [Trusted Publishing](https://github.com/tollbench/passport/actions/runs/39694851821): succeeded through the existing tag-bound publisher; public PyPI provenance records contain an attestation bundle for each artifact.
- [PyPI release](https://pypi.org/project/toll-passport/0.1.0a10/) and [GitHub prerelease](https://github.com/tollbench/passport/releases/tag/v0.1.0a10).

Downloaded wheel and sdist from public PyPI matched the reviewed local build and publication-workflow artifacts byte for byte. All 23 packaged runtime files matched the tagged source, and all source-distribution files matched the source (generated package metadata checked separately). Version, Steven Ochs and Tollbench attribution, Apache-2.0 license/NOTICE and absence of runtime dependencies were verified. A fresh isolated installation of the downloaded public wheel passed all 13 Python tests and matched every runtime file. GitHub asset digests match the same wheel, sdist and SHA256SUMS.

| Artifact | SHA-256 |
| --- | --- |
| `toll_passport-0.1.0a10-py3-none-any.whl` | `bb4ca2ac93d2762d58f32a3960c0b42f665630167ba6ae7dd395b247c58e65b0` |
| `toll_passport-0.1.0a10.tar.gz` | `04f6cc315a41c3119a0e58ad4570574ca4b20ad2a0dc2b2d06a1c5848c210c88` |

The version-specific JSON endpoint briefly returned 404 during propagation. Verification used public project JSON that explicitly identified version `0.1.0a10`, its two exact artifacts and expected hashes. No publishing credentials were read or changed and no new authority was granted.

This generic release adds the owner-approved item picker/channel and repeat-safe local import primitives described in ITEM_SHARING.md. Host authentication, grant storage, agent reads, revocation and quotas remain host duties. Tollbench's private flow builder, goals, contacts and marketplace are not distributed. No staging or production application deployment occurred in this release task. The exact integration pin is `toll-passport==0.1.0a10`; installation is a separate reviewed operation.

## Historical standalone release 0.1.0a2

Version: **0.1.0a2**. Source commit: `672490026ec5d8cffba4d16f005a62e891ad349a`.

- Public repository: https://github.com/tollbench/passport
- GitHub release: https://github.com/tollbench/passport/releases/tag/v0.1.0a2
- PyPI: https://pypi.org/project/toll-passport/0.1.0a2/
- Successful CI: https://github.com/tollbench/passport/actions/runs/39510066603
- Successful Trusted Publishing: https://github.com/tollbench/passport/actions/runs/39510207353

Verified wheel and sdist hashes against PyPI's public version metadata and the CI build artifact. Verified wheel runtime bytes against the tagged source and the presence of license/attribution files. Fresh installation directly from PyPI reported version 0.1.0a2 and passed all 12 Python tests. CI passed 11 vault core tests, 12 Python tests and browser acceptance on the supported matrix. The workflow generated publication attestations.

Private vulnerability reporting is enabled. Publishing is tied to the registered repository, workflow and version-tag environment. No private application code, customer data or credential files are distributed. No Toll Bench integration or deployment occurred.

0.1.0a1 remains an immutable earlier GitHub prerelease; it was not published to PyPI. Its publishing-tool error was corrected in 0.1.0a2. Runtime behavior is unchanged between those alphas.

This receipt records the standalone local reference milestone, not completion of the hosted vault roadmap or independent security certification. See SECURITY.md and BOUNDARY.md for the remaining integration gates.

## 2026-10-20 — Attribution release 0.1.0a3

Version: **0.1.0a3**. Source commit: `613eeb323ec9c2b0e3b969c0bc884cf64dc0477d`. Ownership attribution is **Steven Ochs and Tollbench**. This release corrects metadata, notices, citation, browser UI and source headers; runtime behavior is unchanged from 0.1.0a2.

- GitHub prerelease: https://github.com/tollbench/passport/releases/tag/v0.1.0a3
- PyPI: https://pypi.org/project/toll-passport/0.1.0a3/
- Successful CI: https://github.com/tollbench/passport/actions/runs/39511950885
- Successful Trusted Publishing: https://github.com/tollbench/passport/actions/runs/39512130971

CI passed the Python 3.9/3.13 matrix, vault core tests, installed-package tests and Chromium browser acceptance. The publication workflow tested and built the tagged source, published both files successfully and generated attestations. Downloaded publication artifacts matched PyPI's public version metadata and the GitHub prerelease asset digests:

| Artifact | SHA-256 |
| --- | --- |
| `toll_passport-0.1.0a3-py3-none-any.whl` | `7724777a8cb71887e76475d5a4046a733a7dedbdf53c3cb8c8bfa39b8131ec6a` |
| `toll_passport-0.1.0a3.tar.gz` | `d2c908dee386cfc7f7ea80053d53a82dfd92869eb16e31802217e143a41b5e01` |

Verified the wheel author, NOTICE and browser attribution, absence of the incorrect ownership name in those assets, and exact runtime bytes against tagged source. A fresh download of the public PyPI wheel matched the CI artifact, installed in an isolated environment and reported `toll-passport 0.1.0a3`. GitHub prerelease includes those artifacts and SHA256SUMS. Previous tags, releases and this historical receipt remain intact.

The hyphenated PyPI version endpoint temporarily returned HTTP 503 and project metadata was stale. Verification succeeded through the equivalent normalized version endpoint, https://pypi.org/pypi/toll_passport/0.1.0a3/json . No credentials were handled. No application deployment occurred in this release task; integration work proceeds separately under its own authorization.

## 2026-10-20 — Saved-answer release 0.1.0a4

Version: **0.1.0a4**. Source commit: `3984aec6ac89d58ddd979ff24cc072def05d32b0`. Ownership: **Steven Ochs and Tollbench**.

- GitHub prerelease: https://github.com/tollbench/passport/releases/tag/v0.1.0a4
- PyPI: https://pypi.org/project/toll-passport/0.1.0a4/
- Successful CI: https://github.com/tollbench/passport/actions/runs/39512987235
- Successful Trusted Publishing: https://github.com/tollbench/passport/actions/runs/39513212379

This local alpha adds saved-answer candidates with exact subject/task matching, explicit reusable scope, provenance and age/ambiguity review, and explicit form filling. Blank task references remain valid for saving, with a visible explanation that they cannot support automatic suggestions. Sharing remains a separate selection. Automatic agent question intake and hosted/site integration are outside this release.

Coordinator and independent review passed after the optional-reference hint correction. CI passed both Python 3.9/3.13 jobs, including 18 Node tests, 13 Python tests, five packaged browser assets and Chromium acceptance. The publication workflow passed and generated attestations. Public PyPI hashes matched the CI artifact and GitHub prerelease asset digests:

| Artifact | SHA-256 |
| --- | --- |
| `toll_passport-0.1.0a4-py3-none-any.whl` | `9b090d7a04dab3458cb56cab8832cbc97806f674d5e54f39a753f98475cd231b` |
| `toll_passport-0.1.0a4.tar.gz` | `cca81114970798249748ed54374d22bd062be7c7e16f4e2282ff7104926c4cd6` |

Verified public version/author metadata, the new answers.mjs asset, ownership notice and all wheel runtime bytes against tagged source. A fresh public PyPI wheel download matched CI byte for byte, installed in an isolated environment and reported `toll-passport 0.1.0a4`. Full suites were not repeated after CI. GitHub prerelease contains the identical wheel, sdist and SHA256SUMS. Older releases and receipts remain intact. No production or staging application writes occurred.

## 2026-10-20 — Hosted client release 0.1.0a5

Version: **0.1.0a5**. Source commit: `dc1da7be766932c175ab43c107e65b438df6feea`. Ownership: **Steven Ochs and Tollbench**.

- GitHub prerelease: https://github.com/tollbench/passport/releases/tag/v0.1.0a5
- PyPI: https://pypi.org/project/toll-passport/0.1.0a5/
- Successful CI: https://github.com/tollbench/passport/actions/runs/39521985931
- Successful Trusted Publishing: https://github.com/tollbench/passport/actions/runs/39522175399

The separate hosted entry point uses the unchanged public vault cryptography and saved-answer modules. An opaque sandbox keeps unlocked information within the client. Its strictly validated bridge handles only encrypted v1 snapshots and storage metadata, with parent source/origin checks, nonce/capability initialization, correlated replies and expected ETags. Recovery download acknowledgement precedes creation. The client supports notes, files, answers, explicit reuse, export/restore/removal, and separate account-owned personal/business scopes. Save failures/conflicts retain form input without reporting success. Business team key sharing, automatic agent intake and independent security certification are not included; host authorization and storage responsibilities are documented in HOSTED.md.

Coordinator review approved the scoped public source before publication. CI passed Python 3.9 and 3.13, 21 Node tests, 13 Python server tests, all eight packaged assets, and both standalone and hosted Chromium acceptance. Local hosted acceptance also verified actual opaque-frame isolation, recovery-before-persistence, encrypted storage/messages, failure/conflict and scope behavior, tampered ciphertext and wrong-key rejection, CSP network blocking and mobile layout. Tests used synthetic data and no paid model/provider calls.

The tag-bound publication workflow passed. Downloaded public PyPI wheel and sdist matched the CI artifacts byte for byte and the public version metadata hashes. GitHub prerelease asset digests agree:

| Artifact | SHA-256 |
| --- | --- |
| `toll_passport-0.1.0a5-py3-none-any.whl` | `ceddeae445006516c67aff5814e63421b275513e515c23fa8037dac4fb8630bc` |
| `toll_passport-0.1.0a5.tar.gz` | `34984a91703a98c8dd8a3a64089c678cd2241ee0c8b3e6b8cc630602ea510e12` |

Verified all wheel/sdist runtime bytes against the reviewed source, including hosted assets, author metadata and NOTICE. A fresh isolated installation of the exact wheel downloaded from public PyPI reported `toll-passport 0.1.0a5`; every installed runtime file matched the reviewed source. Full suites were not repeated after CI. GitHub prerelease contains the verified wheel, sdist and SHA256SUMS. Earlier versions, tags and receipts remain intact. No private application source, credential files or real user data are included. No staging or production application deployment occurred in this release task.

## 0.1.0a6 — hosted book experience

- Canonical source/tag: [`0987eee`](https://github.com/tollbench/passport/commit/0987eee017dda543c010dbee73c5bb42fef202d5), `v0.1.0a6`.
- [CI verification](https://github.com/tollbench/passport/actions/runs/39533895595) passed Python 3.9 and 3.13, Node tests, built-wheel tests, and standalone plus hosted Chromium acceptance.
- [Trusted Publishing](https://github.com/tollbench/passport/actions/runs/39534034369) passed and generated publication attestations.
- [PyPI version](https://pypi.org/project/toll-passport/0.1.0a6/) and [GitHub prerelease](https://github.com/tollbench/passport/releases/tag/v0.1.0a6).

Downloaded public wheel and sdist matched the CI publication artifacts byte for byte and public PyPI SHA256 metadata. Every packaged runtime file matched the exact tagged source; license and version metadata were checked. A fresh isolated installation of the public wheel reported 0.1.0a6. GitHub release asset digests match:

| File | SHA256 |
| --- | --- |
| `toll_passport-0.1.0a6-py3-none-any.whl` | `7f80f8f9adaeaeaff86bdecf5b6f3e0515fea63254144a26605367e08e735b02` |
| `toll_passport-0.1.0a6.tar.gz` | `fd0e0edae359c81bb4daca3d80c6b3e07f6e6a9968a6ebe85fd385d832a75431` |

The hosted book emphasizes personal/business information and exposes chapter navigation, with create/unlock/restore focus and secondary recovery/export controls. Core encryption, document format, transport and answer matching remain unchanged. No private application code, user content or credentials were published. This receipt does not claim a live application deployment or independent security audit.

## 0.1.0a7 — explicit hosted question answer release

- Canonical source/tag: [`29eab7c`](https://github.com/tollbench/passport/commit/29eab7c8012a708b838b525041229fc0a9476f89), `v0.1.0a7`.
- [Required CI](https://github.com/tollbench/passport/actions/runs/39539659382) passed Python 3.9 and 3.13, 30 Node tests, 13 Python tests and standalone/hosted/question Chromium acceptance against the installed wheel.
- [Trusted Publishing](https://github.com/tollbench/passport/actions/runs/39539807921) succeeded.
- [PyPI version](https://pypi.org/project/toll-passport/0.1.0a7/) and [GitHub prerelease](https://github.com/tollbench/passport/releases/tag/v0.1.0a7).

Downloaded public wheel/sdist match publication CI artifacts byte for byte and
PyPI SHA256 metadata. Every wheel runtime file and sdist source file matches the
exact tag (generated PKG-INFO checked as package metadata). Attribution, version
and Apache-2.0 metadata verified. Fresh isolated installation of the downloaded
public wheel reports `toll-passport 0.1.0a7`; all installed runtime bytes match the
tag. GitHub prerelease contains those same artifacts and SHA256SUMS.

| Artifact | SHA256 |
| --- | --- |
| `toll_passport-0.1.0a7-py3-none-any.whl` | `92808c84831f4c65d27e1883f6f4c82f064b96b5d121526d324b6c99093b9d11` |
| `toll_passport-0.1.0a7.tar.gz` | `1517a0e6ab83ed262fc296b4ffcea099ef3386bfa2b8e4a708fbb86671ff458f` |

Initial CI39539463195 caught an existing recovery-upload fixture race: a file was
injected during disabled asynchronous reload. The test now waits for enabled
input; assertions and runtime code were not relaxed. No tag or publication used
the failed run. Corrected-source CI passed before tagging and publication.

The optional channel releases one explicitly approved saved answer to a
host-bound question/recipient, separately from unchanged ciphertext storage.
See QUESTION_CHANNEL.md for the host's authorization and idempotency duties.
Tests used synthetic data and no paid model/provider calls. No private application
code, real owner content or credentials were published. Publication is not a
staging/production deployment or independent security certification.

## 2026-10-21 — 0.1.0a8 batch answers and trusted panels

- Tagged source: `c736a1be1a7d75273a7563529fd361c17e99696b`, `v0.1.0a8`.
- [CI 39660490761](https://github.com/tollbench/passport/actions/runs/39660490761): success on Python 3.9/3.13, 41 Node tests, 13 Python tests, installed-wheel standalone/hosted/single-question/batch browser gates.
- [Trusted publication 39660841914](https://github.com/tollbench/passport/actions/runs/39660841914): build and publish succeeded using the existing PyPI environment and publisher.
- [PyPI 0.1.0a8](https://pypi.org/project/toll-passport/0.1.0a8/) and [GitHub prerelease](https://github.com/tollbench/passport/releases/tag/v0.1.0a8) verified.

| Artifact | SHA-256 |
| --- | --- |
| toll_passport-0.1.0a8-py3-none-any.whl | `c8ac355f834718b76bedcd46a2ea402d9bbe2977b696e9bb76893effc4e3a7c0` |
| toll_passport-0.1.0a8.tar.gz | `1708915bd8908ab6b4cb82f8aa2fabb1363524cd1e1cc1cc452cce750cb4387b` |

Downloaded public artifacts matched the publication workflow artifacts and PyPI
SHA-256 metadata. Runtime bytes in both distributions matched the tagged source;
metadata/NOTICE attribute Steven Ochs and Tollbench and declare no runtime
dependencies. Fresh installation of the downloaded public wheel reported
`toll-passport 0.1.0a8` and passed all 13 loopback server/CLI tests. GitHub release
asset digests match the same files. No application deployment, credential changes,
private data import or live provider calls were part of this release.

## 2026-10-21 — 0.1.0a9 deterministic topic matching

- Tagged source: `1fdd8a04de54523ee37b320ebd2a4948e8f5440f`, `v0.1.0a9`.
- [CI 39684266824](https://github.com/tollbench/passport/actions/runs/39684266824): success on Python 3.9/3.13, 49 Node tests, 13 Python tests and all five installed-wheel browser flows.
- [Trusted publication 39684517196](https://github.com/tollbench/passport/actions/runs/39684517196): success using the existing publisher/environment.
- [PyPI 0.1.0a9](https://pypi.org/project/toll-passport/0.1.0a9/) and [GitHub prerelease](https://github.com/tollbench/passport/releases/tag/v0.1.0a9).

| Artifact | SHA-256 |
| --- | --- |
| toll_passport-0.1.0a9-py3-none-any.whl | `d195d0aed6201af22e4fea675430884f1f1b358e0ac556c3e290c3ff15136281` |
| toll_passport-0.1.0a9.tar.gz | `50322183db4ce9ec20e95d492264567d3e97ca51c810606de1ec59220f8d08d4` |

Public artifacts match PyPI metadata, publication CI artifacts and tagged runtime
bytes. Canonical eleven-descriptor JSON, version, Steven Ochs/Tollbench attribution,
Apache-2.0 and absence of runtime dependencies were verified. Fresh isolated public
wheel installation reports a9 and passes all 13 server/CLI tests. GitHub release
asset digests match these same artifacts and their SHA256SUMS file.

Initial CI39683932265 caught a browser-fixture synchronization race: a repeated
save assertion matched an earlier success message. The corrected fixture waits
for actual document revision advancement without weakening classification checks.
Parent also requested an accurate pending/failed private-save status; the final
source includes that narrow fix and verifies failed second-save draft retention
with persisted document unchanged. No failed source was tagged or published.

Synthetic opaque browser tests establish the tested functional boundaries, not
independent security certification or live owner acceptance. No private data,
provider calls, new publishing permissions or staging/production changes were
part of this release. Hosts must follow the asset-first compatibility sequence in
TOPIC_MATCHING.md before enabling new matching contexts.
