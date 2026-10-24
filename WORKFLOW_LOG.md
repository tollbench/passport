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

## 2026-10-20 — Repeated-question answer reuse component

Requested outcome: use optional producer-suggested question labels to find and fill previous answers privately, while preserving subject/task boundaries and explicit sharing. Owner: Steven Ochs and Tollbench. Execution: coordinator assigned `answer_reuse_core` in isolated worktree `/private/tmp/passport-answer-reuse-20261020`, branch `codex/passport-answer-reuse-20261020`, based on `613eeb3`. Jev is retired per the preceding correction; this work is direct delegation, not a claimed Factory selection. Public vault code only; no private application source, server deployment, package version bump or publication in this component.

Implemented: a pure client candidate matcher with five specific keys and explicit aliases; exact opaque subjects; exact task references for task answers; only explicit reusable answers crossing tasks; latest versions only; version/date/source provenance; visible multiple-candidate and age review. Existing generic fields and legacy tag fallback preserve format v1. The form offers matching saved answers and fills after explicit selection. Context changes clear untouched fills. Sharing is a separate action. Added the new static module to the server allowlist and packaged-asset CI gate.

Verification underway: synthetic Node suite passed 18/18 (7 focused matcher cases plus 11 existing vault cases). The first run exposed a test fixture containing `undefined`, which the existing JSON validator correctly rejected; corrected the fixture to represent omitted metadata. Server/CLI tests passed 13/13, including the real new asset route. Initial sandbox denied loopback binding; reran with approved local networking. Browser acceptance runs against this isolated worktree on port 8876 using existing installed tooling. No paid provider/model calls are made by tests; routing/worker token totals are not observable here.

Coordinator review requested persisted provenance: unchanged fills now save only source entry ID and version under `reusedFrom`; manual edits or context changes clear derivation. Documented that producer labels are adapted hints and subject/scope come from trusted owner context. Browser first run exposed a fixture race with asynchronous save reset; added an explicit saved-record wait. The final synthetic browser acceptance passed exact-context aliases, explicit filling, ambiguous candidates, persisted provenance, manual-edit clearing, encryption-only storage, sharing isolation, lock/recovery, restore, cross-tab updates and mobile layout. No external requests or page errors occurred. Inspected the mobile screenshot and scoped diff; 18 Node and 13 server tests remain passed.

Next action: commit the reviewed owned files and return the verification receipt to the coordinator. Publication/integration remain separate.

## 2026-10-20 — Saved-answer alpha release preparation

Release worker merged component 8835357 into the isolated release branch, preserving the 0.1.0a3 receipt and both workflow histories. Prepared 0.1.0a4 metadata and public documentation for local saved-answer lookup and explicit form filling. Both CI and publishing use the Node test glob that includes answers.test.mjs; both packaged-asset checks now require the fifth browser asset. Component verification was reported by its worker; independent coordinator review remains pending. Publication is held until the coordinator passes review. No hosted integration or application deployment is included.

### Review correction — Optional task reference

Independent review identified that a blank task reference saved successfully but its exclusion from future suggestions was too quiet. Kept metadata optional and added inline help explaining that a reference enables finding the answer again for that task, while leaving it blank saves without automatic suggestions. Added browser regression coverage for the visible hint, successful blank-reference save, preserved task scope, and absence of suggestions both with a blank lookup reference and a later different reference. Verified: isolated browser acceptance on port 8876 passed, including the new blank-reference regression, existing private reuse/sharing checks and mobile layout. No external requests or page errors occurred. No matcher or sharing behavior changes.

Release gate update: coordinator and independent review passed the client-only security/privacy scope. Integrated the reviewed optional-reference hint from 014e9c5 after its isolated browser acceptance passed. Coordinator authorized proceeding with 0.1.0a4 CI and Trusted Publishing; publication verification remains the next gate.

Saved-answer publication verified: source 3984aec passed CI 39512987235 on Python 3.9/3.13, including 18 Node tests, 13 Python tests and browser acceptance. Created new v0.1.0a4 tag and explicitly dispatched Trusted Publishing 39513212379; build/publish passed. Public PyPI metadata, CI artifacts and GitHub prerelease digests agree. Verified new answer module, correct ownership and exact runtime bytes; a fresh public wheel installed and reported 0.1.0a4. No extra full test suite or paid model evaluation was run after CI. Appended release evidence to docs/RELEASE_RECEIPT.md. Public scope remains local private lookup/form filling; no automatic agent intake or hosted integration is claimed. No site/server writes or earlier release changes occurred. Next: coordinator reconciles the receipt into the relevant task and handles separately authorized integration decisions.

## 2026-10-20 — Hosted client integration, version 0.1.0a5 candidate

Requested outcome: official Passport hosted vault integration using the canonical public encryption core, with personal/business account scopes, recovery, notes/files/answers/reuse, portability and removal. Owner: Steven Ochs and Tollbench. The coordinator assigned `passport_hosted_client` in isolated worktree `/private/tmp/passport-hosted-client-20261020`, branch `codex/passport-hosted-client-20261020`, based on `8540193`. Direct delegated execution following the recorded retirement of Jev; no Jev selection or Factory-routing claim is made. Harness and proprietary application source are untouched. Parent owns the private authenticated storage adapter and Notion reconciliation.

Implemented: separate hosted HTML/UI and strict parent bridge, with the unchanged `vault.mjs` and `answers.mjs`; no duplicated cryptography. The host must use `sandbox="allow-scripts allow-downloads"`, without same-origin access, and CORS-enabled static modules. Parent source, pinned origin, nonce, random capability, operation, scope, request ID and exact schemas are checked. Only encrypted v1 envelopes plus storage metadata cross the bridge. Recovery download and explicit owner acknowledgement precede the first persistent create. Whole snapshots use opaque expected ETags; save errors/conflicts retain drafts and never report success. Scope changes require consent when unlocked and clear keys, forms, suggestions and previews. Documentation records host authorization/quotas, delivery risks, recovery limits, and the absence of team key sharing or automatic agent intake.

Verification corrections: browser testing exposed that the restricted sandbox disallows native form submission and confirm dialogs. Hosted forms now dispatch local actions without navigation and confirmations use in-frame HTML dialogs. A saved-answer suggestion redraw on blur could consume a selection click; unchanged lookup context now preserves its rendered candidates. Instant embedded scrolling and a viewport-sized synthetic host avoid nested scrolling interaction races; the acceptance also exercises keyboard reload. These changes are limited to the new hosted entry point. Never expand sandbox permissions to work around those UI behaviors.

