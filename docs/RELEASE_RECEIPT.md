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
