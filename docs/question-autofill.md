# Deterministic question autofill

A host may supply a public requestType from the versioned catalog. No tag means no topic match. The client does not infer tags from prose, files, entity names, embeddings or model calls.

Inside the unlocked isolated client, one entity of the declared kind plus one compatible eligible saved fact fills an empty answer automatically. Multiple entities or competing facts require explicit choice. Manual edits and deliberate clearing prevent later automatic replacement. The source chip lists the original question, version and date, allows explicit source selection, and can clear the answer. A formerly automatic source is withdrawn when it becomes ambiguous or ineligible. An explicitly selected current source remains selected even if another fact exists.

Matching checks owner subject, actual entity id, catalog type, value type, answer format, optional exact contextKey, task/reusable binding and the existing review-age limit. Choice labels and values must be exactly equal in the same order. Old facts without contextKey remain general; they never match a context-specific request.

The optional contextKey uses [a-z][a-z0-9_.-]{0,79}. Context request records can carry that field in addition to questionId/requestType. No private entity identifiers are supplied by agents or sent back to the host.

Hosts may group explicitly equivalent questions and supply bounded originals containing only agent display name and question title. They must preserve exact signed recipients and expand approved answers only to those bindings. Topic alone is insufficient to establish equivalence. The app integration uses optional questionKey plus contextKey, format, options and requestType; unrelated wording is not analyzed.

Autofill is not release. Matching-enabled batches display each question's recipients and use one Send button. The existing private save must succeed before approved answers can cross the channel. Unselected book contents, keys, sources and private entity metadata never cross it. Remember-for-future remains an explicit choice. Lock/scope change clears the editor.

This release does not add device key persistence, unlock other frames, turn notes into typed facts, infer tags for historical questions, or map synonymous choice labels. Existing recovery-file and isolated-frame boundaries remain.

Validation: Node contract tests; synthetic browser_topics and browser_autofill; non-matching browser_batches regression. Host implementations must additionally test scope routing, stale snapshots and exact recipient expansion.
