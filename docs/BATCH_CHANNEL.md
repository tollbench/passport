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
Do not log answers, tokens or filenames. Reject disclosure to recipients absent from the signed context. A shared
context must bind each question to its exact current recipient set and recheck
that set before atomic delivery; never infer recipients from display names. Recipient-specific history must remain private under reassignment.
Client validation is not server authorization. Revocation cannot recall a copy
already disclosed. This package is not independently security audited.

`tests/question-batch.test.mjs` and `tests/browser_batches.py` cover the public
contract, private save/release separation, file bounds, stale revisions, opaque
frame messaging, mobile review and trusted-panel lifecycle. Hosts must test
their actual authorization, concurrency, delivery and UI adapters separately.

In a9, an optional [matching context](TOPIC_MATCHING.md) enables deterministic
local entity/topic chips and direct on-card Send. The legacy context retains the
flow above. Strict matching mode never uses the old label/exact-text fallback.

## Optional per-question recipients

The next compatible client exports `BATCH_RECIPIENTS_VERSION = 1`. A host can
supply `recipients:[{id,name}]` on **every** question. Each list contains 1–32
unique opaque recipient IDs; duplicate display names remain separate and the
editor disambiguates them with IDs. Mixed per-question/global audiences are
rejected. This extension permits up to 64 questions; unchanged single-recipient
contexts retain the 16-question bound and global `recipient` behavior.

The global recipient remains a readable group heading in shared contexts. Each
question displays its actual audience, and shared contexts always show a final
review of included answers, their audiences and selected files, including when
local topic matching is active. Cancel saves privately. The owner must explicitly
send. Local topic/entity/format matching, removable topics and private provenance
are unchanged; no classifier, network lookup or permission inference is added.

The signed host token must bind these exact IDs, question versions and actions.
Release payloads remain unchanged: only the token, approval ID and selected
answers/files cross the channel. A client cannot replace the recipient list.
The host implements its own membership policy, transaction locks, authorization,
copy quotas and exact retry receipts. No implicit future-recipient grant exists.
Private saved approval provenance includes the per-question audiences but is not
released. Older clients reject the extension; hosts must check the capability
marker before enabling it. Storage, encryption and single-question protocols are
unchanged.
