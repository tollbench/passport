# Changelog

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
