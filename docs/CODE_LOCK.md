# Book code (6 digits)

One Passport book opens with a 6-digit code, like a phone. The recovery file stays as the backup.

## How it works

1. **In the browser.** The code is stretched with PBKDF2-SHA256 (600,000 rounds) and a random per-book salt. HKDF splits the result into `auth` and `kekPart`. The code itself never leaves the isolated page.
2. **On the server** (`toll_passport.code_lock`, used by a host through a small storage adapter). The server keeps:
   - a verifier, `HMAC-SHA256(pepper, auth)`, bound to the account, book and vault ID;
   - a random 32-byte share `S`, sealed at rest (HMAC-SHA256 keystream plus a separate HMAC tag, bound to account, book and vault ID);
   - the book key wrapped under `W = HKDF(kekPart || S)` with AES-GCM;
   - the salt (not secret), tries used, a disabled flag and a per-minute window.
   The pepper and the at-rest key live in a `0600` file outside the database (`toll-passport code-key /absolute/path` creates one). The host points to it with `PASSPORT_CODE_KEY_FILE`.
3. **Unlock.** The browser sends `auth`. The server compares in constant time. Right: tries reset and the server returns `S` and the wrapped key. Wrong: one try is used. The 10th wrong try turns the code off. At most 5 tries per minute per book; a refused-for-speed try does not count. The browser needs both `kekPart` and `S` to unwrap the book key.
4. **Turned off or forgotten.** The recovery file opens the book. Setting a new code (the book must be open in the browser) replaces the verifier, share and wrapped key and resets the tries.

## Staying open

After an unlock the book key is wrapped by the existing nonextractable device key in IndexedDB. The wrapper is bound to the owner binding, the parent origin and a **login nonce** the host issues once per login session. A new login, or a logout, gives a new nonce, so the old wrapper no longer fits and the code is asked again. **Lock** deletes this login's wrapper and tells other tabs to close the book.

## One book

`personal` is the one book's storage scope. Personal and Business are labels inside it (`labels: {book: 'business'}` on entry versions). An older Business book moves in inside the browser the first time it can be opened there (an older "Remember this device" wrapper, or its recovery file). Every entry and version is copied with the Business label, a hidden `book-merge` marker records the move, and the old Business ciphertext is left untouched on the host.

## Honest trade-off

- A copy of the database **alone** cannot test codes: the verifier needs the pepper and the share is sealed.
- Someone holding **both** the database and the key file can test all one million codes offline and bypass the 10-try limit. The browser's PBKDF2 stretching slows that down; it does not stop it. The book key still needs `kekPart`, which only a right code produces, but with both files a right code can be found.
- A host operator who changes the served code can capture a code as it is typed, as with any web app.
- A future step is to keep the server half on a separate machine or a hardware security module, so the database host never holds the key file.

## Reference

- Python: `toll_passport.code_lock` (`CodeLock`, `CodeRecord`, `MemoryStore`, `load_key_file`, `write_key_file`). Standard library only. The caller commits counters on refusals too.
- Browser: `code-lock.mjs` (derivation, wrapping, door calls), `book-session.mjs` (`codeStatus`, `unlockWithCode`, `createBook`, `setCode`, `unlockWithRecoveryFile`), `code-entry.mjs` (six-box entry), `book-merge.mjs`.
- Bridge ops (`passport-hosted-v1`): `code-status`, `code-unlock` (`auth` only), `code-set` (sealed record only). Refusals carry `error` (`wrong`, `disabled`, `no-code`, `rate`) and `attemptsLeft`.
