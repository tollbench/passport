# Passport build workflow

## Standalone alpha foundation

Requested outcome: an independently usable, correctly attributed open-source Passport piece, delivered before Toll Bench integration. Public boundary: private information, encryption/recovery, portability and explicit sharing. CRM/list workflows, goals/action packs and marketplace implementation remain outside this repository.

Owner: coordinating development agent. Workers: passport_crypto implemented the browser vault core and 11 tests; passport_package implemented packaging, loopback-only server, CI and 12 tests; passport_review reviewed security and correctness; passport_pypi_setup checked publishing access. No Factory routing or live model calls by the test suite. No token-savings claim.

Implementation: newly authored browser code using Web Crypto and IndexedDB plus a Python standard-library static launcher. Chose a whole-snapshot alpha format and explicit recovery files. Documented bearer-key handling, absent remote identity/revocation, browser-loss risks and later hosted integration gates. No private application source copied. Apache-2.0 and attribution follow the existing public Toll Harness convention.

Review found stale sharing downloads after changed selections, stale preview state across restored vaults and incoming field collisions with provenance. Corrected all three. Browser regression checks include asynchronous selection changes and preserved imported values.

Verification: 11 core tests and 12 server/CLI tests passed locally. Synthetic browser acceptance passed for create, save, file upload, exact sharing, recovery, restore, cross-tab updates, mobile width and absence of external requests. Wheel/sdist are built with attribution inventory and metadata checks. Public CI provides an additional platform receipt. Tests do not constitute independent security certification.

Publishing: public repository/release setup is authorized. PyPI requires a new Trusted Publisher binding; the available browser was not signed in. No credentials were read or copied, and no other project's publisher was changed. Account-side setup remains a distinct gate. Toll Bench integration, deployment, customer migration and cloud provisioning are not performed in this milestone.

Public CI exposed a build-tool compatibility issue: newer Hatchling produced metadata 2.5 that the selected Twine 6 validator rejects. Pinned Hatchling 1.27.0 for a consistent supported metadata format across Python versions; rerun CI before release. No runtime dependency was added.

Linux browser CI exposed overlapping file-selection events: a second import could be ignored while the first file was reading. Disabled file inputs during active operations, invalidated received previews on new selections and made browser checks wait for each documented file-ready state before continuing. Reverify on CI before release.

Standalone CI passed on Python 3.9/3.13 with Chromium browser acceptance at a63a78c. Published GitHub alpha 0.1.0a1 and verified downloaded release checksums. User registered the PyPI Trusted Publisher after action-time confirmation; worker verified its exact project/repository/workflow/environment. Initial publish built successfully but the publishing action container was unavailable for the pinned annotated tag object. Corrected to the peeled commit of official v1.14.3 and advanced to 0.1.0a2 without changing the published 0.1.0a1 tag. Runtime behavior unchanged. Re-run publication and verify actual PyPI files before reporting completion.

Completed standalone release: 0.1.0a2 at source 6724900 passed CI 39510066603 and Trusted Publishing 39510207353. Public PyPI wheel/sdist hashes matched the CI artifact; wheel runtime bytes matched source. Fresh installation directly from PyPI succeeded and all 12 installed-package tests passed. GitHub prerelease contains the identical artifacts and SHA256SUMS. Private vulnerability reporting and tag-only pypi environment verified. User completed publisher registration personally; no password or API token was handled. Release receipt saved in docs/RELEASE_RECEIPT.md. Integration stops here pending user review.

## 2026-10-20 — Owner attribution correction

Steven corrected speech transcription: use **Steven Ochs and Tollbench** for Passport attribution. Applied to notices, citation, package metadata, UI and source headers. Preparing 0.1.0a3 because published artifacts are immutable; runtime behavior unchanged. Existing canonical release workflow will verify the new package. Jev is retired; this correction is executed directly. Hosted integration planning continues separately, with read-only staging audit and local review workers.

Attribution release validation: initial isolated build was blocked by sandbox network resolution; an offline attempt lacked Hatchling. Retried the normal pinned build with network permission successfully. Wheel and sdist built; Twine metadata and exact author/NOTICE/UI assertions passed. Existing CI remains the required release gate; no runtime logic changed.

Attribution release completed: coordinator delegated publication to the attribution_release worker using bounded release context; Jev selection was not performed and no Factory-routing claim is made. Read-only remote check confirmed main at 784eadd and no v0.1.0a3 tag. Pushed scoped source commit 613eeb3, waited for CI 39511950885 success on Python 3.9/3.13 including Chromium acceptance, then created v0.1.0a3 and explicitly dispatched Trusted Publishing 39512130971. Both build and publish passed. No production or staging application write occurred.

Verification: downloaded CI artifacts, checked packaged author/NOTICE/UI and exact runtime bytes, compared wheel/sdist SHA-256 with public PyPI version metadata, freshly installed the identical public PyPI wheel, and verified GitHub prerelease asset digests. PyPI's hyphenated version endpoint returned transient HTTP 503 and the project endpoint was stale; its equivalent normalized endpoint returned current version metadata and allowed verification. GitHub prerelease and immutable older releases are preserved. Evidence and hashes are appended to docs/RELEASE_RECEIPT.md. Reusable correction: owner attribution is Steven Ochs and Tollbench; verify public distribution metadata and notices when publishing future versions. Automated tests used no paid model calls; aggregate coordinator/worker token usage is not exposed here. Next action: coordinator reconciles this release receipt with the relevant Notion task and separately authorized integration work.
