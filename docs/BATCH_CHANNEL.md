# Optional batch question channel

Version 0.1.0a8 adds `passport-question-batch-v1`, separate from the unchanged
storage and single-question channels. `question-batch-channel.mjs` exports its
strict validators and `connectBatchHost`; `question-batch.mjs` owns the editor.
Hosts that do not initialize this optional channel retain the ordinary book.

## Private work, then explicit disclosure

The authenticated host binds a Personal or Business book, owner-specific subject,
exact task/question versions, named recipient and a readable `purpose` describing
all action side effects. Text, single choice, multiple choice and yes/no questions
are supported. Unknown or missing labels never penalize an agent. Saved text
suggestions are matched locally by exact subject/task and known labels. Dated or
ambiguous matches require review. For unknown/missing labels, text questions can
offer an exact question-text match (case/whitespace normalization only), with the
same owner/task boundaries and mandatory manual selection. No fuzzy match or
classifier is used. Provenance remains encrypted in the book.

Each question accepts private uploads. Review first saves meaningful answers,
files and an approval candidate through the existing encrypted storage channel.
Files are never parsed into facts. Uploads are not shared by default. The owner
selects individual files, sees the exact answers, filenames, byte counts and MIME
types, then explicitly sends to the named recipient. A file-only text answer gets
visible draft text listing attached filenames; the owner reviews that text too.
An empty selected batch is permitted only through the same explicit action review.

The confirmation explains that the host and recipient can read and retain the
released copy. Other records, candidate IDs, provenance and keys are excluded.
Cancel keeps the saved information private. A failed encrypted save blocks release.
Lock, scope changes and edited saved versions invalidate approval. A timed-out
attempt can retry the identical approval and payload to recover its receipt;
expiry never authorizes a new write. The host must enforce this transactionally.

## Frozen wire contract

Context exact keys: `requestId`, `token`, `scope`, `subject`, `taskId`, `purpose`,
`recipient:{id,name}`, `questions`, `expiresAt`. Each question has exact keys
`id,digest,title,format,label,options`; each option has `value,label`. Formats are
`short_answer`, `written_response`, `single_choice`, `multiple_choice`, `yes_no`.
Yes/no values are strings `yes`/`no`; choice values are signed option strings;
multiple choice is an array of unique option strings; text is a string.

The handshake uses ready/init with a fresh nonce and 64-hex capability, pins the
actual parent window and origin, and correlates receipts. A release has exact
keys `protocol,type,nonce,capability,id,token,approvalId,answers`. Each answer is
`{id,value,files}` and each file is `{name,type,data}` with canonical base64 data.
No recipient override or raw vault record ID is accepted. Receipt fields follow
the single-question channel with this protocol identifier. Init waits 10 seconds;
release waits 30 seconds. Host HTTP timeouts must be shorter.

Limits: 16 questions, 50 options/question, option value 100 characters, option
label 200, question title/purpose 500, answer text 2000. Released files: at most
3 total, 2 MiB each, 5 MiB combined; filenames at most 1024 characters and MIME
at most 256. Zero-byte files are permitted. Filenames reject path separators and
control characters; MIME uses safe type/subtype tokens, defaulting to
`application/octet-stream`. Base64 must round-trip canonically. Larger private
uploads remain subject to the ordinary vault limits and cannot be released here.

## Host responsibilities and limits

The server must authenticate the owner, require CSRF protection, bind every
context fact and its action purpose, recheck current state under appropriate
locks, and write delivery plus its idempotent receipt atomically. Store selected
files with authenticated named-recipient access, safe download headers and
quotas; never publish them as general task attachments or execute/preview them.
Do not log answers, tokens or filenames. Reject workflows that would fan out to
other agents. Recipient-specific history must remain private under reassignment.
Client validation is not server authorization. Revocation cannot recall a copy
already disclosed. This package is not independently security audited.

`tests/question-batch.test.mjs` and `tests/browser_batches.py` cover the public
contract, private save/release separation, file bounds, stale revisions, opaque
frame messaging, mobile review and trusted-panel lifecycle. Hosts must test
their actual authorization, concurrency, delivery and UI adapters separately.

In a9, an optional [matching context](TOPIC_MATCHING.md) enables deterministic
local entity/topic chips and direct on-card Send. The legacy context retains the
flow above. Strict matching mode never uses the old label/exact-text fallback.
