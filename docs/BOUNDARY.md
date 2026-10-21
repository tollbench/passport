# Public Passport boundary

Passport supplies private information storage, encryption, recovery, portability and explicit selection of information to share. A standalone reference UI must remain usable without a Toll Bench account. Contact details and opaque application-owned fields can be stored as data.

Toll Bench owns the separate application implementations: contact-book/CRM workflows and lists, goals and supporting goals, action packs/cards and recurrence, departments, agent operations, heats/proposals, marketplace payments and reputation. Those sources are not copied into Passport. The Apache license covers only included Passport files; this boundary does not attempt to restrict what others may independently build under that license.

The current alpha is a local browser vault. It is not the full hosted architecture. The separately authorized [hosted client component](HOSTED.md) now provides a sandboxed ciphertext-only bridge using the same public format and cryptography. Its host adapter supplies authentication, owner authorization, atomic storage and quotas; those are outside the standalone server. Publication and deployment remain separate from the existing standalone release. The following are outstanding integration gates:

- Owner-device recovery/unlocking UX beyond bearer recovery files; passkey support and fallback.
- Owner-encrypted item storage and a ciphertext-only storage service with authentication, quotas and restore tests.
- Independent origin/update threat review; embedding must not expose keys to host scripts.
- Verified recipient identity and bounded grant delivery; opaque recipient strings in exported files do not implement authorization.
- Business membership and cryptographic key distribution, rotation and departure handling.
- Reviewed migration of legacy server-readable contacts/files; no retroactive privacy claims or silent deletion.
- Versioned package consumption, integration tests and update PRs. No duplicated source fork and no automatic production deployments.

Reference snapshot format v1 encrypts the whole book for simplicity. Moving to independently stored item envelopes requires a new version with migration; do not claim v1 already provides partial server-side fetch or cloud revocation. Existing Toll Bench duplicate-outreach repair remains separate proprietary work.