Verified so far: 21 Node tests passed, including strict schema/source/origin/capability/correlation rejection and timeout/late-reply checks; 13 existing Python server tests passed. Full synthetic Playwright acceptance passed opaque frame isolation, recovery-before-persist, encrypted notes/files/answers/reuse, selected export, conflict/unavailable draft retention, scope consent/clearing, backup restore/delete isolation, reload recovery, wrong-key/tampered ciphertext rejection, no key/plaintext in bridge/storage, CSP network blocking and mobile layout. Tests call no models or paid providers. Worker/coordinator token totals are not available here. Initial localhost test was blocked by sandbox binding restrictions; an approved localhost-only rerun succeeded. Initial offline build lacked Hatchling; the normal pinned isolated build was approved. Final artifact checks and scoped commit are next; publication/deployment remain with the coordinator.

Final verification: final hosted browser acceptance passed again after simplifying the main privacy notice and moving technical limits into collapsed details. Desktop and mobile screenshots were visually inspected; no overflow or clipped controls. Wheel and sdist built successfully with pinned Hatchling; Twine passed both. All eight packaged assets exactly match current source, and version/author metadata plus hosted documentation/tests were verified. Final source whitespace and README wording were cleaned during staged review; rebuild follows to bind artifacts to the committed source. Coordinator separately reports seven passing actual Flask/SQLite/host-shell browser checks, including real two-tab 409 conflict and 22 ciphertext-only bridge messages. That integration receipt is coordinator-owned, not a test rerun by this worker. Source and staged diff reviewed; next action is scoped commit and coordinator release/publication review. No public upload or server write performed here.

Publication authorized by coordinator after review of commit `dc1da7be766932c175ab43c107e65b438df6feea`. Exact-source wheel/sdist rebuilt and verified; both passed Twine. Public main was still `8540193` and `v0.1.0a5` did not exist. Fast-forward pushed the reviewed source to main; Verify Passport run `39521985931` is in progress. Tagging and Trusted Publishing wait for that CI gate. The GitHub connector lacks release/workflow-dispatch capabilities, so publication uses the repository's existing authenticated GitHub CLI workflow without reading or handling credentials.

Release gate passed: Verify Passport `39521985931` completed successfully on Python 3.9 and 3.13, including standalone and hosted Chromium acceptance. Created the previously absent annotated `v0.1.0a5` tag at reviewed source `dc1da7be766932c175ab43c107e65b438df6feea` and explicitly dispatched Trusted Publishing `39522175399`. Build/publication and public artifact verification remain in progress; no deployment performed.

Publication completed and verified: Trusted Publishing `39522175399` succeeded. Public PyPI wheel/sdist matched CI byte for byte, exact tagged runtime source, version and ownership metadata. Fresh isolated installation of the downloaded public wheel reported 0.1.0a5 and all installed runtime files matched source. Created GitHub prerelease with the verified wheel, sdist and SHA256SUMS; its asset digests match PyPI. Appended links/hashes and limits to `docs/RELEASE_RECEIPT.md`; updated current-version documentation. Older releases remain untouched. No server write, deployment, private code publication, credential handling or paid model tests occurred. Next action: coordinator reconciles the receipt into Notion and consumes pinned `toll-passport==0.1.0a5` in the separately reviewed application integration.

## Hosted book experience — 0.1.0a6 candidate

Requested outcome: foreground the owner's personal/business information in the book and make create/unlock visibly open it. Owner: Steven Ochs and Tollbench. Worker: passport_feed_and_asset_fix, directly delegated after the user's retirement of Jev. No Factory-routing claim, no paid provider/model test calls. Public implementation stays canonical; no private application or user content is included.

The hosted client now opens onto book chapters, moves recovery/export to secondary details, focuses the opened book after create/unlock/restore/save, and focuses errors without clearing drafts. The initial recovery acknowledgement remains mandatory before creation persists. Existing encryption, bridge protocol, schemas and data format are unchanged. Labels explain that saving does not automatically share with agents. The standalone entry point does not use the new scoped hosted styles.

Manual dependency review: hosted.mjs is a single entry module; render/save/create/unlock/restore and status changes are exercised by the complete hosted browser fixture. No repository GitNexus index or requirement is present. Verified 21 Node tests, 13 Python tests, opaque-sandbox hosted browser acceptance and the separately owned native-feed fixture. Browser checks include chapter focus, removed standalone masthead, retained drafts on conflict/error, scope isolation, recovery, selected export and no plaintext/key bridge leakage. Initial unprivileged loopback test was blocked by sandbox binding; authorized synthetic loopback rerun passed. Visual review found and fixed clipping when scrolling directly to the heading; scrolling its wrapper preserves the title and Lock control. Build and Twine checks pass; all eight packaged asset bytes match source.

Current state: reviewed local candidate, publication pending coordinator review and CI. A private site diff consumes a6 and retains Passport identity inside the existing feed card; live deployment and data import remain separately coordinated. Existing multi-file upload stores Markdown/Notion exports as encrypted attachments, without parsing/indexing them. Curated readable information can use the existing Add information form. No import feature or private corpus was added here.

Coordinator reviewed the public/private diffs and fixture screenshot, requested stronger visible AI-provider privacy copy and removal of the host's redundant ready-success banner, then approved canonical a6 publication after verification. Primary copy now states that saving does not send contents to AI providers, the host stores encrypted data, and the key stays with the owner. The host banner correction is private-app-only. Final hosted and native-feed browser checks pass. Publication uses the existing tag-bound Trusted Publisher workflow; staging remains on hold during the owner's private import/export.

Published a6 at canonical source 0987eee after CI39533895595 passed both supported Python versions and standalone/hosted browser acceptance. Trusted Publishing39534034369 succeeded. Public PyPI wheel/sdist match CI artifacts, exact tagged runtime and public metadata hashes; fresh isolated wheel installation reportsa6. GitHub prerelease contains the same artifacts and checksum file. Release links/hashes are committed in docs/RELEASE_RECEIPT.md. No staging writes or live reload; coordinator holds deployment until the owner's private import/export is complete.

## Optional assigned question channel — 0.1.0a7 candidate

Requested: private saved-answer reuse for a host-bound question, with explicit
selected release. Direct worker passport_feed_and_asset_fix after Steven retired
Jev; no Factory claim. Added a separate strict question protocol and private
controller; existing ciphertext protocol, encryption and document format unchanged.
Owner-visible named recipient and exact answer confirmation follows successful
encrypted save. Unknown/missing labels stay non-punitive. Scope, version, expiry,
lock and stale async guards preserve the approval boundary.

