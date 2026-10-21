# Verified standalone alpha release

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
