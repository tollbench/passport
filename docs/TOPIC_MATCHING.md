# Deterministic topic matching on question cards

The optional a9 matching context adds a small static catalog, local entity
selection and editable topic chips to the existing opaque batch editor. It does
not inspect archive contents from the host, classify text with a model, infer
availability, learn aliases or expose a tag cloud. The host's ordinary question
and agent remain valid when an optional hint is absent or unknown.

## Catalog and wire context

`web/request-types.json` is the packaged canonical machine-readable export:
`{version:1,catalogVersion:"1",requestTypes:[descriptors]}`. Each descriptor has
`requestType,label,entityKind,topic,valueType,supportedFormats`. The public module
exports the identical frozen registry as `TOPIC_CATALOG`; a parity test prevents
JSON drift. Hosts should load the installed resource instead of copying a second
registry. Version 1 contains eleven specific types, including distinct person
food preferences, pet diet, organization/project audiences and project podcast
preferences. Broad browsing tags are never matching keys.

The existing batch context may add exactly:

```json
{
  "matching": {
    "version": 1,
    "catalogVersion": "1",
    "allowedRequestTypes": ["project.podcast_preferences"],
    "requests": [
      {"questionId": "q1", "requestType": "project.podcast_preferences"}
    ]
  }
}
```

There must be exactly one request per signed question. Its type is null or a
known allowed descriptor compatible with the question format. The host chooses
a permitted static subset using explicit workflow policy, never private-record
counts or guessed want semantics. An agent may choose one of those descriptors;
its choice grants no data access and cannot identify a private local entity.
Unknown, conflicting or unsupported producer hints are normalized to null by the
host. Old `question.label` remains advisory in this mode and is not an alias or
fallback matcher. There is no automatic promotion of old answers.

The host signs the immutable question/context and keeps all existing recipient,
owner, task, expiry, CSRF and idempotency checks. Owner chip changes affect only
private classification, never signed questions or server authorization. Release
and ciphertext protocols are unchanged; no entity IDs, topic corrections or
source record IDs are added to release payloads.

## Local identity and matching

An owner chooses a local person, pet, organization or project inline, or creates
one once in a collapsed private form. Entity records use generic encrypted
`passport.entity` entries with `{entityKind,name}`. IDs and names never leave the
opaque book through this feature. A Personal or Business book is not an inferred
entity. Two entities with the same display name remain distinct.

Classified answer fields include
`classification:{catalogVersion,entityId,requestType,topic,valueType,answerFormat,taskBinding}`.
The task binding is `{scope:"task",taskId}` by default, or an explicitly chosen
`{scope:"reusable"}` for future tasks about that exact entity/topic/type. The
owner/book subject remains separately exact. Matching examines only each
record's latest version. A single eligible current match may fill the editable
answer. Multiple records, missing identity, type/format mismatch, future dates,
answers over 180 days old or unknown topics leave it blank. Choices require the
same format and exact option value/label list. No fuzzy or question-text fallback
runs in matching mode. Unclassified files never become inferred facts.

## The existing human loop

The topic is a compact selectable chip beside an accessible remove button.
The local entity picker is beside it; source date/version/question details are
collapsed. Removing/changing an association clears untouched automatic text.
Human edits remain. Removing a tag leaves them unclassified. Explicitly choosing
a valid replacement topic and entity classifies retained human text without
replacing it. Invalid/incomplete replacements remain unclassified. No separate
review queue, classification modal or extra approval action is added.

The existing named-recipient Send button is the disclosure gesture. Its card
shows the action purpose, included answers, individually selected files and who
can read the copy. Send freezes the editor, saves encrypted information, verifies
persisted versions, then sends only the selected payload. Save failure or changed
context blocks release and retains the draft. Ordinary old batch contexts keep
their a8 review behavior. File-only generated attachment text is unclassified.

Unchanged reuse preserves the exact source fact/version and scope. Files added
for that question are separate encrypted `answer_material` records. Question and
fact references remain in encrypted `answer_batch` history. A manual classified
answer with exactly one existing record for the same complete classification and
task binding appends a version; exact unchanged content preserves the version.
Zero matches creates a fact. Multiple distinct records are never silently merged
or resolved: an explicit new manual answer is saved separately and automatic
matching remains blank. Original records and versions are preserved.

## Compatibility and host integration

Encrypted format v1 and old contexts remain readable. a8 rejects the new exact
context shape; hosts must gate it on a9 capabilities. Before installing a9, admit
`topic-catalog.mjs` and `topic-editor.mjs` in the fixed hosted asset allowlist,
even for old-context books; admit/package `request-types.json` for the canonical
catalog route. These are fixed reviewed resources, not an arbitrary plugin loader.
No database migration is needed for the generic encrypted fields. Host catalog
permissions and producer adapters belong to the host; the harness stays minimal.

Tests cover JSON parity, entity/topic/type/scope isolation, ambiguity/age, legacy
non-promotion, append-only versions and duplicate prevention, plus actual opaque
mobile/desktop chip removal/replacement, inline private creation, direct Send,
failed persistence and absence of pre-send plaintext. Existing standalone,
ordinary-book, single-question and old-batch acceptance remain release gates.
