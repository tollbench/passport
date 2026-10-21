# Trusted fixed panels inside the book

`hosted.mjs` exports `registerPanel({id,label,mount})`. A host may include a
reviewed, fixed module in its opaque hosted page to add its own private-book UI.
This is not a dynamic plugin loader: no user URL or arbitrary script source is
accepted. Host-specific goals, contacts, marketplace and workflow code remain
outside the public Passport project.

`mount` receives `{root,getState,save,run}`. `getState()` returns
`{document,scope}` while unlocked and a null document while locked. It does not
return the key. `save(next,expected)` requires exact
`expected:{vaultId,revision,scope}` from the state read before editing. It seals
and persists through the existing storage channel and rejects stale revisions,
lock/scope changes or asynchronous completions for an obsolete book. `run(fn)`
uses the book's busy/error UI. Generic format-v1 records and exports are unchanged.

The returned controller may implement `refresh()`, `focus()`, `ownsEntry(entry)`,
`activate()` and `deactivate()`. Refresh runs on book lifecycle changes; the core
also clears panel DOM synchronously on lock. `ownsEntry` hides that panel's
records from the generic information listing only; encrypted exports retain all
records. Chapter navigation activates the chosen panel and deactivates others.
An initial `#panel-ID` anchor is resolved only against a registered panel, once,
after unlock. Active question requests take focus priority.

An addon runs inside the unlocked frame and therefore can see decrypted records.
It must be trusted and reviewed as part of the client, despite not receiving the
key through this API. It must not send document contents to the parent/network,
retain private drafts across lock, or use arbitrary module loading. Hosts must
keep CSP, opaque sandboxing, explicit disclosures and fixed asset allowlists.
This API is an integration boundary, not isolation from a malicious addon.

Copyright and attribution remain Steven Ochs and Tollbench under Apache-2.0 for
the public implementation. A host's proprietary addon is not included or
relicensed by this package.
