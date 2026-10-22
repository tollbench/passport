# Hosted Passport client and bridge v1

The hosted client is a separate entry point, `web/hosted.html`. It imports the same
`vault.mjs` and `answers.mjs` as the standalone application. The standalone loopback
server and UI remain unchanged. This is a whole-snapshot integration component;
publication, deployment and independent security review are separate gates.

## Required embedding boundary

The authenticated host embeds the full-page client with exactly
`sandbox="allow-scripts allow-downloads"`. **Do not add `allow-same-origin`.** The
frame has an opaque origin; host scripts cannot read its DOM, keys or plaintext.
Serve `hosted.html`, `hosted.mjs`, `hosted-bridge.mjs`, `vault.mjs`, `answers.mjs` and
`style.css` as static files. Current hosted builds also import `question-channel.mjs`, `question-answer.mjs`, `question-batch-channel.mjs`, `question-batch.mjs`, `topic-catalog.mjs`, `topic-editor.mjs`, `item-selection.mjs`, `item-share-channel.mjs` and `item-picker.mjs`. Package resources also include `request-types.json` for host catalog checks and `local-import.mjs` for trusted local import adapters. Update this allowlist before installing a new release; optional channel absence does not eliminate its module imports. Module responses require
`Access-Control-Allow-Origin: *` because the frame's origin is opaque. Serve the
page over HTTPS (loopback is suitable for development). These assets contain no
credentials and must not require cookies. Apply a response CSP including
`frame-ancestors` restricted to the authorized host. Retain the document's strict
CSP: no connections, embedded objects, forms or base URL changes. Do not inject owner data or arbitrary scripts into the frame. Reviewed fixed addon modules follow the explicit trust boundary in [PANELS.md](PANELS.md). Form actions and confirmation dialogs are
implemented within the frame without granting navigation or modal permissions.

The host and assets are trusted software. A malicious host can replace the
client, remove sandbox protection or impersonate its UI; sandboxing does not
protect against a compromised delivery/update channel. A compromised device or
extension can inspect unlocked information. JavaScript memory cannot be reliably
zeroized. No independent audit or production certification is claimed.

## Wire contract

`hosted-bridge.mjs` exports `PROTOCOL`, `validateReady`, `validateInit`,
`validateRequest`, `validateResult` and `validateEnvelope`. Validators return a
boolean and reject extra properties. `connectHost(window, {timeout: 30000})`
returns `{scopes, scope, request(op, scope, payload), close()}` after initialization.
All envelopes use the existing encrypted `passport-vault-v1` format.

1. The frame sends `{protocol: "passport-hosted-v1", type: "ready", nonce}`.
   `nonce` is a fresh UUID. This public challenge is the only wildcard message
   before initialization; no information is attached.
2. The host verifies `event.source === iframe.contentWindow` and
   `event.origin === "null"`. It replies with the exact fields
   `{protocol, type: "init", nonce, capability, scopes, scope}`. `capability` is a
   fresh random token of 32–128 ASCII letters, digits, underscores or hyphens.
   `scopes` is a unique nonempty subset of `["personal", "business"]`; `scope` is
   one of those entries. The host authorizes those scopes for the signed-in owner.
3. The frame accepts initialization only from `parent`, with its matching nonce
   and an HTTP(S) parent origin. It pins that origin and capability. Later init
   messages are ignored. The frame offers its own scope selector; there are no
   host-initiated scope changes or information-request messages.
4. Requests have exact fields `{protocol, type: "request", nonce, capability,
   id, op, scope}`. `id` is a fresh UUID. `op` is `load`, `save` or `delete`.
   `save` adds `expectedEtag` (opaque nonempty printable ASCII, at most 256
   characters, or null for create) and `envelope`. `delete` adds a nonnull
   `expectedEtag`. `load` adds nothing. Quotes in HTTP ETags are allowed.
5. Replies have `{protocol, type: "result", nonce, capability, id, op, scope,
   ok: true}` plus: `load` has `etag` and `envelope`, both null if absent or both
   nonnull; `save` has a nonnull `etag`; `delete` has `etag: null`.
   Failure replies instead have `ok: false` and `error`, one of `conflict`,
   `unauthorized`, `unavailable`, `invalid`, or `quota`, with no other payload.

The host validates every request's source, opaque origin, nonce, capability,
schema and owner scope before accessing its authenticated API. It correlates
replies exactly. Do not reflect arbitrary payloads, stack traces or server error
bodies. The frame additionally checks parent source, pinned origin, nonce,
capability, ID, operation, scope and response schema. Timeout rejects an operation;
late replies and replays cannot complete another operation. A capability is an
in-page transport token, **not server authorization**.

## Storage responsibilities and UX

The host API authorizes the owner on **every** load, save and delete. It validates
the same envelope shape, enforces quotas and atomically checks opaque ETags.
Creation must fail if a snapshot already exists. Save and delete fail on an
unexpected ETag. Scope selection alone does not grant membership or access.
Never send a recovery file, raw key, plaintext record, answer or file across the
bridge; never log any of those values. The server stores only encrypted envelopes
and routing/version metadata. Authentication and ciphertext visibility do not
prove that contents are authentic; Web Crypto authenticates during unlock.

