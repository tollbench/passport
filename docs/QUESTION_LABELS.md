# Optional question metadata

Suggested producer shape, independent of any agent scoring system:

```json
{"question":"Which audience should this target?","label":"audience","subject":"project:example","scope":"task"}
```

Suggested labels: `about_you`, `about_business`, `audience`, `preferences`, `contact_information`, `project_details`. Applications may map a narrower field such as `founder_bio` to a category. Send only the small generic vocabulary needed by the task, not the owner's private tag inventory.

A producer adds this metadata while producing the question, without a second classification call. Labels are optional suggestions. Missing, unfamiliar or misspelled labels never fail a task, reject an answer or affect agent scores. The reference UI accepts optional free text and normalizes tags; its core validates storage shape but does not grade semantic correctness.

Applications may deterministically normalize known aliases. Match candidate reusable answers by label, subject and scope on an unlocked trusted client; confirm conflicts or stale answers. A matching label never grants sharing permission, identifies a person uniquely or changes a task answer into a permanent preference. Selection/release is always explicit. Agent/harness integration is not implemented in this standalone alpha.