Parent reviewed the contract, transport, focus, failures and screenshots. Corrected
question focus after unlock, exact attempted-receipt retry after expiry, optional
host timing, modal cancellation on lock and a card-sized scrollable dialog. Tests:
30 Node and 13 Python pass; ordinary hosted browser and new question browser pass,
including 2000-character mobile confirmation and reachable buttons. CI now runs
new acceptance against installed package resources. Separately reviewed private
host integration has 50 Python/7 Node tests, a composed browser flow and three
actual PostgreSQL race checks; no private code or data is included in this repo.

Local build initially blocked by dependency network sandbox; normal isolated
pinned Hatchling build succeeded after approved network execution. Twine checks
pass. Publication is pending final source/CI gate, not claimed here. No live
application deployment or provider/model calls occurred.

Release CI39539463195 passed unit/build jobs but caught an existing hosted fixture
race: set_input_files bypasses disabled-control actionability during asynchronous
reload. The owner UI correctly stayed locked. Added an enabled-input wait before
recovery uploads, preserving all tamper/wrong-key assertions and runtime behavior.
No tag or publication occurred on the failed run; fresh CI is required.

Published a7 from corrected29eab7c after CI39539659382 passed both supported Python
versions and all three installed-wheel browser gates. Trusted Publishing39539807921
succeeded. Public PyPI wheel/sdist matched CI artifacts, exact tag and metadata
hashes; fresh isolated public-wheel installation reports a7 and matches every
runtime byte. GitHub prerelease contains the same artifacts and SHA256SUMS.
Release links/hashes are in docs/RELEASE_RECEIPT.md. No staging deployment occurred.
Private integration pin is handled separately in its isolated repository.

## 2026-10-21 — Batch answers and trusted private panels (a8 candidate)

Requested outcome: let an owner reuse private answers and upload information per question, review a single named-recipient batch, and host proprietary goal UI inside the unlocked book. Owner: Steven Ochs and Tollbench. Worker: passport_feed_and_asset_fix in isolated codex/passport-batch-panels-20261021 from 148cd72. Jev is retired; no Factory selection claimed. Parent and private adapter/goals workers reviewed the frozen channel and panel contracts. No private business code, user records, keys or provider calls entered this public tree.

Implemented generic batch context/transport/editor, explicit file selection, encrypted save-before-release, exact local provenance, recipient confirmation and identical approval retry. Added trusted fixed panel registration with revision/scope guards, lock DOM clearing and registered chapter focus. Existing format and storage/single-question protocols are unchanged. Limits are documented in docs/BATCH_CHANNEL.md; the addon trust boundary is in docs/PANELS.md. No runtime dependencies added. Attribution remains Steven Ochs and Tollbench, Apache-2.0.

Verification: 41 Node tests and 13 installed-wheel server/CLI tests pass. Fresh installed a8 wheel passed standalone, hosted, single-question and batch/addon Chromium fixtures with synthetic data. Batch acceptance covers private uploads, selected-file-only disclosure, failed encrypted save, changed-context refusal, idempotent receipt retry, stale addon revisions, lock during save, no key/other-record leakage and real mobile pointer Cancel/Send with 2000-character review. A mobile native dialog issue was found and corrected using a compact scrolling review body and non-scrolling action footer; no forced/programmatic click substitutes were used. An existing hosted fixture's request allowlist was updated for the two new packaged modules. Initial restricted loopback/build attempts failed due sandbox/backend availability; authorized loopback and pinned isolated builds passed. Twine wheel/sdist checks passed.

The host must separately enforce its authenticated owner/question/recipient transaction, no cross-agent carry, private file downloads and quotas. No deployment or publication occurred during candidate verification. Parent authorized publication after these gates and scoped commit review; CI and published-artifact receipts remain next. Test suites used no live model/provider calls; total coordination token usage is not exposed.

Final review correction: unknown/missing optional labels now have a batch-local exact question-text fallback (case/whitespace only), exact owner/task or explicit reusable scope, latest versions and mandatory manual selection. Different text, subject and task are excluded; multiple matches require review. Existing a7 matcher is unchanged. Added the focused 41st Node test.

Release verified: scoped commits348516e+c736a1b pushed normally after canonical main guard; CI39660490761 passed including installed-wheel browser gates. Created immutable v0.1.0a8 and dispatched existing Trusted Publishing39660841914; success. Public PyPI wheel/sdist match CI artifacts and tagged runtime bytes, author/NOTICE and dependency metadata verified, fresh public-wheel installation passed13tests. GitHub prerelease contains identical artifacts/checksums. Exact hashes/URLs in docs/RELEASE_RECEIPT.md. No new publisher permissions or credentials, live application writes or deployment. Next: private host consumes exacta8 under its separate reviewed staging integration.

## 2026-10-21 — Deterministic topic chips and exact local identity (a9 candidate)

Requested outcome: editable/removable topic chips beside each question, eligible saved answers filled locally, and the existing named-recipient Send as the disclosure action. Steven Ochs and Tollbench own the project. Worker passport_feed_and_asset_fix used isolated codex/passport-topic-catalog-20261021 from canonical a8 receipt 0ca0f53; direct delegation after Jev retirement, no Factory routing claimed. Parent reviewed the frozen eleven-descriptor catalog, local entity boundary, compatibility, implementation and desktop/mobile screenshots. No private business code, owner data, keys or provider calls entered this repository.

Implemented the versioned generic catalog/JSON resource, exact local entity/topic/type/format/task matching, compact topic/entity controls and direct Send in the optional matching mode. Unknown hints and old records do not gain classification authority. Removing a topic clears untouched automatic text and preserves human edits unclassified; explicit compatible replacement retains human text. Saves keep fact versions/history and avoid multiplying unchanged reused facts. Multiple conflicting records remain unresolved. Encryption and release wire formats are unchanged; old batch contexts retain their existing behavior.

Review corrections included podcast preferences as a distinct project topic, exact choice-option equality, preserving original facts while saving unclassified edits, avoiding duplicate eligible facts on Save then Send, readable inline copy and a visible collapsed source detail. An early screenshot captured before its source summary settled; the browser fixture now waits for actual summary visibility, and the final real-pointer mobile fixture passes. Parent approved compact desktop/mobile controls. Manual caller review and focused fixtures were used under the existing authorized dependency-review fallback.

Verified: 49 Node tests, 13 installed-wheel Python tests, and installed-wheel standalone, hosted, assigned-question, legacy batch/addon and new topic browser gates all pass. The new opaque-frame fixture covers entity isolation, untouched-auto removal, human-edit retention/reclassification, encrypted unclassified save, file-only private material, failed-save refusal, direct exact recipient release and no pre-send plaintext leakage. Both 390px and desktop captures use synthetic data. Wheel/sdist passed Twine; packaged runtime bytes, eleven JSON descriptors, version and Steven Ochs/Tollbench attribution were checked against source. No runtime dependencies added. No live model/provider usage; total coordination token usage is unavailable.