Creation generates a random key and requests its recovery download **before**
any persistent write. The owner explicitly acknowledges saving that file before
creation proceeds. A browser cannot verify that the downloaded file was safely
retained. Existing recovery files unlock after reload. Backup restore requires a
backup and its matching recovery file and confirms replacement of an existing
snapshot. From a13, these are two explicit file selections: choosing the backup
reveals a visible recovery-file control and Cancel restore. No programmatic
picker is launched after reading the first file. The pending backup is bound to
its original scope and ETag; wrong or mismatched recovery files cannot write, and
replacement still requires confirmation and the original storage version. Cancel,
lock, scope change, reload, save, creation and deletion clear the pending backup. Keys remain in frame memory. Lock and scope changes clear forms,
suggestions, previews and references to decrypted contents. Switching an unlocked
vault asks before discarding unsaved input; an in-flight operation blocks switches.

Failures and conflicts never report a successful save and preserve form input.
A timeout can mean the server committed without an acknowledgement. Reload the
saved snapshot and unlock before retrying; a conflicting snapshot is never
silently overwritten. Reload warns that drafts will be cleared. Exported backups
contain the last confirmed saved snapshot, not unsaved drafts. Keep a separate
backup and recovery file. Removal cannot revoke existing exported copies or
promise erasure from operator backups.

Personal and business are separate encrypted snapshots owned by the current
account. **This component does not implement team key distribution, business
membership sharing.** Saved-answer suggestions stay
local and require explicit selection. Selected file sharing produces independently encrypted downloads. The optional
[question channel](QUESTION_CHANNEL.md) separately supports one host-bound text
answer, only after an explicit owner confirmation. It is not automatic sharing.

## Verification

`node --test tests/*.test.mjs` covers protocol shape, tampered fields, wrong
source/origin/nonce/capability, response correlation, timeouts and late replies,
as well as existing vault/answer behavior. `python tests/browser_hosted.py` uses
Playwright and a temporary loopback synthetic host. It verifies actual opaque
sandbox isolation, recovery-before-persist, notes/files/answers/reuse, encrypted
persistence and selected export, failure/conflict input retention, scope consent
and clearing, restore/delete isolation, reload recovery, ciphertext tampering and
wrong-key rejection, no keys/plaintext in bridge/storage, CSP connection blocking
and mobile layout. Set `PASSPORT_CHROME` to an installed Chromium executable if
needed. No production services, model calls or paid providers are involved.

Copyright 2026 Steven Ochs and Tollbench. Apache-2.0.

The optional question channel adds `question-channel.mjs` and `question-answer.mjs` to the hosted asset list. See [its contract](QUESTION_CHANNEL.md) for the separate plaintext release boundary.

## Optional disclosure channels

Storage v1 stays ciphertext-only. Separate [assigned-question](QUESTION_CHANNEL.md), [batch-question](BATCH_CHANNEL.md) and [selected-item](ITEM_SHARING.md) channels release only owner-approved copies. Their capability handshake is not server authorization. Hosts bind exact recipient/task scope, validate ownership, implement idempotent delivery and enforce revocation/expiry where their grant service supports it. See [TOPIC_MATCHING.md](TOPIC_MATCHING.md) for local deterministic autofill; it never authorizes disclosure.

## Information library

The hosted client has explicit `data-book-state` UI states: `loading`, `error`,
`empty` (no saved snapshot), `recovery` (new key download awaiting acknowledgement),
`locked` and `open`. These are local presentation state, not a new host protocol.
A missing or failed load never enables creation. If the initial connection fails,
the UI asks the user to reopen the book or refresh the page; a failed storage
request with a connected host offers Reload saved book.

The returning-book screen explains that `passport-recovery.json` is the original
key and shows only fixed descriptions of what a book can hold. It exposes no
private titles, tags, counts or previews. The unlocked library renders real saved
records, excluding entries owned by registered extension panels. Search performs
case-insensitive substring matching on each latest title and its explicit tags;
notes/files/answers filters use the existing latest-version kind. No embeddings,
AI inference, external search or automatic source import is involved. File content
is not searched. Empty and no-match states are distinct.

Record previews expand inside the isolated frame. Existing exact-selection
sharing and remove semantics are preserved. `Add information` opens the note
editor; upload remains in the library action row. The manual answer form and
recovery/export settings are collapsed. Active question, batch and item requests
retain focus priority. Fixed registered panels keep the existing mount, refresh,
focus and encrypted-save contract. Search, item DOM and counts are cleared on
lock and scope changes; closing the embedding frame destroys that context.

This release changes hosted presentation only. Host-specific goals, action packs,
agent operation, contacts/CRM and deployment policy are not part of this public UI.

### Unlock feedback

The locked screen names the currently selected Personal or Business book. An
embedded host URL's initial scope does not override a later in-frame selection;
storage requests remain bound to their explicit validated scope.

Unlock reads the selected file locally. Its JSON format identifies an encrypted
backup versus a recovery file, and its vault ID identifies a different book's
recovery file. These cases show specific recovery-file instructions. A failed
local decrypt does not report a host write timeout or suggest that a write may
have happened. Unlock sends no storage request. Cancellation is a no-op, and the
file input resets on every attempt so the same file can be selected again.
No recovery key or file is persisted by this change; trusted-device unlocking
remains a separate unimplemented capability.

New hosted downloads use `passport-personal-recovery.json` or
`passport-business-recovery.json`, and `passport-personal-encrypted-backup.json`
or `passport-business-encrypted-backup.json`. The scope is the only variable in
these filenames. Existing generic or renamed files remain valid: JSON format and
vault identity, not filenames, determine compatibility. Standalone names remain
unchanged because that client has no Personal/Business scope.
