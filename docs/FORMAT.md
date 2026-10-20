# Passport format version 1

All JSON uses UTF-8. Binary values use canonical standard base64. The implementation validates allowed fields, types, identifiers, sizes and versions before accepting imported data.

Vault envelope fields: `format` (`passport-vault-v1`), `vaultId` (UUID), `revision` (positive integer), `nonce` (12 bytes), `ciphertext` (AES-GCM output including the 16-byte authentication tag). AES-256-GCM additional authenticated data is the UTF-8 JSON encoding of `[format,vaultId,revision]`. Every seal uses a fresh random nonce. Keys come from Web Crypto random key generation, not user-chosen passwords.

Decrypted document: `format` (`passport-document-v1`), `vaultId`, `revision`, `entries`. Entries have UUID `id` and an immutable `versions` array. Each version contains `version`, ISO `createdAt`, `kind`, `title`, `fields`, `tags`, `files`. Files contain `name`, `type`, base64 `data`. All of these descriptive fields are encrypted. Revisions are authenticated but do not provide anti-replay protection.

Recovery file: `format` (`passport-recovery-v1`), matching `vaultId`, and raw 32-byte base64 `key`. It is an unencrypted bearer secret. It is never included inside a backup envelope or persisted by the reference server.

A sharing selection identifies entry ID, exact version, field names, recipient and purpose. Ordinary field names select those fields only. `$title`, `$kind`, `$tags` and `$files` explicitly select those additional values; `$files` selects all files in that record version. Split files into separate records to share them individually in this alpha. The selected plaintext has format `passport-release-v1` and authenticated provenance. It is encrypted under an independent random key using outer format `passport-release-envelope-v1`, a fresh UUID and revision 1. Its recovery file unlocks only that release.

No key reuse between the vault and a release. A release carries no access to unselected information. Its recipient string is descriptive; verified recipient encryption, online grants, expiration and revocation are not part of format v1.

The reference core is `src/toll_passport/web/vault.mjs`. APIs are asynchronous create/seal/unlock/exportRecovery/encryptRelease/decryptRelease, plus synchronous immutable addEntry/removeEntry/selectRelease/validateDocument. Code examples and tests must use synthetic data. Changes to wire meaning require a new format identifier and migration tests.