Publication is pending parent review of the committed candidate. No tag, public release or staging mutation occurred. Host rollout must first allow topic-catalog.mjs, topic-editor.mjs and request-types.json while still on a8, then install verified a9, and only then enable its separate matching flag. New matching contexts fail closed on old clients; the host retains authorization, recipient delivery and quota responsibilities.

Release CI39683932265 passed both unit/build/install jobs and all four legacy browser flows, then caught a new fixture race: its second private-save check matched the first save's unchanged success text and inspected the old document. The fixture now waits for the actual encrypted document revision to advance before the unchanged classification assertions. Focused installed-wheel mobile fixture passes. No runtime change, relaxed assertion, tag or publication; fresh exact-source CI is required.

Parent identified the corresponding status-copy risk: a prior successful save message could remain visible during a later pending/failed save. Strict matching mode now shows Saving privately before persistence and Not saved with draft retained on failure; success appears only after completion. The focused browser fixture verifies a failed second save leaves the exact persisted document unchanged and the edited draft intact. Runtime change is limited to this status path; fresh CI will rebuild and test the final candidate.

Released a9 from final approved1fdd8a0 after CI39684266824 passed both Python versions,49Node/13Python and all installed-wheel browser gates. Normal remote guards/push/tag preserved canonical history. Trusted Publishing39684517196 succeeded. PyPI wheel/sdist equal publication artifacts and tagged runtime; canonical11catalog, attribution, metadata and fresh isolated13-test installation verified. GitHub prerelease contains identical artifacts/checksums. Exact hashes/URLs in docs/RELEASE_RECEIPT.md. A bounded two-frame synthetic capture confirmed the source-details row without runtime changes. No staging/production mutation. Next is the private host's separately reviewed compatibility rollout and exact a9 pin.

## 2026-10-21 — Selected item copies and local source imports (a10 candidate)

Requested: generic owner-controlled note/file/folder picker, exact-version copies for a host's flow grants, and repeat-safe local import primitives. Worker passport_feed_and_asset_fix used isolated codex/passport-item-sharing-20261021 from2cf54b9. Steven Ochs and Tollbench attribution retained. Direct delegation after Jev retirement; no Factory claim, owner records, keys, provider calls or private business code in this public tree.

Added separate item-share channel with parent/origin/capability pins, exact context, named recipient/scope/purpose/expiry, bounded manifest and explicit approval after encrypted pending-intent save. Source entry/vault IDs stay local; member UUIDs identify released copies. Intents store immutable source references/selected indices/digest, not duplicate attachment bodies. Private host supplies same-session save acknowledgement/ETag correlation, authorization, grant storage/read/revocation and quotas. Public picker cannot enforce server permissions. Existing ciphertext/question contracts and a9 matching remain unchanged.

Folder records snapshot explicit nonrecursive members/versions; nested or duplicate members fail. Uploads save privately and preselect eligible new files into an exact preview ready for approval; larger files stay private. Metadata-only empty selections are refused. First-slice fields are strings with ASCII keys; Unicode scalar text and fixed safe-integer metadata make JS/Python canonical hashes agree. Parent reviewed these limits and requested readable previews, compact intent storage, clear context beside approval and safe import enrichment behavior. Imported prose stays unclassified. Source identity/revision/digest supports repeat no-op or immutable version updates; changed imports refuse local content edits, tags, extra fields or classifications instead of overwriting them.

Verification:64Node tests,13installed-wheelPython tests and all six installed-wheel browser families passed (standalone, hosted, assigned questions, batches/addons, deterministic topics, item picker). New synthetic opaque fixture covers private upload preview, real mobile folder creation, pinned old version, exact fields/files, no preapproval leakage, failed-save blocking, same-session save ack, idempotent grant retry and private receipt. A long-list mobile pointer issue was reproduced and fixed by bounded list scrolling with folder controls above it; no forced/programmatic clicks. JS/Python canonical fixture parity passed. Candidate wheel/sdist passed Twine and runtime-byte/metadata/NOTICE/no-dependency checks. Initial no-isolation build lacked Hatchling; pinned isolated backend build passed. Final preview copy repeats scope/purpose/expiry beside approval; installed item gate is rerun for that narrow change.

README, hosted boundary/asset documentation, FORMAT and release guidance are reconciled; docs/ITEM_SHARING.md records exact public contract and host duties. No publishing/deployment is claimed. Parent review and exact-source release CI remain required before a10 publication. Private flow, grant-list/revoke, connectors, Notion conversion and real owner acceptance remain separate integration work. Total coordination token usage is unavailable.

### a10 publication verified

Parent authorized publication after public review, exact-source CI 39693640778 success and separate private composition checks. Publication worker passport_a10_publish guarded clean main/remote at f89d48a, created normal immutable tag v0.1.0a10 and explicitly dispatched the existing publish.yml. Trusted Publishing 39694851821 succeeded; no publisher permissions or credentials changed. CI artifact and local hashes agree. Public version JSON initially returned 404 during propagation; project JSON explicitly identified a10 and its expected artifact URLs/hashes, so verification used that endpoint.

Downloaded the public wheel/sdist and checked exact build bytes, all tagged runtime/source bytes, version/author/licenses/NOTICE and no dependencies. Fresh isolated public-wheel installation passed 13 Python tests and 23 runtime-file byte comparisons. Both public provenance endpoints returned attestation bundles. Created a prerelease with those same artifacts and SHA256SUMS and checked GitHub asset digests. Receipt links/hashes are in docs/RELEASE_RECEIPT.md. Synthetic checks used no paid model/provider calls; coordination token usage is not exposed. No site deployment occurred. Next: private integration may consume exact toll-passport==0.1.0a10 through its separate staging gates.

## 2026-10-21 — Hosted information library (a11 candidate)

Requested outcome: make the real book destination understandable after opening
the branded Passport cover. Owner: Passport library worker, delegated directly by
Jarvis under Steven's current instructions; no Jev selection or Factory execution
was used. Work is isolated from public main b8b3e55 in
`codex/passport-library-ui-20261021`. Public main/PyPI were checked: a10 current,
a11 absent. No private site code or proprietary goal/CRM features are included.

Implemented: explicit loading, error, empty, recovery acknowledgement, locked and
open states. New books explain automatic browser key creation; existing books
ask for the original `passport-recovery.json`. A failed load cannot enable Create.
The unlocked library browses actual notes/files/answers with local title/tag
substring search, stored-kind filters and expandable previews. Add and Upload
remain prominent; manual answers, restore and settings are secondary. Search,
counts and item DOM clear on lock/scope. Registered panels and selected question,
batch and item focus/release contracts remain intact. Crypto, schemas, transport
and keys are unchanged. No data imports, external AI calls or new dependencies.

