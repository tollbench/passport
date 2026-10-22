# Changelog

## 0.1.0a13

- Restore hosted backups through two explicit file selections: encrypted backup, then a visible matching recovery-file control. Avoid a detached picker launched after asynchronous work.
- Bind pending restore to the original book scope and storage version; preserve replacement confirmation and conflict checks. Clear pending restore on cancellation, lock, scope change, reload, save, creation or deletion.
- Keep encryption, recovery formats, sharing and all host protocols unchanged.

## 0.1.0a12

- Add optional explicit per-question recipient lists to batch contexts, with strict opaque-ID bounds and all-or-none audience validation.
- Show each answer’s recipients and require a final answer/file review for shared contexts; saved audience provenance remains private.
- Preserve single-recipient batches, item-picker behavior, encryption and storage formats. Host membership, authorization and transactional delivery stay outside this generic library.

## 0.1.0a11

- Make hosted loading, connection failure, new-book key download, returning locked book and unlocked library states explicit.
- Browse actual notes, files and saved answers with compact expandable previews, deterministic title/tag search and type filters.
- Keep add/upload actions clear; place manual answer metadata and recovery settings behind secondary controls. Clear library content, search and counts when locked or switched.
- Preserve opaque-frame storage, encryption, question/item channels and trusted extension contracts. No new modules, schema changes, AI categorization or automatic imports.

## 0.1.0a10

- Add optional exact-version item picker/channel with explicit approval after encrypted intent save, pinned folder snapshots and selected private uploads.
- Keep source IDs private; bound approved copies and support idempotent pending-intent reconstruction without duplicating attachments.
- Add provider-neutral local source import helper with stable identity, repeat no-op and immutable versions; imported prose remains unclassified.
- Clarify standalone downloads versus authenticated host grants and preserve existing encryption/question contracts.


## 0.1.0a9

- Optional versioned topic catalog and exact local entity/type/scope matching, with compact editable/removable chips on question cards.
- Unresolved, stale or conflicting facts leave the normal answer blank; no classifier, inferred topic availability or legacy fact promotion.
- Strict matching mode uses the existing named-recipient Send gesture with encrypted save first; old batch contexts retain their previous behavior.
- Reusing unchanged facts preserves their versions and scope; explicit edits update a unique matching record append-only. Canonical catalog JSON is packaged for host adapters.

## 0.1.0a8

- Optional generic batch question channel with bounded choices, private uploads, saved-answer provenance and explicit named-recipient release of selected answers/files.
- Trusted fixed in-frame panels can use encrypted generic records through revision-guarded saves; lock clears their visible content. No dynamic plugin loading or host access to private drafts.
- Existing storage/single-question protocols and encrypted format remain unchanged. Added opaque-browser, transport, file-limit and lifecycle gates. Host-specific goals, marketplace selection and delivery remain outside this package.

## 0.1.0a7

- Optional hosted text-question channel with private saved-answer suggestions and explicit exact-answer release.
- Encrypted save before approval, named recipient confirmation, scope/version/expiry checks and idempotent retry contract.
- Added transport and browser acceptance; ciphertext storage protocol and cryptography unchanged.

## 0.1.0a6

Make the hosted client read as a private book inside its host card: remove the standalone header, foreground personal/business information, add chapter navigation to existing information, files and saved-answer sections, and reveal/focus the opened book after creation, unlocking and restoration. Keep recovery/export controls secondary and preserve explicit recovery acknowledgement. The encrypted v1 format, storage bridge, deterministic matching and standalone application behavior are unchanged. No automatic agent sharing or independent security audit is implied.

## 0.1.0a5

Add a separate full-page hosted client with an opaque sandbox, strict ciphertext-only parent bridge, personal/business account scopes, atomic ETag integration, recovery download acknowledgement before creation, failure/conflict input retention and scope clearing. Reuse the canonical v1 vault cryptography and local saved-answer matcher. Include synthetic protocol and sandboxed-browser tests and the embedding/security contract. The standalone loopback application remains unchanged. Hosted owner authentication and storage are implemented by the integrating host; team key sharing and automatic agent intake are not included. No independent audit or site deployment is claimed by this package.

## 0.1.0a4

Add client-only saved-answer lookup with a small explicit label vocabulary, exact subject/task boundaries, reusable scope, latest-version provenance and visible age/ambiguity review. Explicitly selected answers fill the local form; unchanged saved fills retain source entry/version metadata. Context changes and manual edits clear derivation. Sharing remains separately selected, and encrypted format v1 is unchanged. Includes matcher, static-asset and browser acceptance coverage. No hosted integration or site deployment.

## 0.1.0a3

Correct Passport attribution to Steven Ochs and Tollbench in package metadata, citation, notices and the UI. Runtime behavior is unchanged. Earlier released artifacts remain immutable.

## 0.1.0a2

Correct the PyPI publishing action pin to the verified release commit. Runtime behavior unchanged from 0.1.0a1. The first GitHub alpha was not published to PyPI.

## 0.1.0a1

Initial standalone reference alpha: local encrypted information and files, recovery/export/import, exact-field release packages, optional question labels, loopback-only UI server, tests, packaging and public-project attribution. No Toll Bench integration, hosted account/storage, CRM/list workflows, goals or action packs.
