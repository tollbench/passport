# Security policy

## Supported release

0.1.0a3 is an experimental local reference alpha. It has automated adversarial-input and isolation tests but no independent cryptographic or penetration audit. Do not describe it as production-certified or use it as the only copy of important data.

## Threat boundary

Browser Web Crypto encrypts a whole vault snapshot using AES-256-GCM, a fresh 96-bit nonce per seal and authenticated format/vault/revision metadata. Private titles, fields, tags and file bytes are inside ciphertext. Keys are randomly generated in the browser and deliberately exportable for recovery. IndexedDB contains only ciphertext envelopes. The loopback Python server serves static files, has no data/key endpoint and no request logging. Its strict Host allowlist and content security policy reduce unintended origin/network access.

An attacker who acquires only the encrypted backup lacks its decryption key. The owner must protect the recovery file and device. This implementation does not protect against malicious extensions, an unlocked/compromised device, a malicious software update, screenshots, copied plaintext or a recipient redistributing released information. JavaScript memory cannot be reliably zeroized. Encryption hides content, not encrypted size, origin storage existence or download timing.

Version authentication detects tampering but cannot detect replay of an older valid backup. Local optimistic concurrency prevents overwriting an unexpected snapshot; it is not distributed synchronization. The same browser origin can access the vault. Never serve untrusted scripts on that origin. The server is deliberately loopback-only and is not an authenticated cloud service.

## Recovery and release files

Recovery JSON contains an unencrypted bearer key. Back it up separately and securely. Lost keys cannot be reset. Clearing browser storage without an encrypted export loses the data even if the recovery file survives. Restoring requires both files.

Release packages use independent random keys and explicit field selection. Recipient and purpose metadata are labels, not proof of identity or enforced use restrictions. There is no expiration or remote revocation. Previously exported snapshots, released copies, downloads, device backups and browser remnants are outside local deletion. Received files are downloaded as attachments, never rendered as HTML under the vault origin; opening downloaded files remains the recipient's responsibility.

## Reporting

Use the repository's private GitHub vulnerability reporting facility when enabled: https://github.com/tollbench/passport/security/advisories/new . Do not post real keys, private vault data or exploitable vulnerability details in public issues. If private reporting is unavailable, open a public issue asking only for a private contact method, without vulnerability details. Maintainers should enable private reporting before inviting sensitive reports.