Verification: 64 Node tests and 13 installed-wheel Python tests; all seven installed
browser gates passed with synthetic data. Source runtime matched all 19 installed
web resources. Parent reviewed new/locked/open/mobile screenshots and approved
the direction, then requested Restore move into Already have a backup details;
that UI-only follow-up is included and its hosted/library gates are reverified.
Browser fixture scrolling initially missed two controls after focus movement;
explicit visible scroll positioning verifies pointer controls, with keyboard
activation also covering export. Initial sandbox loopback test needed approved
local process access; no application/server mutation was involved.

Publication and staging deployment are pending parent review. Next: give the
committed candidate/wheel to the private host worker for composition checks; root
coordinates trusted publication and staging separately. No live owner data,
recovery keys, provider tokens or private records were used.

Publication completed after parent review: main advanced normally to e22e7ad;
exact-source CI39716705638 passed both Python versions and all seven browser
families. Private host composition independently passed against the same final
wheel (native card/library, recovery, exact-agent question release/autofill, and
fixed goal/pack panel). Parent then approved tag/publication. Tag v0.1.0a11 points
to e22e7addae8738917053e28187dd999ab819d400; Trusted Publishing39717175928 succeeded.

Downloaded public PyPI artifacts match the local build and publication workflow;
23 wheel runtime files and 61 sdist source files match tagged source. Fresh public
wheel installation passed 13 Python tests. GitHub prerelease digests match. Hashes
and links are recorded in docs/RELEASE_RECEIPT.md. Main documentation now describes
the released version; the immutable release tag retains its reviewed source. No
staging or production operations were performed by this release worker. Ops
received the exact released pin and hashes for separate authorized integration.

## 2026-10-22 — Explicit per-question batch audiences

Owner: Steven Ochs / Tollbench. Jarvis directly delegated this isolated change;
Jev is retired and no Factory selection is claimed. Requested outcome: shared
questions show each exact named recipient and release only explicitly approved
copies. The public library adds optional all-or-none per-question audiences,
strict opaque-ID validation and final audience/file review; private host policy
remains outside this repository. Existing single-recipient and item-picker
contracts remain compatible. No model calls, dependencies, encryption changes
or plaintext persistence were introduced.

Verified: focused batch tests including legacy behavior, audience bounds and
private provenance; synthetic native-host browser save/reopen/matching, topic
removal, failed-save and cancel gates, exact approved file copies. Host transaction
proof is a separate private gate. No owner data, credentials or private site code
are in this repository. No version bump, publication or host activation here;
Jarvis coordinates the composed a12 release after review.

Parent authorized completing the public a12 publication. Read canonical main
b954606 and preserved its newer a11 publication receipts before composing this
release. Version metadata/citation/changelog now name a12; the existing protected
tag workflow will perform Trusted Publishing. Publication is pending until its
public artifacts and exact hashes are verified. No site activation is performed
by this release worker.

Publication verified: tag v0.1.0a12 points to da9a1e2; source CI39815096618 and
Trusted Publishing39816667281 succeeded. Both CI jobs passed all required steps
before tagging; the run summary briefly lagged those completed jobs and now also
reports success. Public PyPI wheel/sdist match the reviewed build and workflow
artifacts exactly; both have provenance attestations. Fresh public-wheel install
passed 13 Python tests. GitHub prerelease assets match the same hashes. Version,
author/license notices, zero runtime dependencies, 23 packaged runtime files and
61 sdist source files were verified. The local installed wheel passed both legacy
batch and synthetic shared-audience host browsers. Receipt links/hashes are in
docs/RELEASE_RECEIPT.md. No site writes or private data publication occurred;
root coordinates explicit a12 installation in the separate application release.

## 2026-10-22 — Hosted restore requires a second visible file gesture (a13 candidate)

Requested correction: a real owner Chrome restore selected an encrypted backup
but the detached recovery picker did not open after asynchronous file reading.
The old browser test intercepted a programmatic chooser and missed this user
activation failure. Owner: Steven Ochs / Tollbench. Jarvis directly delegated the
fix; Jev is retired. Work is isolated on codex/passport-restore-gesture-20261022
from verified public main c9daace. No real backup, recovery key or owner data was
read by this worker.

Implemented: an explicit visible recovery-file control and Cancel restore;
pending ciphertext is bound to the original scope, snapshot and ETag. The normal
second click selects recovery locally, decrypts, asks before replacement, then
performs the same conditional save. Wrong/mismatched recovery can retry without
writing; canceled replacement preserves the old book. Pending state clears on
cancel, lock, scope change, reload, save, creation and deletion. No crypto or
protocol changes, new dependencies, AI classification or site writes.

Verified: actual Chrome synthetic hosted regression now uses ordinary visible
label clicks for BOTH file selections, asserts the first gesture creates only
one chooser, and separately tests wrong/nonmatching recovery, empty-book restore,
canceled replacement/delete, real competing ETag refusal, successful replacement,
and pending cleanup on scope/lock/reload/delete. Existing ciphertext-only bridge,
key non-disclosure, sandbox, mobile and hosted behavior checks also pass. This
corrects the prior insufficient intercepted-picker test. Further package tests
and parent review precede publication; a13 is prepared, not published here yet.

Candidate verification completed: all 67 Node tests and 13 installed-wheel Python
tests pass. The same expanded actual Chrome hosted regression passes again using
the built a13 wheel, whose 23 runtime files match reviewed source bytes. Artifacts
are local under /private/tmp/passport-a13-dist; no tag, push or publication was
performed. Parent review is the next gate. Existing README/release receipt remain
on published a12 until a13 is approved and actually verified publicly.

Publication gate correction: exact-source CI39826062943 passed the expanded
restore regression in Linux Chrome, but exposed an existing library fixture
race. The book entered loading before its postMessage reached the synthetic
host; the test invoked resumeLoad before that fixture callback existed. Added
an explicit wait for the host callback, preserving all loading/empty assertions
and production runtime. This is a test synchronization correction, not a delay
or retry around a product failure. Failed log: /private/tmp/passport-a13-ci-job.log.
The next exact-source CI run must pass before a13 tagging/publication.

Publication complete after parent review: approved test-only correction 9ed15cf
passed exact-source CI39826598202 (both Python versions and all seven browser
families); tag v0.1.0a13 points there. Trusted Publishing39827087430 succeeded.
Downloaded public wheel/sdist equal the reviewed local build and workflow
artifacts. Both provenance attestations and GitHub digests match; 23 runtime and
61 sdist source files match the tag. Fresh public-wheel installation passed all
13 Python tests. Wheel hash remains the original approved 9c7187f6; packaged test
correction changed the sdist to 3f39e5e5. Full hashes/links are recorded in the
release receipt. All owned changes are committed; no site operations or owner
recovery-file access occurred. Ops received the exact a13 pin and hashes for the
separate root-authorized application rollout.

