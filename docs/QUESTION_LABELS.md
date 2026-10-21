# Optional question metadata and saved answers

A producer may add a small, specific label while producing a question, without a second classification call. Send the vocabulary needed by the task, not the owner's private tag inventory. Labels are suggestions: missing, unfamiliar or misspelled labels never reject an answer or affect agent scores.

```json
{"question":"Which audience should this target?","label":"audience","subject":"project:example","scope":"task","taskId":"task:example"}
```

Adapters may receive an agent suggestion such as `passport: {"key": "audience"}` and map that key to `context.label`. Subject, task reference and reuse scope come from the owner’s trusted client context; an agent label must never choose another subject or expand reuse scope. No adapter should infer an identifier from a display name.

The unlocked client can find previous answers using the deterministic `findAnswerCandidates(document, context, {now})` export in `web/answers.mjs`. It makes no model or network calls. Its vocabulary is intentionally small:

| Canonical label | Accepted aliases (case insensitive, surrounding whitespace ignored) |
| --- | --- |
| `founder_bio` | `founder bio`, `founder biography` |
| `audience` | `target audience` |
| `pitch_angle` | `pitch angle` |
| `contact_preference` | `contact preference`, `preferred contact method` |
| `project_details` | `project details` |

Broad labels such as `about_you`, `about_business`, `preferences` and `contact_information` remain valid storage hints, but never identify interchangeable answers. Unknown or missing labels produce no candidates; the user can still save an answer normally. No fuzzy matching or category expansion occurs.

`subject` is an opaque reference, compared exactly and case sensitively. The producer and user must use the same unique reference for the same person, business or project. A display name or matching label does not establish identity. Task answers additionally require the exact same nonempty `taskId` and a task-scoped request. Only a saved answer explicitly marked `scope: "reusable"` can be suggested across tasks; task answers never become reusable implicitly. Task-scoped lookup requires a task reference even when a reusable answer may exist. Older task answers without that reference remain readable, shareable by explicit selection and editable by the existing core API, but are excluded from lookup.

Only the latest version of each `kind: "answer"` entry participates. New answers store metadata under existing generic `fields` (`question`, `answer`, `label`, `subject`, `scope`, and optional `taskId`), with no encryption or document-format change. For older entries without a `fields.label`, exactly one recognized answer label among their tags may identify the answer type. Several distinct recognized labels prevent matching. An explicitly unknown or empty `fields.label` does not fall back to tags.

Candidates contain only the answer text, provenance (entry ID, version, saved date, source question, canonical label, subject, scope and task reference where applicable), and review reasons. Multiple matches are flagged rather than choosing a winner. Answers older than 180 days or dated in the future are flagged for review; this is a visible heuristic, not an expiry or a guarantee of accuracy. Results are ordered by newest saved date, then entry ID. Callers can supply a fixed numeric `now` for deterministic tests.

The standalone form displays **Use a saved answer** only for matching context. Every candidate shows its original question, date, version and review warnings. **Use this answer** fills the local form for review; saving remains explicit. An unchanged selection saved privately records `fields.reusedFrom: {entryId, version}`. Manually editing the answer clears this derivation and its source note. Changing context also clears the derivation and an untouched filled answer. Unknown labels and task answers without a task reference still save normally. Locking or changing the vault clears suggestions and source notes.

Matching never changes the document, grants access, selects a release, attaches files or shares information with an agent. Answer text and suggestions exist only in unlocked browser memory until the user explicitly saves an encrypted vault update. Sharing still requires explicit approval. The optional [hosted question channel](QUESTION_CHANNEL.md) can bind one request to this local lookup and release only the selected answer; the label itself never authorizes access.
