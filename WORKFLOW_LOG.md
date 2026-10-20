# Passport build workflow

## Standalone alpha foundation

Requested outcome: an independently usable, correctly attributed open-source Passport piece, delivered before Toll Bench integration. Public boundary: private information, encryption/recovery, portability and explicit sharing. CRM/list workflows, goals/action packs and marketplace implementation remain outside this repository.

Owner: coordinating development agent. Workers: passport_crypto implemented the browser vault core and 11 tests; passport_package implemented packaging, loopback-only server, CI and 12 tests; passport_review reviewed security and correctness; passport_pypi_setup checked publishing access. No Factory routing or live model calls by the test suite. No token-savings claim.

Implementation: newly authored browser code using Web Crypto and IndexedDB plus a Python standard-library static launcher. Chose a whole-snapshot alpha format and explicit recovery files. Documented bearer-key handling, absent remote identity/revocation, browser-loss risks and later hosted integration gates. No private application source copied. Apache-2.0 and attribution follow the existing public Toll Harness convention.

Review found stale sharing downloads after changed selections, stale preview state across restored vaults and incoming field collisions with provenance. Corrected all three. Browser regression checks include asynchronous selection changes and preserved imported values.

Verification: 11 core tests and 12 server/CLI tests passed locally. Synthetic browser acceptance passed for create, save, file upload, exact sharing, recovery, restore, cross-tab updates, mobile width and absence of external requests. Wheel/sdist are built with attribution inventory and metadata checks. Public CI provides an additional platform receipt. Tests do not constitute independent security certification.

Publishing: public repository/release setup is authorized. PyPI requires a new Trusted Publisher binding; the available browser was not signed in. No credentials were read or copied, and no other project's publisher was changed. Account-side setup remains a distinct gate. Toll Bench integration, deployment, customer migration and cloud provisioning are not performed in this milestone.

Public CI exposed a build-tool compatibility issue: newer Hatchling produced metadata 2.5 that the selected Twine 6 validator rejects. Pinned Hatchling 1.27.0 for a consistent supported metadata format across Python versions; rerun CI before release. No runtime dependency was added.