## 2026-10-22 — Scoped hosted unlock feedback and retry correction

Root directly delegated a reported recovery-file failure to answer_reuse_core.
Owner: Steven Ochs / Tollbench. Jev retired; no Factory routing is claimed.
Isolated branch `codex/passport-unlock-feedback-20261022` starts at public source
`0104f13`. No shared/private application source or owner files were modified.

Read-only tracing found an outer initial Personal URL with inner Business selected
is supported: the host uses each validated request's explicit scope. The actual
reported selection was an encrypted backup, while the unlock control requires
the separate recovery file. The public UI replaced that local failure with a
misleading generic host/write-timeout message, and retained a failed file input.

Added a scope-specific locked heading, filename ambiguity guidance, local
format/vault-ID checks and explicit backup/wrong-book/invalid-file/decrypt
messages. Selection resets before reading so failure can be retried; cancellation
is a no-op. The unlock result is bound to the captured scope/envelope/etag before
adoption. No crypto format, persistence, restore, automatic scope selection or
device convenience changes. Pure unlock failures perform no network/storage write.

Verification: new 390px synthetic dual-book browser fixture passed; existing hosted
browser acceptance passed. Added the focused fixture to installed-wheel CI. Test
files remain temporary and synthetic; no owner recovery files, live app records,
paid model/provider calls or remote application changes. No publish performed.

Next: root review of exact diff; coordinate the next package version with separate
trusted-device work, then required source/release CI and reviewed publication.
No current device-unlock capability is claimed. Relevant future integration hooks
are the hosted local key/document lifecycle and isolated scope-bound storage;
keys must remain outside the ordinary host/message channels.

Root reviewed fd91fe1 and authorized the a14 release. Added scope-only names for
new hosted recovery and encrypted-backup downloads, including initial recovery
and later recovery export. Existing filenames remain content-compatible; the
focused browser fixture checks all six scope/type download names and unlocks
renamed fixture files. Version metadata/changelog updated to 0.1.0a14. Required
release gates and guarded publication follow; no trusted-device work is included.

Local a14 gates passed: 67 Node tests, 13 installed-wheel Python tests, Twine,
and both focused unlock and existing hosted browser acceptance. All 23 wheel
runtime files match source. The synthetic download fixture now waits for creation
to finish and opens its native details control with keyboard activation before
export. Initial sandbox network/listener restrictions were retried with explicit
local-test/build authorization; no product changes were needed for those blocks.
The final source archive will be rebuilt from the committed candidate before
artifact comparison. Full required CI remains the publication gate.


### a14 publication verified

Normal non-force push preserved public main ancestry (0104f13 → fd91fe1 →
e30324b). Exact-source CI 39864163166 passed both Python versions and all eight
browser families before tagging v0.1.0a14. Trusted publication 39865357091 passed.
PyPI downloads, local build and workflow artifacts are byte-identical; GitHub
prerelease asset digests match. Both PyPI provenance bundles are present. All 23
wheel runtime and 62 sdist source files match the immutable tag. Fresh isolated
public-wheel installation passed 13 Python tests; version/attribution/no runtime
dependencies verified. Full hashes and links: docs/RELEASE_RECEIPT.md.

Root and the operations worker received the exact public artifact paths/hashes
and integration pin. No private application source, owner data, real recovery
files, live browser state or site deployment was touched. Publication is complete;
site package integration belongs to the separately authorized operations task.


## 2026-10-23 — deterministic inline question autofill
Steven approved automatic saved-answer filling, clickable source tags and duplicate-question grouping, explicitly forbidding AI matching. Implemented directly by Codex in an isolated source checkout; no delegated worker or Factory execution is claimed. Existing encrypted client/channel and release workflow are reused. 69 Node tests and two synthetic mobile browser scenarios passed before packaging; additional release checks are recorded in the deployment receipt. No owner book was opened or modified. Source/choice matching is exact; contexts and ambiguous entities are never guessed. Production is not marked complete by this source commit.

## 2026-10-24 — unified Passport client candidate

Steven requested one visible Passport, a questions-only private sheet, optional
remembered device connection, exact compatible answer reuse, and private
autosave before explicit Send. Built the public client in an isolated worktree;
no Factory execution, live owner book access, deployment, or publication is
claimed. Personal and Business remain separate ciphertext vaults and per-book
subjects. The new dedicated-origin policy is empty in source and requires an
independently configured exact HTTPS parent origin. Both signed single and
proposal-batch questions use the compact private sheet. Device wrappers use a
nonextractable IndexedDB key and are bound to owner, parent origin, scope and
vault; Lock and Forget cancel late in-flight work.

Verification: 81 synthetic Node tests passed at the first security checkpoint;
the final focused suite and isolated Chromium run cover both signed channels,
two-book ciphertext autosave, restoration under a new signed request ID,
explicit selected release, save-failure refusal, and a delayed load after Lock.
The browser fixture uses generated synthetic vaults and no provider or live
site calls. Release still requires exact host origin/capability integration and
a mode-gated addon loader; unconditional book addons in questions mode were
identified and communicated to the root and operations worker. Dedicated-origin
DNS, certificate, and infrastructure activation are separate pending work.

Follow-up review found two concrete gaps before release. Older answers saved
through the normal library contain `fields.answer` rather than `fields.value`;
the exact text suggestion reader now accepts that legacy shape while retaining
subject, scope, task, wording and option checks. The combined synthetic browser
fixture confirmed a normal-library answer appears with source and Use answer.
Lock previously cleared the key but left text visible in a second active frame.
The client now sends a same-owner lock-only BroadcastChannel signal, scrubs the
question DOM and files, disables Review, and reports disconnected state to the
host. Final synthetic gates: 83 Node tests pass; isolated Chromium confirms
batch/single release, immediate encrypted autosave, cross-request restore,
save-failure refusal, delayed load after Lock, and cross-frame active Lock.
The host must still gate native takeover on both view-ready and connected true.

Local a16 release preparation: bumped package, citation and changelog to
`0.1.0a16`. The selected-answer review now names the question, Personal or
Business book, known person/entity or task, saved source, answer and signed
recipients. Restored answers say they were saved in Passport, and Use answer
and choice changes start private saves immediately; typed text starts saving
after a 700 ms pause or field blur. A queued save is not called durable until
the encrypted save succeeds and Saved appears. The focused synthetic Chromium
fixture passed after this change, including review content, both question
channels, failed-save refusal and explicit release. The first local build
attempt could not fetch pinned Hatchling inside the sandbox; an isolated
environment then installed public Hatchling 1.27.0 and built wheel and sdist
without publishing. The wheel contains all 26 source web assets (22 modules),
including the new lock channel, and its packaged parent-origin policy remains
empty. An initial local build was superseded after the final company-topic
review and packaging pass; no tag, push, PyPI publication or site deployment
occurred.

