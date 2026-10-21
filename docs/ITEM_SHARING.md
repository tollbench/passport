# Selected item copies for an authenticated host

Passport's optional `passport-item-share-v1` channel is a generic encrypted-client
picker and explicit disclosure boundary. It is not a grant authority. A host such
as Tollbench supplies authenticated recipient/scope context and implements its
own grants, downloads, expiry, revocation, quotas and audit records. Proprietary
flows, operators, goals and CRM features are not included in this package.

## Owner flow

The unlocked book lists supported notes and files locally. Choose fields and files,
then preview the exact pinned versions. A named recipient, purpose, access scope,
access expiry, file names, types and byte counts are visible. File contents are not
executed or embedded as active previews. One **Approve sharing** action saves an
encrypted pending intent before releasing the approved copy. Save failure blocks
disclosure. Unknown/unsupported fields remain private, with no truncation.

Uploads save into the encrypted book first. Eligible new files are preselected in an exact preview ready for one approval; oversized files remain private with a visible explanation. They do not automatically become facts or grant access. Folder creation stores an explicit collection of entry IDs and
versions; selection expands that fixed snapshot. Nested folders, cycles, duplicate
members and missing versions are rejected. Later members and versions are not
included. Each member still needs an explicitly selected field or file; metadata-only
releases are not supported.

## Frozen channel contract

`item-share-channel.mjs` exports `ITEM_PROTOCOL`, `validateItemContext`,
`validateItemReady`, `validateItemInit`, `validateItemRelease`,
`validateItemReceipt` and `connectItemHost`. Optional mounting in `hosted.mjs`
does not modify the ciphertext storage or existing question channels.

Context is exactly:

```js
{requestId, token, scope, recipient:{id,name}, accessScope:{id,label}, purpose,
 expiresAt, grantExpiresAt, limits:{maxItems,maxFileBytes,maxTotalBytes}}
```

`expiresAt` bounds creation of a new approval; `grantExpiresAt` describes the
approved access expiry. Both are milliseconds since the epoch. Host-signed
context must bind the actual owner/company, exact recipient and permitted scope.
Client labels, a task query parameter or a private entity ID never confer authority.
The initial token does not pin the vault head: saving an intent advances it.

The handshake uses exact parent source/origin, a fresh nonce and host capability,
with the same opaque-frame lifecycle as the other optional channels. Release:

```js
{protocol:'passport-item-share-v1', type:'release', nonce, capability, id,
 token, approvalId, savedRevision, manifestDigest,
 items:[{id,sourceVersion,title,kind,fields,files:[{name,type,data}]}]}
```

Member `id` is a fresh opaque UUID for this approved copy; original vault/entry IDs
and local folder references never leave the frame. Selected title, kind, version,
field names and file metadata are deliberate disclosures visible in the preview.
Only `note` and `file` kinds are supported. Connector/credential records are not
pickable. This is not automatic secret detection inside free text: owners must
not put service keys in shared notes. Use a separate credential connector.

Selected `fields` are string values only, with ASCII keys matching
`^[A-Za-z][A-Za-z0-9_.-]{0,99}$`. Reserved internal/provenance fields are excluded.
Complex/numeric values and lone Unicode surrogates are rejected. The manifest
is recursively key-sorted JSON, compact separators, UTF-8, Unicode unescaped;
`manifestDigest` is its lowercase SHA-256. All other keys are fixed protocol names,
source versions are positive safe integers, and arrays preserve selection order.
These restrictions make JavaScript and Python serialization agree without a
floating-point canonicalization library. `data` is canonical padded base64.

Hard ceilings: **50 members, 2 MiB per file, 5 MiB for the entire canonical UTF-8
items array, including base64 and metadata**. Context may lower those limits.
Storage still permits 25 MiB private files subject to the 100 MiB encrypted vault
quota. An oversized private file remains private; this channel is not streaming.

Successful receipt:

```js
{protocol,type:'receipt',nonce,capability,id,ok:true,grantId,receiptId}
```

Error receipt replaces `grantId,receiptId` with `error` and `ok:false`; errors are
`invalid`, `unauthorized`, `conflict`, `expired`, `unavailable`, or `quota`.

## Save acknowledgement and host obligations

The child saves an encrypted `passport.share-intent` record before sending. It
contains local pinned references, selected field/file indices, opaque member IDs,
context binding and digest—not duplicate file bodies. Receipt versions are small.
Retries reconstruct approved bytes from immutable source versions. Missing or
changed source/context invalidates approval. Reloaded pending intents require a
fresh same-session encrypted save before a new release attempt.

The parent must match `savedRevision` to its latest successful encrypted save
acknowledgement in this same frame session and book scope, then attach the server
ETag from that acknowledgement. It must never accept a child-supplied ETag. The
server revalidates that current head under its owner/account transaction lock,
the signed owner/scope/recipient, manifest digest, limits and approval idempotency.
A receipt lookup must not create an expired or different grant. An uncertain
network result retains the same approval and bytes for retry. If a restored request has expired, it cannot create a new grant; use the host’s grant list or exact receipt lookup to resolve a previous uncertain attempt. Expiry does not prove the prior attempt failed.

Every later read requires recipient, company and flow/scope authorization plus
expiry/revocation checks. Lists must be bounded and expose only permitted manifests.
**Stop sharing blocks future host reads; it cannot erase copies already downloaded
or present in a model context.** Grant listing/revocation UI is a host addon, not
part of this generic picker. The host can read deliberately released plaintext;
it cannot derive other vault contents from this protocol.

## Local source imports

`local-import.mjs` exports `importRecords(document,records)`, returning a new
validated document and created/updated/unchanged counts. It does not persist or
fetch anything; a trusted local panel must call the guarded encrypted `save` hook.
Each input is `{source,title,text,files}`, where source has exact keys
`{namespace,externalId,revision,digest,url,modifiedAt}`. Digest covers canonical
`{title,text,files}`. Up to 100 records per call; existing vault quotas still apply.
Namespace plus external ID supplies stable identity; unchanged digest is a no-op,
changed source appends a version, duplicate identities or owner-edited/conflicting
records fail without mutating the input document. Changed imports refuse locally added tags, custom fields or classifications instead of dropping or silently carrying them forward. An unchanged source is a no-op that preserves local enrichment. Older changed-source timestamps are rejected. Original source URL/date/revision stays encrypted.

Provider-specific fetching and conversion (including Notion) belong outside this
public library. Imported prose remains an unclassified note. No facts, preferences,
goals or agent work are inferred. Existing deterministic question matching only
uses owner-classified facts with exact identity/topic/type/scope and valid versions.

## Compatibility and trust

Hosts must allow `item-selection.mjs`, `item-share-channel.mjs`, `item-picker.mjs`
and `local-import.mjs` before installing a10. The hosted client imports the first
three even when the optional context is absent. Enable the host feature only after
package/capability checks and authenticated integration fixtures. Old ciphertext,
legacy package exports and a9 question behavior are unchanged. The standalone
server remains a loopback-only app, not a remote grant server.

A trusted addon can read unlocked records; the panel API is not a sandbox against
malicious addon code. Keep reviewed fixed modules, CSP and the opaque frame.
Functional fixtures do not constitute independent security certification.

Copyright 2026 Steven Ochs and Tollbench. Apache-2.0.
