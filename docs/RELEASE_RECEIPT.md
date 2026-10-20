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