Final coverage follow-up from root review: added canonical
`organization.description` Company description to the packaged JSON and module
catalogs, plus a collapsed local topic selector limited to signed allowed types
and compatible question formats. The signed request remains unchanged. Named
exact-entity suggestions can be seen before choosing an entity; clicking Use
answer binds that entity, while unknown or different entities never propagate
automatically. The focused catalog/model suite passed 16/16, and the isolated
Chromium fixture exercised local topic selection, private company creation,
saved source suggestion, selected company binding, review provenance and
cancel without release. A browser fixture load/hydration race was corrected by
waiting for the restored answer before its failed-save test; no runtime change
was needed for that race. Read-only public version checks found no official
`v0.1.0a16` tag and PyPI returned HTTP 404 for 0.1.0a16 before finalizing the
candidate. Final local artifact SHA256: wheel
`47f3bd2b6a0815990642c7d02aa7d18627ed9ba672f884d6e279f0cb6daa80ab`,
sdist `006286019a28ed293018e5c8bf03a6f5146624029e2873d9150a2609186bf788`.
The wheel was byte-compared with all 26 source web assets, including 22 modules
and both Company description catalog forms; its parent-origin policy stays
empty. No publication or deployment occurred.

A final provenance review found that reopening a saved draft restored the value
but not its linked answer source. The questions client now restores that source
only when the linked current answer still has the same saved value. The focused
synthetic browser flow reopened an answer chosen from a named company source,
toggled Send off and on, saved a new version, and verified the final review
still named the original saved question. This produced the final artifact hashes
above; no new disclosure route, live book access or publication occurred.

Steven then corrected the unpublished a16 answer workflow: entering an answer
must remain in memory until **Save to Passport**. The questions-only client now
does no vault save on typing, blur, Use answer, choices, tags, scope changes,
Review, or Send. Compatible untouched duplicate rows follow source edits in
the current form; a manual edit breaks that link. Save explicitly persists all
eligible changed answers and stable draft pointers, including a deliberate
clear of a previously saved answer. A failed save keeps the visible draft;
reopening restores only the last explicit Save. Review marks unsaved answers
and names their recipients. Send releases only selected answers and adds no
private answer or approval entry. Saving an entity through Add privately is a
separate explicit action and does not save its answer.

The focused synthetic Chromium fixture passed batch and single release,
two-book explicit Save/reopen, zero implicit writes, clearing a saved answer,
failed Save, an edit during a held Save, and Lock; the exact duplicate model
suite passed 6/6. The a16 wheel was rebuilt in a new isolated artifact
directory and byte-compared with all 26 web assets (22 modules); the default
parent-origin policy remains empty. Wheel SHA256
`ec6051e9556e263580f3e674881cab22e20ef43b08f38a8f1d905f9fdc4fd85f`;
sdist SHA256
`5fbf621a7afc6932d44a56b74b6201a2db733b7ff25b9639f5f17c05a6003d36`.
Earlier autosave artifact hashes remain historical and are superseded. No
publication, deployment, live owner data, or provider call occurred. The
root coordinator owns host pinning and the combined browser integration gate.

Publication gate follow-up: after Steven approved a16 publication, the exact
source was fast-forwarded to official main. CI run 40126157600 passed its Node,
build and installed-wheel checks but failed the legacy opaque hosted-browser
scenario before tagging. A sandboxed iframe has serialized `window.origin`
`null` while `location.origin` still reports its URL origin. The new dedicated
origin guard had used `location.origin` and refused the old opaque host. The
guard now tests the serialized origin; the existing synthetic opaque-host
browser flow passed, including ciphertext transport, wrong-key and CSP checks.
The test's exact module-request allowlist was updated for the new a16 assets.
The earlier explicit-Save wheel/sdist hashes remain an unpublished reviewed
candidate, superseded by this required release-gate repair. No tag or PyPI
publish occurred before the fix.

## 2026-10-24 — Ordinary Q&A candidate (not published)

Requested outcome: one ordinary native-looking question sheet before and after optional Passport connection; explicit Save remains separate; no second review form. Owner: directly authorized Astra high worker `/root/guest_feed_fix`; root coordinated review. Factory/Jev selection not claimed (retired by explicit instruction). Isolated branch `codex/native-questions-20261024`, base `4507eea6ee38644592603758ca89afc601820469`. No release version, wheel publication, installation, remote mutation, owner data or paid/model calls.

Implemented: scoped white flat question typography and fields, compact connection status, tags/suggestions/source and named recipients below each field, compact attachment control with existing explicit file-selection semantics, single Send CTA (eight-agent count bounded), optional Save only for connected relevant scopes. Manual answers and scope choice work disconnected. Connection preserves deliberate edits; Lock clears vault-derived values including edited/propagated descendants and all visible source/entity suggestions, while independent manual drafts remain. Send freezes question edits only while its signed snapshot is in flight; Save retains existing edit-race behavior. Signed release token, question/options/recipient validation, approval-ID retry and file caps remain; flow-input save-proof protocol is unchanged.

Approved bounded inbound-only handoff accepts the current host-visible manual draft against signed context; exact parent/origin/nonce/capability/token, unique question IDs, bounded complete answers, increasing transfer sequence and local-interaction refusal prevent stale replacement. No answer or source exits in ACK. Readiness now requires an authenticated UI capability ACK, so the new package leaves old hosts' native fallback visible. New host separately requires that capability before replacing native controls.

Verification (Node v24.15.0 at `/private/tmp/toll-passport-venv/lib/python3.9/site-packages/playwright/driver/node`):
- `node --test tests/native-question-draft.test.mjs tests/unified-question-model.test.mjs tests/question-batch.test.mjs tests/question-channel.test.mjs tests/hosted-bridge.test.mjs`: 39 passed, 0 failed. Includes stale/wrong context, origin/source/capability rejection, lost-ACK fresh sequence, replay refusal, exact choice/text bounds, no outbound draft and authenticated UI ACK.
- `/private/tmp/toll-passport-venv/bin/python tests/browser-unified-questions.py`: PASS (Python 3.9.6, isolated headless Chrome). Actual modules; synthetic keys/envelopes and mocked parent. Batch/single manual release, two scopes, explicit Save/reopen, failed Save, edit during pending Save, deterministic entity/source provenance, cross-frame Lock, late-load Lock. Updated obsolete second-review/mandatory-connection assertions. First attempt exposed obsolete `Your answer` locators after accessible names became question titles; fixture corrected to actual textarea controls, final run passed.
- Actual host + package fixture in `/private/tmp/passport-native-question-host-20261024/tests/passport_cover/browser_native_questions.py`: PASS. Includes mobile390, desktop1100, landscape844; late native edit import; edits during transfer; dropped ACK unchanged retry; manual Send before connection; one-click setup; eight-agent CTA; partial scopes; explicit Save; Lock provenance; pending Send inert fields. Separate old-host/new-client and new-host/old-client runs PASS, zero writes/releases. Host module tests: 3 passed.

