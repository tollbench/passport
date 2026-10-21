# Optional hosted question channel

The hosted book can answer one host-supplied text question. This is a separate,
optional `passport-question-v1` channel. The existing `passport-hosted-v1`
storage protocol and encrypted document format are unchanged. A host that does
not implement this channel continues to work as an ordinary book.

## Owner flow

1. The host supplies an authenticated, task-bound request with a named recipient
   and a Personal or Business scope. The owner opens that book with their key.
2. The client searches the unlocked book locally. Exact subject/task and known
   label matches are candidates. One current unambiguous answer can fill the
   private draft; dated or multiple candidates require selection. Legacy generic
   subjects are never silently rebound. Unknown/missing labels allow a manual
   answer without penalty. No model/classifier is called.
3. Review saves the answer to the encrypted book first. The default is this task;
   the owner may explicitly remember it for future tasks about the same subject.
   A failed save prevents release. The draft, candidate IDs and provenance remain
   inside the opaque frame. Uploaded files do not become answer facts.
4. A confirmation displays the exact answer, question and recipient, and explains
   that the host and recipient can read and retain the released copy. Only the
   explicit Send action sends that answer. Cancelling leaves the saved answer
   private. Other entries, keys and filenames never enter the question channel.
5. The host returns a receipt. An unconfirmed attempt retains the same approval
   identifier for retry. After expiry only a previously attempted identical
   answer/approval can ask the host to recover its existing receipt; the host
   must refuse a new expired write.

## Contract and host responsibilities

`question-channel.mjs` exports strict validators and `connectQuestionHost`.
`question-answer.mjs` owns the private editor and persisted-version approval.
Serve both public modules with the other hosted assets. The host implements the
question listener before starting the child iframe.

- Child `ready`: protocol, type, fresh UUID nonce.
- Host `init`: protocol, type, nonce, fresh 64-hex capability, context or null.
- Context: requestId, opaque signed token, scope, opaque owner-bound subject,
  taskId, question `{id,digest,title,format}`, recipient `{id,name}`, optional
  label, expiresAt. Only `short_answer` and `written_response` are supported.
- Child `release`: protocol, type, nonce, capability, request id, signed token,
  approvalId and answer (1–2000 characters). No caller-selected recipient,
  subject, vault entry ID, files or metadata are accepted.
- Host `receipt`: protocol, type, nonce, capability, correlated id, and either
  `ok:true,receiptId` or `ok:false,error` from the bounded error vocabulary.

Both sides pin the actual window source; the child pins the host origin, and the
host accepts only the opaque child's `null` origin. Nonce/capability and request
correlation reject stale, unsolicited or duplicated replies. The initialization
wait is 10 seconds and release wait is 30 seconds; host HTTP deadlines should be
shorter. Closing, locking or changing book invalidates local approval. An old
async completion cannot restore it.

The host must derive owner, subject, task, question version/digest and recipient
from authenticated records. Agent-provided labels grant no access. Bind and
verify these facts, expiry and exact answer on every release; serialize ordinary
answers with releases; store an idempotent receipt transactionally with delivery.
Never fan a released answer out to other recipients through shared context.
Return only bounded errors, require session/CSRF authorization, and do not log
answers, tokens or vault contents. Stable recipient assignment or equivalent
recipient-aware history controls are required. Client validation does not replace
server authorization.

There is no automatic sharing, public tag cloud, team key distribution or
independent security audit. The host can read an explicitly released answer;
that copy is outside the encrypted vault and cannot be recalled by deleting the
vault. Host application code and its contact/goals/marketplace features are not
part of this public package.

## Verification

Node tests cover exact schema, local matching, failed persistence, immutable
version approval, scope/lock invalidation, expiry retry, window/origin/capability
checks, timeouts and late replies. `tests/browser_questions.py` uses installed
package resources and a synthetic loopback host: private prefill, actual visible
question focus, failed save, cancel/approve, changed-question refusal, exact
release, encrypted storage, and mobile layout. CI runs it alongside ordinary
hosted and standalone acceptance. A real host must additionally test its own
adapter, authorization, transaction concurrency and native navigation.
