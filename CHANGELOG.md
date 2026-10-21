# Changelog

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