Reviewed corrections: preserve shared library topic selectors; keep CTA compact; allow disconnected tag scope changes; preserve early typing using bounded inbound handoff; distinguish transfer attempts from edits; cap native payload before postMessage; gate rollout readiness; clear hydrated source/entity on manual import; compact attachments. Early compatibility run found a new named import unavailable in a16; host now imports the namespace and treats the new validator as optional. No security check was weakened.

Proof (synthetic content only): `/private/tmp/passport-native-questions-proof-20261024/` contains not-connected/connected screenshots at390/1100 (plus connected844), `receipt.json`, `old-host-receipt.json`, `old-client-receipt.json`, and served-source hashes. Root visually accepted connected390. Not a full Flask/live-SSO/backend integration test; release APIs are mocked, actual deployment/CSP/proxy/package installation remain a later authorized gate. Existing shared selectors and cryptographic isolation remain intact. Next action: root reviews committed source and obtains specific staging activation approval. Notion reconciliation belongs to root; no connector write performed by this worker.

### a17 local release preparation — publication held

Root authorized preparing the next version and existing staging integration; publication still waits for root's exact-artifact GO. Public PyPI JSON verified latest `0.1.0a16` (wheel SHA256 `e13c22cedadfccc56556b634f663f1dd82a9be308b33fc986c1f965e44469994`, uploaded2026-10-24T19:45:38Z); a17 absent. Prepared `0.1.0a17` metadata/citation/changelog and kept README install guidance at published a16. Made the existing unified question browser fixture portable, using installed wheel assets and optional PASSPORT_NODE/PASSPORT_CHROME/PASSPORT_WEB_ROOT, and added it to the existing Linux CI browser gate. No publish workflow permission change. Local source implementation commit `2b03be9`; companion host `597f531`. Build/inspection receipts follow separately; no tag or remote push yet.

### a17 inspected local artifacts — ready for root review, not published

Build source `71417b8ef4887b8991195f39a6cb617d6914e42f` (runtime implementation `2b03be9`); host runtime `597f53184acdc721cc5527e9ff1853a90149118e`. `python -m build --no-isolation --outdir /private/tmp/passport-a17-native-questions-dist-20261024` built wheel from sdist using existing hatchling1.27.0. Twine check passed both. Wheel has30 runtime files, all byte-identical to committed src; sdist has78 files; package member inspection found no credentials, environment files, keys or owner data. Wheel installed with `--no-index --no-deps --target /private/tmp/passport-a17-native-questions-installed-20261024`, without changing shared package installation.

- Wheel `toll_passport-0.1.0a17-py3-none-any.whl`: SHA256 `74d6d0d44ad2eaeac5c4fbce086f59b36bf16a1746d76716c2f00159692a9d57`.
- Sdist `toll_passport-0.1.0a17.tar.gz`: SHA256 `00eaaad24fff4656edbb4a6b2a26f52fd42a1a768786ec1348520fcf04f97052`.
- Frozen staging bundle `/private/tmp/passport-a17-native-questions-staging-20261024`:31 assets, manifest SHA256 `c3ed9e7a4f7379167a04bc0a65f321f5845ae5df5f284b0135b9d4f2d89fa703`. Existing reviewed build_bundle.py used the wheel and unchanged host addons, goals/sharing on. Exactly4 public assets changed: hosted-bridge.mjs, question-batch-channel.mjs, questions-only.mjs, style.css. Policy/hosted insertion remains generated per staging origin.

Installed-wheel Python tests:13 passed; first sandboxed attempt denied loopback bind, approved isolated rerun passed. Portable installed-wheel unified browser fixture:PASS with PYTHONPATH pointing only to the fresh target, PASSPORT_NODE=Playwright's Node24, PASSPORT_CHROME=temporary headless Chrome. Exact frozen bundle combined host fixture:PASS, all previously recorded native continuity, no autosave, Lock, Send-inflight, mobile/desktop gates and zero errors. No live providers or owner DB writes. Full Linux CI and remote publication are pending root GO, not claimed complete.

Scoped publication plan (not executed): root reviews source/artifact receipt, then checks canonical remote state and pushes only reviewed public commits; wait for existing CI including the new installed-wheel ordinary-question gate. Create `v0.1.0a17` on exact reviewed source, prerelease with wheel/sdist/SHA256SUMS, dispatch existing tag-bound `publish.yml` using its configured pypi Trusted Publisher (no credential changes). Verify public PyPI filenames/hashes/provenance and install those public bytes before root coordinates the existing staging origin's wheel/static-pointer integration. Re-check a17 absence immediately before publication. Production needs separate approval for the exact new range. No DNS/TLS/settings change is needed or proposed. Root owns next GO and Notion reconciliation.

### a17 publication gate: browser fixture timing correction

Root explicitly approved official a17 publication. Rechecked canonical main db9cc75 (a16 receipt only) and absent a17 tag/release/PyPI version. Pushed exact45f8064 to scoped codex/native-questions-20261024; main remains intact. Rebuilt45f8064 wheel/sdist and verified both byte-for-byte match the approved71417b8 artifacts (WORKFLOW_LOG is excluded from sdist).

CI40139079182 passed both Node/build/installed-wheel matrices and all9 prior browser families. The newly added unified browser family checked the asynchronous parent release array immediately after click; Linux delivered postMessage after that assertion. Corrected batch and single fixtures to wait explicitly for the expected release count, preserving all assertions. No runtime bytes changed; wheel and frozen static graph remain approved. Sdist changes because it includes the test. Root notified before tagging; no tag or publication has occurred. Required full CI rerun follows.

Second CI40139284864 passed the batch/Save/topic/Lock ordinary-sheet cases but the single-channel reload fill raced the bootstrap HTML: generic textarea matched its3 initial controls before questions-only replaced them. Narrowed that one fill to `.batch-question textarea`, which waits for the actual initialized question row. No runtime change or weakened assertion; root immediately notified. The public wheel and frozen bundle remain identical. No tag/publication yet.
